import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { getLatestCopilotArtifact } from "@coadvisor/ai";
import { trackSafely } from "@coadvisor/analytics";
import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { addTimelineEntry } from "@coadvisor/crm";
import { withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import type { DocumentsActor, RequestMeta } from "../actor";
import { getObjectStorage } from "../storage/resolver";
import {
  COPILOT_DISCLAIMER,
  COPILOT_PDF_VERSION,
  dossierReportBlocks,
  fhiReportBlocks,
  markdownToBlocks,
  REPORT_FOOTER,
} from "./builders";
import type { DossierReportData, FhiReportData } from "./builders";
import { renderPdf } from "./pdf";
import type { PdfBlock } from "./pdf";

export type ReportKind = "FHI" | "DOSSIER" | "COPILOT";

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  FHI: "Bilan de santé financière",
  DOSSIER: "Dossier client — synthèse",
  COPILOT: "Bilan Copilot (validé)",
};

const monthToMonthly = (amount: string | number, frequency: string) =>
  Number(amount) *
  ({ WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, MONTHLY: 1, ANNUAL: 1 / 12 }[
    frequency
  ] ?? 1);

const money = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

async function assembleFhiData(
  actor: DocumentsActor,
  clientId: string,
): Promise<FhiReportData | null> {
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const latest = await tx.healthAssessment.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      include: {
        insights: { orderBy: [{ severity: "desc" }, { createdAt: "asc" }] },
      },
    });
    if (!latest) return null;

    const client = await tx.client.findFirst({
      where: { id: clientId },
      select: { firstName: true, lastName: true },
    });
    const advisor = await tx.tenantUser.findFirst({
      where: { userId: actor.userId, tenantId: actor.tenantId },
      select: { user: { select: { firstName: true, lastName: true } } },
    });
    const tenant = await tx.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { name: true },
    });

    return {
      clientFullName: client
        ? `${client.firstName} ${client.lastName}`
        : "Client",
      generatedAt: new Date(),
      score: latest.score,
      categoryScores: latest.categoryScores as Record<string, number>,
      insights: latest.insights.map((insight) => ({
        type: insight.type as FhiReportData["insights"][number]["type"],
        category: (insight.category ?? "BUDGET") as FhiReportData["insights"][number]["category"],
        severity: insight.severity as FhiReportData["insights"][number]["severity"],
        message: insight.message,
        recommendation: insight.recommendation ?? undefined,
      })),
      engineVersion: latest.engineVersion,
      advisorName: advisor
        ? `${advisor.user.firstName} ${advisor.user.lastName}`
        : "Conseiller",
      firmName: tenant?.name ?? "Cabinet",
    };
  });
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individuel",
  FAMILY: "Famille",
  CORPORATE: "Entreprise",
};
const CLIENT_STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Actif",
  ARCHIVED: "Archivé",
};
const RELATION_LABELS: Record<string, string> = {
  SPOUSE: "Conjoint·e",
  CHILD: "Enfant",
  PARENT: "Parent",
  DEPENDENT: "Personne à charge",
  OTHER: "Autre",
};

async function assembleDossierData(
  actor: DocumentsActor,
  clientId: string,
): Promise<DossierReportData | null> {
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId },
      include: {
        familyMembers: { orderBy: { createdAt: "asc" } },
        assets: true,
        liabilities: true,
        incomes: true,
        expenses: true,
      },
    });
    if (!client) return null;

    const latestFhi = await tx.healthAssessment.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      select: { score: true, createdAt: true },
    });
    const timeline = await tx.timelineEvent.findMany({
      where: { clientId, eventType: { in: ["LIFE_EVENT", "FINANCIAL_EVENT", "MEETING", "DOCUMENT", "GOAL"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { title: true, eventDate: true },
    });
    const advisor = await tx.tenantUser.findFirst({
      where: { userId: actor.userId, tenantId: actor.tenantId },
      select: { user: { select: { firstName: true, lastName: true } } },
    });
    const tenant = await tx.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { name: true },
    });

    const sumMonthly = (
      rows: Array<{ amount: unknown; frequency: string }>,
    ) =>
      rows.reduce(
        (total, row) => total + monthToMonthly(Number(row.amount), row.frequency),
        0,
      );
    const sumAll = (rows: Array<{ value?: unknown; balance?: unknown }>) =>
      rows.reduce(
        (total, row) => total + Number(row.value ?? row.balance ?? 0),
        0,
      );

    const financeTotals: Array<[string, string]> = [
      [
        "Situation nette estimée",
        money.format(sumAll(client.assets) - sumAll(client.liabilities)),
      ],
      ["Actifs déclarés", money.format(sumAll(client.assets))],
      ["Dettes déclarées", money.format(sumAll(client.liabilities))],
      ["Revenus mensuels (équivalent)", money.format(sumMonthly(client.incomes))],
      ["Dépenses mensuelles (équivalent)", money.format(sumMonthly(client.expenses))],
    ];

    return {
      clientFullName: `${client.firstName} ${client.lastName}`,
      clientType: CLIENT_TYPE_LABELS[client.type] ?? client.type,
      clientStatus: CLIENT_STATUS_LABELS[client.status] ?? client.status,
      email: client.email ?? null,
      phone: client.phone ?? null,
      createdAt: client.createdAt,
      advisorName: advisor
        ? `${advisor.user.firstName} ${advisor.user.lastName}`
        : "Conseiller",
      firmName: tenant?.name ?? "Cabinet",
      family: client.familyMembers.map((member) => ({
        name: `${member.firstName} ${member.lastName}`,
        relation: RELATION_LABELS[member.role] ?? member.role,
        birthDate: member.birthDate
          ? member.birthDate.toLocaleDateString("fr-CA")
          : null,
      })),
      financeTotals,
      latestFhiScore: latestFhi?.score ?? null,
      latestFhiAt: latestFhi
        ? latestFhi.createdAt.toLocaleDateString("fr-CA")
        : null,
      timelineHighlights: timeline.map(
        (event) =>
          `${event.eventDate?.toLocaleDateString("fr-CA") ?? "—"} — ${event.title}`,
      ),
      generatedAt: new Date(),
    };
  });
}

