import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildCertificateBlocks,
  buildCertificatePdf,
  mergeWithCertificate,
  sha256Hex,
  SIGNED_DOC_VERSION,
  type EnvelopeCertInfo,
} from "../cert-pdf";
import { configureSigndocRuntime } from "../ports";
import { stampSignatureFields } from "../stamp";

// Banc d'essai autonome : le port certificat est câblé sur un rendu
// minimal LOCAL (le moteur complet de rapports vit chez l'hôte —
// CoAdvisor l'exerce dans @coadvisor/documents via l'adaptateur).
beforeAll(() => {
  configureSigndocRuntime({
    audit: async () => {},
    readObject: async () => {
      throw new Error("non utilisé par ces tests");
    },
    renderCertificateBlocks: async (input) => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      let y = 780;
      for (const block of input.blocks) {
        const text =
          block.type === "paragraph" || block.type === "h2"
            ? block.text.slice(0, 90)
            : block.type === "kv"
              ? `${block.pairs.length} paires`
              : `${block.rows.length} lignes`;
        page.drawText(text, { x: 40, y, size: 8, font });
        y -= 14;
      }
      return pdf.save();
    },
    depositSignedCopy: async () => ({ documentId: null }),
  });
});

const SIGNER_BASE = {
  signerName: "Jean Bouchard",
  email: "jean.bouchard@exemple.ca",
  signedAt: new Date("2026-08-01T15:00:00Z"),
  outcome: "SIGNED" as const,
  ipAddress: "10.0.0.8",
  userAgent: "test-agent",
  consentText: "En apposant mon nom ci-dessous, je consens…",
  drawn: false,
};

function envelopeInfo(overrides: Partial<EnvelopeCertInfo> = {}): EnvelopeCertInfo {
  return {
    envelopeId: "env-1",
    documentLabel: "Entente de services-conseils",
    documentId: "doc-1",
    originalSha256: "ab".repeat(32),
    firmName: "Cabinet Démo",
    signingMode: "SEQUENTIAL",
    outcome: "SIGNED",
    signers: [
      { ...SIGNER_BASE, fullName: "Jean Bouchard", kind: "PORTAL_USER" },
      {
        ...SIGNER_BASE,
        fullName: "Sophie Bouchard",
        signerName: "Sophie Bouchard",
        email: "sophie.bouchard@exemple.ca",
        kind: "PORTAL_USER",
        signedAt: new Date("2026-08-01T15:20:00Z"),
      },
      {
        ...SIGNER_BASE,
        fullName: "Marie Tremblay",
        signerName: "Marie Tremblay",
        email: "demo@coadvisor.ca",
        kind: "STAFF",
        signatureStyle: "sacramento",
        signedAt: new Date("2026-08-01T16:00:00Z"),
      },
      {
        ...SIGNER_BASE,
        fullName: "Me Karine Legal",
        signerName: "Me Karine Legal",
        email: "karine.legal@exemple.ca",
        kind: "EXTERNAL",
        drawn: true,
        signedAt: new Date("2026-08-01T17:30:00Z"),
      },
    ],
    ...overrides,
  };
}

