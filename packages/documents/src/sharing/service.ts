import { createHash, randomBytes } from "node:crypto";

import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { addTimelineEntry } from "@coadvisor/crm";
import {
  withDocumentShareContext,
  withSystemContext,
  withTenantContext,
} from "@coadvisor/database";
import { sendEmail } from "@coadvisor/notifications";
import { ValidationError } from "@coadvisor/types";

import type { DocumentsActor, RequestMeta } from "../actor";

export const SHARE_LINK_TTL_DAYS = 7;

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Partage direct au portail particulier (boucle interne, sans lien). */
export async function shareToPortal(
  actor: DocumentsActor,
  documentId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const document = await tx.document.findFirst({
      where: { id: documentId, status: "ACTIVE" },
    });
    if (!document) {
      throw new ValidationError("Cette pièce est introuvable.");
    }

    // Le client doit avoir un accès portail actif, sinon le partage
    // serait invisible (boulet métier, signalé proprement).
    const portalLink = await tx.clientPortalLink.findFirst({
      where: { clientId: document.clientId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!portalLink) {
      throw new ValidationError(
        "Ce client n'a pas encore activé son portail — partagez-lui d'abord un code d'invitation (Santé financière).",
      );
    }

    const existing = await tx.documentShare.findFirst({
      where: { documentId, channel: "PORTAL", revokedAt: null },
    });
    if (existing) return { share: existing, alreadyShared: true };

    const share = await tx.documentShare.create({
      data: {
        tenantId: actor.tenantId,
        documentId,
        channel: "PORTAL",
        createdById: actor.userId,
      },
    });

    await addTimelineEntry(tx, actor.tenantId, {
      clientId: document.clientId,
      eventType: "DOCUMENT",
      title: `Document partagé au portail : ${document.label}`,
      source: "SYSTEM",
      createdBy: actor.userId,
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "documents.share.portal",
      entityType: "DocumentShare",
      entityId: share.id,
      newData: { documentId, label: document.label },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { share, alreadyShared: false };
  });
}

/** Partage par lien public horodaté (7 jours) — jeton affiché une seule fois. */
export async function createLinkShare(
  actor: DocumentsActor,
  documentId: string,
  options: {
    /** Origine publique (ex. https://coadvisor.ca) — l'URL finale est
     *  composée ici avec le jeton réel : `${publicBaseUrl}/partage/<token>`. */
    publicBaseUrl?: string | undefined;
    recipientEmail?: string | undefined;
  },
  meta: RequestMeta = {},
): Promise<{ shareId: string; token: string; expiresAt: Date }> {
  requirePermission(actor.role, "documents:write");
  const token = generateShareToken();
  const tokenHash = hashShareToken(token);
  const expiresAt = new Date(
    Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const { share, document } = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const documentRow = await tx.document.findFirst({
        where: { id: documentId, status: "ACTIVE" },
      });
      if (!documentRow) {
        throw new ValidationError("Cette pièce est introuvable.");
      }
      const shareRow = await tx.documentShare.create({
        data: {
          tenantId: actor.tenantId,
          documentId,
          channel: "LINK",
          tokenHash,
          expiresAt,
          createdById: actor.userId,
        },
      });

      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "documents.share.link_created",
        entityType: "DocumentShare",
        entityId: shareRow.id,
        newData: {
          documentId,
          label: documentRow.label,
          expiresAt: expiresAt.toISOString(),
          emailedTo: options.recipientEmail ? "(fourni)" : null,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return { share: shareRow, document: documentRow };
    },
  );

  const shareUrl = options.publicBaseUrl
    ? `${options.publicBaseUrl.replace(/\/$/, "")}/partage/${token}`
    : undefined;

  // Courriel facultatif (best-effort — jamais bloquant).
  if (options.recipientEmail && shareUrl) {
    try {
      await sendEmail({
        to: options.recipientEmail,
        subject: `Document partagé avec vous : ${document.label}`,
        text: [
          "Bonjour,",
          "",
          `Un professionnel de CoAdvisor partage avec vous le document « ${document.label} ».`,
          "",
          `Lien sécurisé (valide 7 jours) : ${shareUrl}`,
          "",
          "Ce lien est personnel et révocable. Si vous ne l'attendiez pas, ignorez ce courriel.",
          "",
          "— CoAdvisor (TwoDots.ca)",
        ].join("\n"),
      });
      await withSystemContext(async (tx) => {
        await recordAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "notification.email.sent",
          entityType: "DocumentShare",
          entityId: share.id,
          newData: { kind: "documents.share.link_email" },
        });
      });
    } catch {
      await withSystemContext(async (tx) => {
        await recordAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "notification.email.failed",
          entityType: "DocumentShare",
          entityId: share.id,
          newData: { kind: "documents.share.link_email" },
        });
      });
    }
  }

  return { shareId: share.id, token, expiresAt };
}

