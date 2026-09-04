import { FHI_CATEGORY_LABELS, FHI_WEIGHTS } from "@coadvisor/health-engine";
import type { FhiCategory, FhiInsight } from "@coadvisor/health-engine";

import type { PdfBlock } from "./pdf";

/** Footer réglementaire commun (répété à chaque page). */
export const REPORT_FOOTER =
  "Document d'illustration généré par CoAdvisor — ne constitue pas un avis financier réglementé. Conservez-le en lieu sûr : il contient des renseignements personnels sensibles.";

const INSIGHT_HEADERS: Record<string, string> = {
  STRENGTH: "Points forts",
  RISK: "Risques à corriger",
  OPPORTUNITY: "Opportunités",
  ACTION: "Actions recommandées",
};

export const FHI_REPORT_VERSION = "fhireport-1.0";
export const DOSSIER_REPORT_VERSION = "dossierreport-1.0";
export const COPILOT_PDF_VERSION = "copilotpdf-1.0";

export interface FhiReportData {
  clientFullName: string;
  generatedAt: Date;
  score: number;
  categoryScores: Record<string, number>;
  insights: FhiInsight[];
  engineVersion: string;
  advisorName: string;
  firmName: string;
}

/** Blocs du « Bilan de santé financière » (FHI). */
export function fhiReportBlocks(data: FhiReportData): {
  title: string;
  subtitle: string;
  blocks: PdfBlock[];
  engineTag: string;
} {
  const sortedCategories = (Object.keys(data.categoryScores) as FhiCategory[])
    .filter((category) => category in FHI_WEIGHTS)
    .sort(
      (a, b) =>
        (data.categoryScores[a] ?? 0) - (data.categoryScores[b] ?? 0),
    );

  const blocks: PdfBlock[] = [
    {
      type: "kv",
      pairs: [
        ["Client", data.clientFullName],
        ["Score global", `${data.score} / 100`],
        ["Moteur de calcul", data.engineVersion],
        [
          "Émise le",
          data.generatedAt.toLocaleDateString("fr-CA", {
            dateStyle: "long",
          }),
        ],
        ["Préparé par", `${data.advisorName} — ${data.firmName}`],
      ],
    },
    { type: "h2", text: "Les 10 dimensions, classées du plus fragile au plus solide" },
    {
      type: "table",
      headers: ["Catégorie", "Score /100", "Poids"],
      columnRatio: [3, 1.4, 1.2],
      rows: sortedCategories.map((category) => [
        FHI_CATEGORY_LABELS[category],
        String(data.categoryScores[category] ?? "—"),
        `${Math.round((FHI_WEIGHTS[category] ?? 0) * 100)} %`,
      ]),
    },
  ];

  const grouped = new Map<string, FhiInsight[]>();
  for (const insight of data.insights) {
    const list = grouped.get(insight.type) ?? [];
    list.push(insight);
    grouped.set(insight.type, list);
  }
  for (const type of ["STRENGTH", "RISK", "OPPORTUNITY", "ACTION"]) {
    const list = grouped.get(type) ?? [];
    if (list.length === 0) continue;
    blocks.push({
      type: "h2",
      text: INSIGHT_HEADERS[type] ?? type,
    });
    blocks.push({
      type: "bullets",
      items: list.map((insight) =>
        insight.recommendation
          ? `${insight.message} — ${insight.recommendation}`
          : insight.message,
      ),
    });
  }

  blocks.push({ type: "spacer", height: 6 });
  blocks.push({
    type: "paragraph",
    text:
      "Ce bilan est un outil de discussion : il éclaire les priorités, il ne remplace ni une planification détaillée ni les documents officiels. Le score est recalculé à chaque mise à jour du dossier — l'historique immuable est conservé dans CoAdvisor.",
  });

  return {
    title: "Bilan de santé financière",
    subtitle: `Préparé pour ${data.clientFullName}`,
    blocks,
    engineTag: `${FHI_REPORT_VERSION} · ${data.engineVersion} · pdfrender-1.0`,
  };
}