function slugifyLabel(kind: ReportKind, fullName: string): string {
  const base = fullName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${kind.toLowerCase()}-${base || "client"}`;
}

/**
 * Génère un rapport PDF, le chiffre au coffre (catégorie RAPPORT) et
 * consigne timeline + audit — un seul point d'entrée métier.
 */
export async function generateReport(
  kind: ReportKind,
  actor: DocumentsActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "documents:write");

  const today = new Date();
  let title: string;
  let subtitle: string | undefined;
  let blocks: PdfBlock[];
  let footerNote: string;
  let engineTag: string;
  let clientFullName: string;
  let reportLabel: string;

  if (kind === "FHI") {
    const data = await assembleFhiData(actor, clientId);
    if (!data) {
      throw new ValidationError(
        "Aucun calcul FHI n'existe encore pour ce client — lancez un calcul depuis « Santé financière » avant de générer le bilan.",
      );
    }
    const shaped = fhiReportBlocks(data);
    title = shaped.title;
    subtitle = shaped.subtitle;
    blocks = shaped.blocks;
    engineTag = shaped.engineTag;
    footerNote = REPORT_FOOTER;
    clientFullName = data.clientFullName;
    reportLabel = `Bilan santé financière — ${today.toLocaleDateString("fr-CA")}`;
  } else if (kind === "DOSSIER") {
    const data = await assembleDossierData(actor, clientId);
    if (!data) {
      throw new ValidationError("Ce dossier client est introuvable.");
    }
    const shaped = dossierReportBlocks(data);
    title = shaped.title;
    subtitle = shaped.subtitle;
    blocks = shaped.blocks;
    engineTag = shaped.engineTag;
    footerNote = REPORT_FOOTER;
    clientFullName = data.clientFullName;
    reportLabel = `Dossier client — synthèse — ${today.toLocaleDateString("fr-CA")}`;
  } else {
    const artifact = await getLatestCopilotArtifact(
      actor,
      clientId,
      "CLIENT_REPORT",
    );
    if (!artifact) {
      throw new ValidationError(
        "Aucun bilan Copilot n'a encore été généré — ouvrez la page Copilot et générez le bilan client d'abord.",
      );
    }
    const client = await withTenantContext(
      actor.tenantId,
      actor.userId,
      async (tx) => {
        const row = await tx.client.findFirst({
          where: { id: clientId },
          select: { firstName: true, lastName: true },
        });
        if (!row) throw new ValidationError("Ce dossier client est introuvable.");
        return row;
      },
    );
    clientFullName = `${client.firstName} ${client.lastName}`;
    title = "Bilan client — Copilot";
    subtitle = `Preparé pour ${clientFullName} · revu par le conseiller`;
    blocks = [
      {
        type: "paragraph",
        text: COPILOT_DISCLAIMER,
      },
      { type: "spacer", height: 8 },
      ...markdownToBlocks(artifact.content),
    ];
    engineTag = `${COPILOT_PDF_VERSION} · ${artifact.composerVersion} · ${artifact.provider} · pdfrender-1.0`;
    footerNote =
      "Document généré avec l'assistance du Copilot et validé par le conseiller — ne constitue pas un avis financier réglementé. Conservez-le en lieu sûr.";
    reportLabel = `Bilan Copilot — ${today.toLocaleDateString("fr-CA")}`;
  }

  // Rendu PDF puis coffre (chiffrement streaming sur le buffer mémoire).
  const pdfBytes = await renderPdf({
    title,
    subtitle,
    blocks,
    footerNote,
    engineTag,
  });

  const documentId = randomUUID();
  const storageKey = `${actor.tenantId}/${documentId}.enc`;
  const storage = getObjectStorage();
  const fileName = `${slugifyLabel(kind, clientFullName)}.pdf`;

  let stored;
  try {
    stored = await storage.put(
      Readable.from(Buffer.from(pdfBytes)),
      storageKey,
    );
  } catch (error) {
    await storage.remove(storageKey);
    throw error;
  }

  try {
    return await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
      const document = await tx.document.create({
        data: {
          id: documentId,
          tenantId: actor.tenantId,
          clientId,
          uploadedById: actor.userId,
          category: "RAPPORT",
          label: reportLabel,
          originalFilename: fileName,
          mimeType: "application/pdf",
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          contentTag: stored.contentTag,
          storageKey,
        },
      });

      await addTimelineEntry(tx, actor.tenantId, {
        clientId,
        eventType: "DOCUMENT",
        title: `Rapport généré : ${REPORT_KIND_LABELS[kind]}`,
        source: "SYSTEM",
        createdBy: actor.userId,
      });

      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "documents.report.generated",
        entityType: "Document",
        entityId: document.id,
        newData: {
          clientId,
          kind,
          label: reportLabel,
          sizeBytes: stored.sizeBytes,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      // Mesure produit first-party (Sprint 8, ADR-014).
      await trackSafely(tx, {
        tenantId: actor.tenantId,
        app: "web-advisor",
        actorKind: "STAFF",
        actorId: actor.userId,
        sessionId: null,
        name: "report.generated",
        props: { kind, documentId: document.id },
      });

      return document;
    });
  } catch (error) {
    await storage.remove(storageKey);
    throw error;
  }
}