/** Révocation d'un partage (staff) — auditée. */
export async function revokeShare(
  actor: DocumentsActor,
  shareId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const share = await tx.documentShare.findFirst({
      where: { id: shareId, revokedAt: null },
    });
    if (!share) {
      throw new ValidationError(
        "Ce partage est introuvable (déjà révoqué ?).",
      );
    }
    await tx.documentShare.update({
      where: { id: share.id },
      data: { revokedAt: new Date() },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "documents.share.revoked",
      entityType: "DocumentShare",
      entityId: share.id,
      newData: { documentId: share.documentId, channel: share.channel },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return share;
  });
}

/** Liste des partages d'une pièce (affichage conseiller). */
export async function listDocumentShares(
  actor: DocumentsActor,
  documentId: string,
) {
  requirePermission(actor.role, "documents:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.documentShare.findMany({
      where: { documentId },
      orderBy: { createdAt: "desc" },
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// Côté PUBLIC (lien /partage/<token>) — contexte RLS dédié (GUC)
// ─────────────────────────────────────────────────────────────

export interface PublicShareView {
  shareId: string;
  tenantId: string;
  documentId: string;
  label: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  expiresAt: Date | null;
  firmName: string | null;
  storageKey: string;
  contentTag: string;
}

/**
 * Résout un lien public. La preuve RLS (haché du jeton en GUC)
 * fait tout le travail : ici, introuvable ⇒ expiré/révoqué/inexistant.
 */
export async function resolvePublicShare(
  token: string,
): Promise<PublicShareView | null> {
  const tokenHash = hashShareToken(token);
  const view = await withDocumentShareContext(tokenHash, async (tx) => {
    const share = await tx.documentShare.findFirst({
      where: { tokenHash },
    });
    if (!share) return null;
    const document = await tx.document.findFirst({
      where: { id: share.documentId },
    });
    if (!document) return null;
    return { share, document };
  });
  if (!view) return null;

  // Enrichissement « nom du cabinet » en contexte système, select
  // étroit (même règle que l'annuaire — ADR-009, pas de jointure publique).
  const firmName = await withSystemContext(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: view.document.tenantId },
      select: { name: true },
    });
    return tenant?.name ?? null;
  });

  return {
    shareId: view.share.id,
    tenantId: view.document.tenantId,
    documentId: view.document.id,
    label: view.document.label,
    mimeType: view.document.mimeType,
    sizeBytes: view.document.sizeBytes,
    sha256: view.document.sha256,
    expiresAt: view.share.expiresAt,
    firmName,
    storageKey: view.document.storageKey,
    contentTag: view.document.contentTag,
  };
}

/** Compteur d'accès + audit du téléchargement public (contexte système). */
export async function markPublicShareAccessed(
  share: PublicShareView,
  meta: RequestMeta = {},
): Promise<void> {
  await withSystemContext(async (tx) => {
    await tx.documentShare.update({
      where: { id: share.shareId },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    });
    await recordAudit(tx, {
      tenantId: share.tenantId,
      actorUserId: null,
      action: "documents.share.public_downloaded",
      entityType: "DocumentShare",
      entityId: share.shareId,
      newData: { documentId: share.documentId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
}
