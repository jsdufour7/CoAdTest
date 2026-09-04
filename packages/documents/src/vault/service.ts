import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { trackSafely } from "@coadvisor/analytics";
import { requirePermission } from "@coadvisor/auth";
import {
  assertVaultQuota,
  BILLING_PLANS,
  computeTenantUsage,
  getPlan,
  resolveEffectivePlan,
} from "@coadvisor/billing";
import { recordAudit } from "@coadvisor/core-platform";
import { addTimelineEntry } from "@coadvisor/crm";
import { withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import type { DocumentsActor, RequestMeta } from "../actor";
import { parseOrThrow } from "../actor";
import { gateUpload, MAX_UPLOAD_BYTES, sniffMagic } from "../mime";
import { getObjectStorage } from "../storage/resolver";
import { DOCUMENT_CATEGORY_LABELS, formatBytes } from "../labels";
import { uploadMetaSchema } from "./schemas";

/** Tampon d'en-tête lu AVANT streaming (sniffing magic bytes). */
export async function splitHeader(
  stream: Readable,
  bytes: number,
): Promise<{ header: Buffer; rest: Readable }> {
  const iterator = stream[Symbol.asyncIterator]();
  const buffered: Buffer[] = [];
  let collected = 0;
  while (collected < bytes) {
    const { value, done } = await iterator.next();
    if (done) break;
    const chunk = value as Buffer;
    buffered.push(chunk);
    collected += chunk.length;
  }
  const header = Buffer.concat(buffered).subarray(0, bytes);
  const rest = Readable.from(
    (async function* () {
      for (const chunk of buffered) yield chunk;
      let next = await iterator.next();
      while (!next.done) {
        yield next.value as Buffer;
        next = await iterator.next();
      }
    })(),
  );
  return { header, rest };
}

export interface UploadFileInput {
  fileName: string;
  declaredMime: string | null;
  /** Taille annoncée par le navigateur (File.size). */
  declaredSize: number;
  stream: Readable;
}

/**
 * Dépôt au coffre (FR) : sniffing magic-bytes → anti-exécutable →
 * chiffrement streaming → ligne `documents` + timeline + audit,
 * le tout audité en métadonnées (jamais de contenu).
 */
export async function uploadDocument(
  clientId: string,
  rawMeta: unknown,
  file: UploadFileInput,
  actor: DocumentsActor,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  const input = parseOrThrow(uploadMetaSchema, rawMeta);

  if (file.declaredSize > MAX_UPLOAD_BYTES) {
    throw new ValidationError(
      `Le fichier dépasse la limite de 50 Mo (${Math.ceil(
        file.declaredSize / (1024 * 1024),
      )} Mo reçus).`,
    );
  }

  const documentId = randomUUID();
  const storageKey = `${actor.tenantId}/${documentId}.enc`;
  const storage = getObjectStorage();

  // 1. Le dossier client doit exister AVANT de consommer le binaire,
  //    et le palier doit pouvoir encaisser le volume (Sprint 8 — quota
  //    coffre, ADR-013) : on coupe avant de chiffrer/stocker.
  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new ValidationError("Ce dossier client est introuvable.");
    }
    const plan = await resolveEffectivePlan(
      tx,
      actor.tenantId,
      (code) => getPlan(code) ?? BILLING_PLANS.decouverte,
      BILLING_PLANS.decouverte,
    );
    assertVaultQuota(
      plan,
      await computeTenantUsage(tx, actor.tenantId),
      file.declaredSize,
    );
  });

  // 2. Sniffing puis garde-fou (anti-exécutable, taille).
  const { header, rest } = await splitHeader(file.stream, 512);
  const magic = sniffMagic(header);
  const gate = gateUpload({
    fileName: file.fileName,
    declaredMime: file.declaredMime,
    sizeBytes: file.declaredSize,
    magic,
  });
  if (gate.blocked) {
    throw new ValidationError(gate.reason ?? "Fichier refusé.");
  }

  // 3. Chiffrement streaming → stockage.
  let stored;
  try {
    stored = await storage.put(rest, storageKey);
  } catch (error) {
    await storage.remove(storageKey);
    throw error;
  }

  if (stored.sizeBytes > MAX_UPLOAD_BYTES) {
    await storage.remove(storageKey);
    throw new ValidationError("Le fichier dépasse la limite de 50 Mo.");
  }

  // 4. Ligne + timeline + audit, transactionnels (audit = l'action gagne ou perd ensemble).
  try {
    return await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
      const document = await tx.document.create({
        data: {
          id: documentId,
          tenantId: actor.tenantId,
          clientId,
          uploadedById: actor.userId,
          category: input.category,
          label: input.label,
          originalFilename: file.fileName,
          mimeType: gate.resolvedMime,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          contentTag: stored.contentTag,
          storageKey,
        },
      });

      await addTimelineEntry(tx, actor.tenantId, {
        clientId,
        eventType: "DOCUMENT",
        title: `Document déposé : ${input.label}`,
        description: `${DOCUMENT_CATEGORY_LABELS[input.category]} — ${formatBytes(stored.sizeBytes)}`,
        source: "SYSTEM",
        createdBy: actor.userId,
      });

      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "documents.file.uploaded",
        entityType: "Document",
        entityId: document.id,
        newData: {
          clientId,
          label: document.label,
          category: document.category,
          sizeBytes: document.sizeBytes,
          mimeType: document.mimeType,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      // Mesure produit first-party (Sprint 8, ADR-014).
      await trackSafely(tx, {
        tenantId: actor.tenantId,
        app: actor.role === "CLIENT" ? "web-client" : "web-advisor",
        actorKind: actor.role === "CLIENT" ? "PORTAL" : "STAFF",
        actorId: actor.userId,
        name: "document.uploaded",
        props: { category: document.category, sizeBytes: document.sizeBytes },
      });

      return document;
    });
  } catch (error) {
    // Compensation : la ligne n'a pas vu le jour → purge du blob.
    await storage.remove(storageKey);
    throw error;
  }
}

