import { Readable } from "node:stream";

import { recordAudit } from "@coadvisor/core-platform";
import { withSystemContext, withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import type { RequestMeta } from "../actor";
import { getObjectStorage } from "../storage/resolver";

export interface PortalDocumentRow {
  id: string;
  label: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  sharedAt: Date;
}

/**
 * Documents partagés PORTAL du particulier connecté (lien portail
 * ACTIVE requis — le consentement du lien couvre ce canal).
 */
export async function listPortalSharedDocuments(
  portalUserId: string,
): Promise<PortalDocumentRow[]> {
  const link = await withSystemContext(async (tx) =>
    tx.clientPortalLink.findFirst({
      where: { userId: portalUserId, status: "ACTIVE" },
      select: { tenantId: true, clientId: true },
    }),
  );
  if (!link) return [];

  return withTenantContext(link.tenantId, portalUserId, async (tx) => {
    const shares = await tx.documentShare.findMany({
      where: { channel: "PORTAL", revokedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        document: {
          select: {
            id: true,
            clientId: true,
            label: true,
            category: true,
            mimeType: true,
            sizeBytes: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
    return shares
      .filter(
        (share) =>
          share.document.status === "ACTIVE" &&
          share.document.clientId === link.clientId,
      )
      .map((share) => ({
        id: share.document.id,
        label: share.document.label,
        category: share.document.category as string,
        mimeType: share.document.mimeType,
        sizeBytes: share.document.sizeBytes,
        createdAt: share.document.createdAt,
        sharedAt: share.createdAt,
      }));
  });
}

/**
 * Téléchargement portail d'une pièce : partage PORTAL actif, OU
 * demande de signature REQUESTED à son nom (lecture avant signature).
 */
export async function preparePortalDocumentDownload(
  portalUserId: string,
  documentId: string,
  meta: RequestMeta = {},
) {
  const link = await withSystemContext(async (tx) =>
    tx.clientPortalLink.findFirst({
      where: { userId: portalUserId, status: "ACTIVE" },
      select: { tenantId: true, clientId: true },
    }),
  );
  if (!link) return null;

  const document = await withTenantContext(
    link.tenantId,
    portalUserId,
    async (tx) => {
      const row = await tx.document.findFirst({
        where: { id: documentId, status: "ACTIVE", clientId: link.clientId },
      });
      if (!row) return null;

      const portalShare = await tx.documentShare.findFirst({
        where: { documentId: row.id, channel: "PORTAL", revokedAt: null },
      });
      // Sinon : lecture permise si une enveloppe ouverte attend SA
      // signature (Sprint 7b — ligne signataire à son nom).
      const pendingSignature = portalShare
        ? null
        : await tx.signatureSigner.findFirst({
            where: {
              userId: portalUserId,
              kind: "PORTAL_USER",
              status: { in: ["PENDING", "SIGNED"] },
              signature: {
                documentId: row.id,
                status: { in: ["REQUESTED", "PARTIALLY_SIGNED", "SIGNED"] },
              },
            },
          });
      if (!portalShare && !pendingSignature) {
        throw new ValidationError(
          "Ce document n'est pas partagé avec votre espace.",
        );
      }

      await recordAudit(tx, {
        tenantId: link.tenantId,
        actorUserId: portalUserId,
        action: "documents.file.downloaded",
        entityType: "Document",
        entityId: row.id,
        newData: { via: "portal", label: row.label },
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
