import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { addTimelineEntry } from "@coadvisor/crm";
import { withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import type { DocumentsActor, RequestMeta } from "../actor";

export const CLIENT_EXPORT_VERSION = "ciaexport-1.0";

/**
 * Export complet des données d'un client (Loi 25 — accès/portabilité).
 * Un seul JSON structuré, assemblé en lecture confinée RLS au tenant ;
 * la génération est auditée (métadonnées + volumes) et tracée à la
 * chronologie du dossier. Permission : `compliance:read`.
 */
export async function exportClientData(
  actor: DocumentsActor,
  clientId: string,
  meta: RequestMeta = {},
): Promise<{ fileName: string; json: string }> {
  requirePermission(actor.role, "compliance:read");

  const bundle = await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId },
      include: {
        familyMembers: { orderBy: { createdAt: "asc" } },
        timelineEvents: { orderBy: { createdAt: "asc" } },
        notes: { orderBy: { createdAt: "asc" } },
        tasks: { orderBy: { createdAt: "asc" } },
        assets: true,
        liabilities: true,
        incomes: true,
        expenses: true,
        insurancePolicies: true,
        financialGoals: true,
        retirementPlan: true,
        financialContext: true,
        healthAssessments: {
          orderBy: { createdAt: "asc" },
          include: { insights: true, progress: true },
        },
        portalLinks: true,
        copilotArtifacts: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            kind: true,
            content: true,
            structured: true,
            provider: true,
            model: true,
            composerVersion: true,
            fellBack: true,
            latencyMs: true,
            generatedBy: true,
            createdAt: true,
          },
        },
      },
    });
    if (!client) {
      throw new ValidationError("Ce dossier client est introuvable.");
    }

    // Pièces du coffre : métadonnées uniquement (pas de binaires dans
    // l'export — chaque fichier reste téléchargeable au coffre).
    const documents = await tx.document.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        category: true,
        label: true,
        originalFilename: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        status: true,
        createdAt: true,
        deletedAt: true,
      },
    });
    const signatures = await tx.documentSignature.findMany({
      where: { document: { clientId } },
      orderBy: { requestedAt: "asc" },
      select: {
        id: true,
        documentId: true,
        status: true,
        signingMode: true,
        requestedAt: true,
        expiresAt: true,
        signedAt: true,
        cancelledAt: true,
        declinedAt: true,
        proofSha256: true,
        signers: {
          orderBy: { sortOrder: "asc" },
          select: {
            kind: true,
            email: true,
            fullName: true,
            status: true,
            signerName: true,
            signedAt: true,
            consentText: true,
            ipAddress: true,
            declineReason: true,
          },
        },
      },
    });

    const { advisorId: _advisorId, ...clientWithoutAdvisorId } = client;
    const { tenantId, ...clientWithoutInternalIds } = clientWithoutAdvisorId;

    const exportObject = {
      exportVersion: CLIENT_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: actor.userId,
      legalNote:
        "Export des renseignements personnels du dossier (Loi 25, accès et portabilité). Les binaires du coffre documentaire ne sont pas inclus — ils restent téléchargeables individuellement.",
      client: clientWithoutInternalIds,
      vault: {
        documents,
        signatures,
      },
    };

    const json = JSON.stringify(exportObject, null, 2);

    await addTimelineEntry(tx, tenantId, {
      clientId,
      eventType: "COMPLIANCE",
      title: "Export des données du dossier (Loi 25)",
      description: `Fichier JSON complet — ${documents.length} pièce(s) référencée(s).`,
      source: "SYSTEM",
      createdBy: actor.userId,
    });

    await recordAudit(tx, {
      tenantId,
      actorUserId: actor.userId,
      action: "compliance.client.exported",
      entityType: "Client",
      entityId: clientId,
      newData: {
        documentsCount: documents.length,
        notesCount: client.notes.length,
        healthSnapshotsCount: client.healthAssessments.length,
        bytes: json.length,
        exportVersion: CLIENT_EXPORT_VERSION,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { json, firstName: client.firstName, lastName: client.lastName };
  });

  const slug = `${bundle.lastName}-${bundle.firstName}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    fileName: `export-client-${slug}-${stamp}.json`,
    json: bundle.json,
  };
}
