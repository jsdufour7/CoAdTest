import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "../cert-pdf";
import {
  deriveInitials,
  stampSignatureFields,
  STAMP_ENGINE_VERSION,
  type StampSignerEntry,
} from "../stamp";

/** Petite pièce source de 2 pages. */
async function buildSourcePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595, 842]);
  pdf.addPage([595, 842]);
  return pdf.save();
}

/** PNG 1×1 valide (canvas simulé). */
const TINY_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

const JEAN: StampSignerEntry = {
  index: 0,
  typedName: "Jean Bouchard",
  initials: "J.B.",
  signedAt: new Date("2026-08-01T15:00:00Z"),
};

const SOPHIE: StampSignerEntry = {
  index: 1,
  typedName: "Sophie Bouchard",
  initials: "S.B.",
  signedAt: new Date("2026-08-01T15:05:00Z"),
  drawnPng: TINY_PNG,
};

describe("deriveInitials — initiales québécoises", () => {
  it("dérive prénom + nom, en ignorant les particules", () => {
    expect(deriveInitials("Jean Bouchard")).toBe("J.B.");
    // Prénom composé : chaque partie compte (comportement québécois fidèle).
    expect(deriveInitials("Marie-Claude Tremblay")).toBe("M.C.T.");
    expect(deriveInitials("Jean de la Fontaine")).toBe("J.F.");
    expect(deriveInitials("  émile   nelligan ")).toBe("É.N.");
    expect(deriveInitials("Madonna")).toBe("M.");
    expect(deriveInitials("   ")).toBe("?");
  });
});

describe("stampSignatureFields — vignettes « façon DocuSign » (sigstamp-2.0)", () => {
  it("expose la version du moteur", () => {
    expect(STAMP_ENGINE_VERSION).toBe("sigstamp-2.0");
  });

  it("estampille signature, paraphes et date sans altérer la pagination", async () => {
    const source = await buildSourcePdf();
    const stamped = await stampSignatureFields(
      source,
      [JEAN, SOPHIE],
      [
        { signerIndex: 0, kind: "INITIALS", pageIndex: 0, x: 0.05, y: 0.9, width: 0.14, height: 0.045 },
        { signerIndex: 1, kind: "INITIALS", pageIndex: 0, x: 0.81, y: 0.9, width: 0.14, height: 0.045 },
        { signerIndex: 0, kind: "SIGNATURE", pageIndex: 1, x: 0.07, y: 0.7, width: 0.38, height: 0.075 },
        { signerIndex: 0, kind: "DATE", pageIndex: 1, x: 0.07, y: 0.79, width: 0.24, height: 0.04 },
        { signerIndex: 1, kind: "SIGNATURE", pageIndex: 1, x: 0.55, y: 0.7, width: 0.38, height: 0.075 },
        { signerIndex: 1, kind: "DATE", pageIndex: 1, x: 0.55, y: 0.79, width: 0.24, height: 0.04 },
      ],
      { envelopeId: "env-test-1" },
    );

    const parsed = await PDFDocument.load(stamped);
    expect(parsed.getPageCount()).toBe(2);
    expect(sha256Hex(stamped)).not.toBe(sha256Hex(source));
  });

  it("embark la police script adoptée (style « sacramento », OFL)", async () => {
    const source = await buildSourcePdf();
    const stamped = await stampSignatureFields(
      source,
      [{ ...JEAN, styleId: "sacramento" }],
      [
        { signerIndex: 0, kind: "SIGNATURE", pageIndex: 0, x: 0.1, y: 0.8, width: 0.4, height: 0.08 },
      ],
    );
    const parsed = await PDFDocument.load(stamped);
    expect(parsed.getPageCount()).toBe(2);
  });

  it("rejette avec repli : style inconnu → classique, jamais bloquant", async () => {
    const source = await buildSourcePdf();
    const stamped = await stampSignatureFields(
      source,
      [{ ...JEAN, styleId: "style-inexistant" }],
      [
        { signerIndex: 0, kind: "SIGNATURE", pageIndex: 0, x: 0.1, y: 0.8, width: 0.4, height: 0.08 },
      ],
    );
    const parsed = await PDFDocument.load(stamped);
    expect(parsed.getPageCount()).toBe(2);
  });

  it("matérialise le refus sur les champs du signataire défaillant", async () => {
    const source = await buildSourcePdf();
    const stamped = await stampSignatureFields(
      source,
      [
        JEAN,
        {
          index: 1,
          typedName: "Sophie Bouchard",
          initials: "S.B.",
          status: "DECLINED",
          declinedAt: new Date("2026-08-01T16:00:00Z"),
        },
      ],
      [
        { signerIndex: 0, kind: "SIGNATURE", pageIndex: 0, x: 0.1, y: 0.8, width: 0.35, height: 0.07 },
        { signerIndex: 1, kind: "SIGNATURE", pageIndex: 0, x: 0.55, y: 0.8, width: 0.35, height: 0.07 },
      ],
    );
    const parsed = await PDFDocument.load(stamped);
    expect(parsed.getPageCount()).toBe(2);
    expect(sha256Hex(stamped)).not.toBe(sha256Hex(source));
  });

  it("ignore les champs d'un signataire absent de la liste (garde-fou)", async () => {
    const source = await buildSourcePdf();
    const stamped = await stampSignatureFields(
      source,
      [JEAN],
      [
        { signerIndex: 0, kind: "SIGNATURE", pageIndex: 0, x: 0.1, y: 0.8, width: 0.35, height: 0.07 },
        { signerIndex: 1, kind: "SIGNATURE", pageIndex: 0, x: 0.55, y: 0.8, width: 0.35, height: 0.07 },
      ],
    );
    const parsed = await PDFDocument.load(stamped);
    expect(parsed.getPageCount()).toBe(2);
  });

  it("rejette un champ hors du nombre de pages", async () => {
    const source = await buildSourcePdf();
    await expect(
      stampSignatureFields(
        source,
        [JEAN],
        [
          { signerIndex: 0, kind: "SIGNATURE", pageIndex: 5, x: 0.1, y: 0.8, width: 0.35, height: 0.07 },
        ],
      ),
    ).rejects.toThrow(/dépasse le nombre de pages/);
  });

  it("rejette une signature tracée qui n'est pas un PNG valide", async () => {
    const source = await buildSourcePdf();
    await expect(
      stampSignatureFields(
        source,
        [{ ...JEAN, drawnPng: new Uint8Array([1, 2, 3, 4]) }],
        [
          { signerIndex: 0, kind: "SIGNATURE", pageIndex: 0, x: 0.1, y: 0.8, width: 0.35, height: 0.07 },
        ],
      ),
    ).rejects.toThrow(/PNG valide/);
  });
});
