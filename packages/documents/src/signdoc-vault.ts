import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { trackSafely } from "@coadvisor/analytics";
import type { ProductEventName } from "@coadvisor/analytics";
import {
  assertEnvelopeQuota,
  BILLING_PLANS,
  computeTenantUsage,
  getPlan,
  resolveEffectivePlan,
} from "@coadvisor/billing";
import { recordAudit } from "@coadvisor/core-platform";
import { addTimelineEntry } from "@coadvisor/crm";
import { withSystemContext, withTenantContext } from "@coadvisor/database";
import type { DbContext, Prisma } from "@coadvisor/database";
import { sendEmail } from "@coadvisor/notifications";
import {
  configureSigndocRuntime,
  type SignedCopyDeposit,
  type SignedCopyReceipt,
} from "@coadvisor/signdoc";

import { renderPdf } from "./reports/pdf";
import { getObjectStorage } from "./storage/resolver";

// ─────────────────────────────────────────────────────────────
// ADAPTATEUR CoAdvisor → Signdoc (ADR-012)
//
// Signdoc est autonome ; ICI on câble ses ports sur l'infra
// CoAdvisor : audit immuable (core-platform), chronologie CRM,
// courriels (notifications), coffre chiffré + partage portail
// (ce module documents), moteur PDF des rapports (certificat).
// Une installation standalone câblerait les mêmes ports
// différemment — jamais l'inverse.
// ─────────────────────────────────────────────────────────────

/**
 * Verse la copie finale d'une enveloppe close au coffre chiffré :
 * nouvelle pièce Document (original JAMAIS modifié), octets au
 * stockage, partage PORTAL automatique aux liens actifs du dossier
 * — toutes les parties peuvent télécharger (Sprint 7c, incl. refus).
 */
async function depositSignedCopyToVault(
  copy: SignedCopyDeposit,
): Promise<SignedCopyReceipt> {
  const storage = getObjectStorage();
  const signedDocumentId = randomUUID();
  const storageKey = `${copy.tenantId}/${signedDocumentId}.enc`;

  await withSystemContext(async (tx: DbContext) => {
    await tx.document.create({
      data: {
        id: signedDocumentId,
        tenantId: copy.tenantId,
        clientId: copy.clientId,
        uploadedById: copy.requestedById,
        category: copy.category as Prisma.DocumentCreateInput["category"],
        label: copy.label,
        originalFilename: `enveloppe-${copy.envelopeId}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: copy.bytes.length,
        sha256: copy.sha256,
        contentTag: "",
        storageKey,
      },
    });
  });

  try {
    const stored = await storage.put(
      Readable.from(Buffer.from(copy.bytes)),
      storageKey,
    );
    await withSystemContext(async (tx) => {
      await tx.document.update({
        where: { id: signedDocumentId },
        data: { contentTag: stored.contentTag },
      });
      if (copy.autoShareToPortal) {
        // Tous les liens portail ACTIFS du dossier (couple compris)
        // voient la copie close — signée ou constatant le refus.
        const links = await tx.clientPortalLink.findMany({
          where: { clientId: copy.clientId, status: "ACTIVE" },
          select: { id: true },
        });
        if (links.length > 0) {
          await tx.documentShare.create({
            data: {
              tenantId: copy.tenantId,
              documentId: signedDocumentId,
              channel: "PORTAL",
              createdById: copy.requestedById,
            },
          });
        }
      }
    });
  } catch (error) {
    await withSystemContext(async (tx) => {
      await tx.document.update({
        where: { id: signedDocumentId },
        data: { status: "DELETED", deletedAt: new Date() },
      });
    });
    await storage.remove(storageKey);
    throw error;
  }

  return { documentId: signedDocumentId };
}

/**
 * Câble les ports Signdoc sur l'infra CoAdvisor — exécuté à
 * l'import (serveur) : toute page/action qui touche la signature a
 * importé ce module via l'index de @coadvisor/documents. Idempotent.
 */
/**
 * Pont audit → événements produit (Sprint 8, ADR-014) : UN SEUL point
 * d'instrumentation pour les trois canaux de signature (portail,
 * bureau, externe) — le funnel lira props.envelopeId dédoublonné.
 */
const SIGNDOC_EVENT_MAP: Record<string, ProductEventName> = {
  "documents.signature.envelope.requested": "signature.envelope_sent",
  "documents.signature.envelope.resent": "signature.envelope_resent",
  "documents.signature.signer.signed": "signature.signed",
  "documents.signature.signer.declined": "signature.declined",
};

async function bridgeSigndocProductEvent(
  tx: DbContext,
  record: Parameters<typeof recordAudit>[1] & { tenantId: string },
): Promise<void> {
  const name = SIGNDOC_EVENT_MAP[record.action];
  if (!name) return;
  await trackSafely(tx, {
    tenantId: record.tenantId,
    app: "web-advisor",
    actorKind: record.actorUserId ? "STAFF" : "EXTERNAL",
    actorId: record.actorUserId,
    name,
    props: { envelopeId: record.entityId },
  });
}

export function ensureCoAdvisorSigndocRuntime(): void {
  configureSigndocRuntime({
    audit: async (tx, record) => {
      await recordAudit(tx, record);
      await bridgeSigndocProductEvent(tx, record);
    },
    // Plafond d'enveloppes du palier (Sprint 8 — monétisation, ADR-013).
    envelopeQuota: async (actor) => {
      await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
        const plan = await resolveEffectivePlan(
          tx,
          actor.tenantId,
          (code) => getPlan(code) ?? BILLING_PLANS.decouverte,
          BILLING_PLANS.decouverte,
        );
        assertEnvelopeQuota(plan, await computeTenantUsage(tx, actor.tenantId));
      });
    },
    timeline: async (tx, tenantId, entry) => {
      await addTimelineEntry(tx, tenantId, entry);
    },
    mailer: async (mail) => {
      await sendEmail(mail);
    },
    readObject: async (storageKey, contentTag) =>
      getObjectStorage().readAll(storageKey, contentTag),
    renderCertificateBlocks: async (input) =>
      renderPdf({
        title: input.title,
        subtitle: input.subtitle,
        blocks: input.blocks,
        footerNote: input.footerNote,
        engineTag: input.engineTag,
      }),
    depositSignedCopy: depositSignedCopyToVault,
  });
}

// Câblage automatique côté serveur (RSC/actions/route handlers) —
// un paquetage "librairie" n'a pas de types DOM : détection runtime.
declare const window: unknown;
if (typeof window === "undefined") {
  ensureCoAdvisorSigndocRuntime();
}