describe("buildCertificatePdf — certificat multi-signataires (signdoc-2.1)", () => {
  it("expose la version 2.1", () => {
    expect(SIGNED_DOC_VERSION).toBe("signdoc-2.1");
  });

  it("produit un PDF valide d'au moins une page, quel que soit le nombre de signataires", async () => {
    const certificate = await buildCertificatePdf(envelopeInfo());
    const parsed = await PDFDocument.load(certificate);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(sha256Hex(certificate)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gère un signataire unique comme une enveloppe complète", async () => {
    const certificate = await buildCertificatePdf(
      envelopeInfo({ signers: [envelopeInfo().signers[0]!] }),
    );
    const parsed = await PDFDocument.load(certificate);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

describe("buildCertificateBlocks — clôture sur refus (Sprint 7c)", () => {
  function declinedInfo(): EnvelopeCertInfo {
    return envelopeInfo({
      outcome: "DECLINED",
      signers: [
        envelopeInfo().signers[0]!,
        {
          ...SIGNER_BASE,
          fullName: "Sophie Bouchard",
          signerName: "Sophie Bouchard",
          email: "sophie.bouchard@exemple.ca",
          kind: "PORTAL_USER",
          outcome: "DECLINED",
          declineReason: "Entente à revoir avec le conseiller",
          signedAt: new Date("2026-08-01T15:45:00Z"),
        },
      ],
    });
  }

  it("introduit le constat de refus et nomme la personne", () => {
    const blocks = buildCertificateBlocks(declinedInfo());
    const intro = blocks.find(
      (block) => block.type === "paragraph",
    );
    expect(intro && "text" in intro ? intro.text : "").toContain(
      "CLÔTURE SUR REFUS",
    );
    expect(intro && "text" in intro ? intro.text : "").toContain(
      "Sophie Bouchard",
    );
  });

  it("marque la décision « Refusée » dans le tableau récapitulatif", () => {
    const blocks = buildCertificateBlocks(declinedInfo());
    const table = blocks.find((block) => block.type === "table");
    expect(table && table.type === "table").toBe(true);
    if (table && table.type === "table") {
      expect(table.headers).toContain("Décision");
      expect(table.rows.some((row) => row.includes("Refusée"))).toBe(true);
      expect(table.rows.some((row) => row.includes("Signée"))).toBe(true);
    }
  });

  it("consigne le motif déclaré en preuve", () => {
    const blocks = buildCertificateBlocks(declinedInfo());
    const motif = blocks.find(
      (block) =>
        block.type === "paragraph" && block.text.startsWith("Motif déclaré"),
    );
    expect(motif).toBeDefined();
    if (motif && motif.type === "paragraph") {
      expect(motif.text).toContain("Entente à revoir avec le conseiller");
    }
  });

  it("le style adopté figure dans la preuve du signataire", () => {
    const blocks = buildCertificateBlocks(envelopeInfo());
    const appositions = blocks
      .filter((block) => block.type === "kv")
      .flatMap((block) => (block.type === "kv" ? block.pairs : []))
      .filter(([key]) => key === "Mode d'apposition")
      .map(([, value]) => value);
    expect(appositions).toContain("Nom tapé — style « Sacramento »");
    expect(appositions).toContain("Nom tapé — style « Classique »");
    expect(appositions).toContain("Signature tracée à l'écran");
  });
});

describe("mergeWithCertificate — chaîne complète estampillage + preuve", () => {
  it("fusionne pièce estampillée et certificat en conservant les pages", async () => {
    const originalDoc = await PDFDocument.create();
    originalDoc.addPage([595, 842]);
    originalDoc.addPage([595, 842]);
    const original = await originalDoc.save();

    const stamped = await stampSignatureFields(
      original,
      [
        {
          index: 0,
          typedName: "Jean Bouchard",
          initials: "J.B.",
          signedAt: new Date("2026-08-01T15:00:00Z"),
        },
      ],
      [
        { signerIndex: 0, kind: "SIGNATURE", pageIndex: 0, x: 0.3, y: 0.72, width: 0.4, height: 0.08 },
        { signerIndex: 0, kind: "DATE", pageIndex: 0, x: 0.3, y: 0.81, width: 0.24, height: 0.04 },
      ],
    );
    const certificate = await buildCertificatePdf(
      envelopeInfo({ signers: [envelopeInfo().signers[0]!] }),
    );
    const final = await mergeWithCertificate(stamped, certificate);

    const pagesOriginal = (await PDFDocument.load(original)).getPageCount();
    const pagesCert = (await PDFDocument.load(certificate)).getPageCount();
    const pagesFinal = (await PDFDocument.load(final)).getPageCount();
    expect(pagesFinal).toBe(pagesOriginal + pagesCert);
    expect(sha256Hex(original)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(final)).not.toBe(sha256Hex(stamped));
  });
});