export interface DossierReportData {
  clientFullName: string;
  clientType: string;
  clientStatus: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  advisorName: string;
  firmName: string;
  family: Array<{ name: string; relation: string; birthDate: string | null }>;
  financeTotals: Array<[string, string]>;
  latestFhiScore: number | null;
  latestFhiAt: string | null;
  timelineHighlights: string[];
  generatedAt: Date;
}

/** Blocs du « Dossier client — synthèse ». */
export function dossierReportBlocks(data: DossierReportData): {
  title: string;
  subtitle: string;
  blocks: PdfBlock[];
  engineTag: string;
} {
  const blocks: PdfBlock[] = [
    {
      type: "kv",
      pairs: [
        ["Client", data.clientFullName],
        ["Type de dossier", data.clientType],
        ["Statut", data.clientStatus],
        ["Courriel", data.email ?? "—"],
        ["Téléphone", data.phone ?? "—"],
        [
          "Dossier ouvert le",
          data.createdAt.toLocaleDateString("fr-CA", { dateStyle: "long" }),
        ],
        ["FHI le plus récent", data.latestFhiScore === null ? "—" : `${data.latestFhiScore} / 100 (${data.latestFhiAt ?? ""})`],
        ["Préparé par", `${data.advisorName} — ${data.firmName}`],
      ],
    },
    { type: "h2", text: "Entourage financier" },
    data.family.length === 0
      ? { type: "paragraph", text: "Aucun membre d'entourage n'est inscrit au dossier pour le moment." }
      : {
          type: "table",
          headers: ["Personne", "Lien", "Naissance"],
          columnRatio: [2, 1.4, 1.2],
          rows: data.family.map((member) => [
            member.name,
            member.relation,
            member.birthDate ?? "—",
          ]),
        },
    { type: "h2", text: "Portrait financier synthétique" },
    { type: "kv", pairs: data.financeTotals },
    { type: "h2", text: "Faits saillants récents du dossier" },
    data.timelineHighlights.length === 0
      ? { type: "paragraph", text: "Aucun événement notable n'a encore été consigné." }
      : { type: "bullets", items: data.timelineHighlights },
    {
      type: "paragraph",
      text:
        "Cette synthèse reflète le dossier tel qu'il est tenu dans CoAdvisor au moment de l'émission — les pièces détaillées (relevés, justificatifs) figurent au coffre documentaire.",
    },
  ];

  return {
    title: "Dossier client — synthèse",
    subtitle: `${data.clientFullName} · ${data.firmName}`,
    blocks,
    engineTag: `${DOSSIER_REPORT_VERSION} · pdfrender-1.0`,
  };
}

/** Mini-parseur Markdown (sous-ensemble : ##, ###, listes, paragraphes, **gras**). */
export function markdownToBlocks(markdown: string): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length > 0) {
      blocks.push({ type: "bullets", items: bullets });
      bullets = [];
    }
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) {
      flushBullets();
      blocks.push({ type: "h2", text: trimmed.slice(4) });
    } else if (trimmed.startsWith("## ")) {
      flushBullets();
      blocks.push({ type: "h2", text: trimmed.slice(3) });
    } else if (trimmed.startsWith("# ")) {
      flushBullets();
      blocks.push({ type: "h2", text: trimmed.slice(2) });
    } else if (/^[-•*]\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^[-•*]\s+/, ""));
    } else if (/^\d+\.\s+/.test(trimmed)) {
      bullets.push(trimmed.replace(/^\d+\.\s+/, ""));
    } else if (trimmed === "") {
      flushBullets();
    } else {
      flushBullets();
      blocks.push({
        type: "paragraph",
        text: trimmed.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1"),
      });
    }
  }
  flushBullets();
  return blocks;
}

export const COPILOT_DISCLAIMER =
  "Bilan préparé par l'assistant Copilot (IA assistive) à partir du dossier tenu dans CoAdvisor, REVU ET VALIDÉ par le conseiller — il ne constitue pas un avis financier réglementé ni une recommandation automatisée.";
