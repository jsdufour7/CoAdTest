import { describe, expect, it } from "vitest";

import { gateUpload, MAX_UPLOAD_BYTES, sniffMagic } from "../mime";

const magicOf = (bytes: number[]) => sniffMagic(Buffer.from(bytes));

describe("sniffMagic — signatures binaires", () => {
  it("reconnaît un PDF par son en-tête %PDF-", () => {
    const result = magicOf([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(result.kind).toBe("pdf");
    expect(result.mime).toBe("application/pdf");
  });

  it("reconnaît PNG et JPEG", () => {
    expect(magicOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).kind).toBe("png");
    expect(magicOf([0xff, 0xd8, 0xff, 0xe0, 0x00]).kind).toBe("jpeg");
  });

  it("reconnaît les conteneurs ZIP (dont Office OOXML)", () => {
    expect(magicOf([0x50, 0x4b, 0x03, 0x04, 0x14]).kind).toBe("zip");
  });

  it("détecte les exécutables PE (MZ) et ELF", () => {
    expect(magicOf([0x4d, 0x5a, 0x90, 0x00]).kind).toBe("pe-executable");
    expect(magicOf([0x7f, 0x45, 0x4c, 0x46, 0x02]).kind).toBe("elf-executable");
  });

  it("accepte le texte UTF-8 avec accents", () => {
    const header = Buffer.from("Relevé bancaire — décembre 2025\nSolde : 4 812,10 $", "utf8");
    expect(sniffMagic(header).kind).toBe("text");
  });
});

describe("gateUpload — garde-fou d'entrée", () => {
  const pdfMagic = { kind: "pdf" as const, mime: "application/pdf", headerHex: "25504446" };

  it("refuse un fichier vide", () => {
    const gate = gateUpload({ fileName: "a.pdf", declaredMime: "application/pdf", sizeBytes: 0, magic: pdfMagic });
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain("vide");
  });

  it("refuse au-delà de 50 Mo", () => {
    const gate = gateUpload({
      fileName: "gros.pdf",
      declaredMime: "application/pdf",
      sizeBytes: MAX_UPLOAD_BYTES + 1,
      magic: pdfMagic,
    });
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain("50 Mo");
  });

  it("bloque l'extension .exe même si le contenu semble innocent", () => {
    const gate = gateUpload({
      fileName: "outil.exe",
      declaredMime: "text/plain",
      sizeBytes: 100,
      magic: { kind: "text", mime: "text/plain", headerHex: "4142" },
    });
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain("exécutables");
  });

  it("bloque un exécutable binaire même renommé en .pdf", () => {
    const gate = gateUpload({
      fileName: "contrat.pdf",
      declaredMime: "application/pdf",
      sizeBytes: 2048,
      magic: { kind: "pe-executable", headerHex: "4d5a" },
    });
    expect(gate.blocked).toBe(true);
    expect(gate.reason).toContain("programme exécutable");
  });

  it("privilégie le MIME de la signature sur celui déclaré", () => {
    const gate = gateUpload({
      fileName: "photo.jpg",
      declaredMime: "image/jpeg",
      sizeBytes: 3000,
      magic: { kind: "png", mime: "image/png", headerHex: "89504e47" },
    });
    expect(gate.blocked).toBe(false);
    expect(gate.resolvedMime).toBe("image/png");
  });

  it("accepte un binaire inconnu non exécutable en octet-stream", () => {
    const gate = gateUpload({
      fileName: "archive.dat",
      declaredMime: null,
      sizeBytes: 128,
      magic: { kind: "unknown", headerHex: "01020304" },
    });
    expect(gate.blocked).toBe(false);
    expect(gate.resolvedMime).toBe("application/octet-stream");
  });
});
