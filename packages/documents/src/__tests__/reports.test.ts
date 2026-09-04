import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildSignedPdf, sha256Hex, SIGNED_DOC_VERSION } from "@coadvisor/signdoc";
import { fhiReportBlocks, markdownToBlocks } from "../reports/builders";
import "../signdoc-vault"; // câble les ports Signdoc (banc d'essai réaliste)
import { PDF_RENDER_VERSION, renderPdf } from "../reports/pdf";

describe("renderPdf — gabarit CoAdvisor", () => {
  it("produit un PDF valide, paginé, avec titre intégré", async () => {
    const bytes = await renderPdf({
      title: "Bilan de santé financière",
      subtitle: "Préparé pour Jean Bouchard",
      blocks: [
        { type: "h2", text: "Les 10 dimensions" },
        {
          type: "table",
          headers: ["Catégorie", "Score"],
          rows: [
            ["Liquidités", "72"],
            ["Épargne à très très très long libellé qui dépasse la largeur de la cellule", "41"],
          ],
        },
        {
          type: "bullets",
          items: [
            "Accélérer l'épargne-retraite et valider votre plan avec un professionnel.",
            "Constituer un fonds d'urgence couvrant 3 à 6 mois. Un texte volontairement long pour vérifier le retour à la ligne automatique du moteur de rendu, avec des accents éàç et des chiffres 1 234,56 $.",
          ],
        },
        {
          type: "kv",
          pairs: [
            ["Client", "Jean Bouchard"],
            ["Empreinte", "ab".repeat(32)],
          ],
        },
      ],
      footerNote:
        "Document d'illustration généré par CoAdvisor — ne constitue pas un avis financier réglementé.",
      engineTag: `${PDF_RENDER_VERSION} · test`,
    });

    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(parsed.getTitle()).toBe("Bilan de santé financière");
  });

  it("saute de page proprement quand le contenu déborde", async () => {
    const bytes = await renderPdf({
      title: "Rapport long",
      subtitle: "Débordement",
      blocks: Array.from({ length: 60 }, (_, i) => ({
        type: "paragraph" as const,
        text: `Paragraphe ${i + 1} — `.repeat(10),
      })),
      footerNote: "Pied réglementaire.",
      engineTag: "test-1.0",
    });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
});

describe("fhiReportBlocks — structure métier", () => {
  it("classe les catégories du plus fragile au plus solide", () => {
    const shaped = fhiReportBlocks({
      clientFullName: "Jean Bouchard",
      generatedAt: new Date("2026-07-31T12:00:00Z"),
      score: 68,
      categoryScores: {
        LIQUIDITY: 90,
        RETIREMENT: 31,
        SAVINGS: 42,
        BUDGET: 76,
        DEBT: 55,
        INVESTMENTS: 60,
        TAX: 70,
        INSURANCE: 80,
        ESTATE: 65,
        GOALS: 50,
      },
      insights: [
        { type: "RISK", category: "RETIREMENT", severity: "HIGH", message: "Retraite en retard sur les repères", recommendation: "Plan de rattrapage" },
        { type: "STRENGTH", category: "LIQUIDITY", severity: "LOW", message: "Liquidités saines" },
      ],
      engineVersion: "fhe-1.0",
      advisorName: "Marie Tremblay",
      firmName: "Cabinet Démo",
    });

    const table = shaped.blocks.find((b) => b.type === "table");
    expect(table && table.type === "table" ? table.rows[0] : []).toEqual([
      "Retraite",
      "31",
      "15 %",
    ]);
    expect(shaped.engineTag).toContain("fhireport-1.0");
    expect(
      shaped.blocks.some(
        (b) => b.type === "bullets" && b.items.some((i) => i.includes("Plan de rattrapage")),
      ),
    ).toBe(true);
  });
});

describe("markdownToBlocks — sous-ensemble", () => {
  it("transforme titres, listes et paragraphes en blocs", () => {
    const blocks = markdownToBlocks(
      [
        "## Bilan global",
        "Votre situation est **globalement saine**.",
        "",
        "### Points à surveiller",
        "- Retraite: accélérer l'épargne",
        "- Dettes: rembourser les cartes",
        "1. Première action",
        "2. Deuxième action",
      ].join("\n"),
    );
    expect(blocks[0]).toEqual({ type: "h2", text: "Bilan global" });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
    const bullets = blocks.find((b) => b.type === "bullets");
    expect(bullets && bullets.type === "bullets" ? bullets.items : []).toHaveLength(4);
  });
});

describe("buildSignedPdf — certificat fusionné", () => {
  it("ajoute une page certificat et conserve l'original intact", async () => {
    const original = await renderPdf({
      title: "Contrat de services",
      blocks: [{ type: "paragraph", text: "Clause 1 — services de planification." }],
      footerNote: "Pièce originale.",
      engineTag: "test-1.0",
    });
    const originalHash = sha256Hex(original);

    const signed = await buildSignedPdf(original, {
      documentLabel: "Contrat de services",
      documentId: "doc-1",
      originalSha256: originalHash,
      signerName: "Jean Bouchard",
      signedAt: new Date("2026-07-31T14:05:00Z"),
      ipAddress: "10.0.0.8",
      userAgent: "test-agent",
      consentText: "Je consens à signer électroniquement.",
      firmName: "Cabinet Démo",
      via: "portal",
    });

    const parsedOriginal = await PDFDocument.load(original);
    const parsedSigned = await PDFDocument.load(signed);
    expect(parsedOriginal.getPageCount()).toBe(1);
    expect(parsedSigned.getPageCount()).toBe(2);
    expect(sha256Hex(signed)).not.toBe(originalHash);
    // L'original n'a pas été modifié par la fusion.
    expect(sha256Hex(original)).toBe(originalHash);
    expect(SIGNED_DOC_VERSION).toBe("signdoc-2.1");
  });
});