/** Liste du coffre d'un dossier (pièces ACTIVE, plus récentes d'abord). */
export async function listClientDocuments(
  actor: DocumentsActor,
  clientId: string,
) {
  requirePermission(actor.role, "documents:read");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const documents = await tx.document.findMany({
      where: { clientId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    const signatures = await tx.documentSignature.findMany({
      where: { document: { clientId } },
      orderBy: { requestedAt: "desc" },
      include: {
        signers: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            kind: true,
            userId: true,
            email: true,
            fullName: true,
            sortOrder: true,
            status: true,
            signedAt: true,
            declineReason: true,
          },
        },
      },
    });
    const shares = await tx.documentShare.findMany({
      where: { document: { clientId } },
      orderBy: { createdAt: "desc" },
    });
    const latestSignatureByDocument = new Map(
      signatures.map((signature) => [signature.documentId, signature]),
    );
    const signaturesByDocument = new Map<string, typeof signatures>();
    for (const signature of signatures) {
      const list = signaturesByDocument.get(signature.documentId) ?? [];
      list.push(signature);
      signaturesByDocument.set(signature.documentId, list);
    }
    const sharesByDocument = new Map<string, typeof shares>();
    for (const share of shares) {
      const list = sharesByDocument.get(share.documentId) ?? [];
      list.push(share);
      sharesByDocument.set(share.documentId, list);
    }
    // Pièces déposées comme COPIE CERTIFIÉE d'une enveloppe (badge UI).
    const signedCopyIds = new Set(
      signatures
        .map((signature) => signature.signedDocumentId)
        .filter((id): id is string => id !== null),
    );
    return documents.map((document) => {
      const sharesOfDocument = sharesByDocument.get(document.id) ?? [];
      return {
        document,
        signatures: signaturesByDocument.get(document.id) ?? [],
        latestSignature: latestSignatureByDocument.get(document.id) ?? null,
        shares: sharesOfDocument,
        isSignedCopy: signedCopyIds.has(document.id),
        activeShareCount: sharesOfDocument.filter(
          (share) => share.revokedAt === null,
        ).length,
      };
    });
  });
}

/**
 * Prépare un téléchargement (vérifications + audit « lu »). Le flux
 * déchiffré est ouvert PAR la route appelante via `openStream()`.
 */
export async function prepareDocumentDownload(
  actor: DocumentsActor,
  documentId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:read");
  const document = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const row = await tx.document.findFirst({
        where: { id: documentId, status: "ACTIVE" },
      });
      if (!row) return null;

      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "documents.file.downloaded",
        entityType: "Document",
        entityId: row.id,
        newData: { label: row.label, category: row.category },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return row;
    },
  );
  if (!document) return null;

  const storage = getObjectStorage();
  return {
    document,
    openStream: (): Promise<Readable> =>
      storage.openRead(document.storageKey, document.contentTag),
  };
}

/** Retrait logique (+ purge physique du blob) — audité. Jamais muet. */
export async function softDeleteDocument(
  actor: DocumentsActor,
  documentId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");
  const storage = getObjectStorage();

  const deleted = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const document = await tx.document.findFirst({
        where: { id: documentId, status: "ACTIVE" },
      });
      if (!document) {
        throw new ValidationError(
          "Cette pièce est introuvable (déjà retirée ?).",
        );
      }
      await tx.document.update({
        where: { id: document.id },
        data: { status: "DELETED", deletedAt: new Date() },
      });

      await addTimelineEntry(tx, actor.tenantId, {
        clientId: document.clientId,
        eventType: "DOCUMENT",
        title: `Document retiré : ${document.label}`,
        source: "SYSTEM",
        createdBy: actor.userId,
      });

      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "documents.file.deleted",
        entityType: "Document",
        entityId: document.id,
        oldData: {
          label: document.label,
          category: document.category,
          sizeBytes: document.sizeBytes,
          sha256: document.sha256,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return document;
    },
  );

  // Purge physique APRÈS succès logique (best-effort : une relique
  // chiffrée est inerte, la prochaine purge la rattrapera).
  await storage.remove(deleted.storageKey);
  return deleted;
}

