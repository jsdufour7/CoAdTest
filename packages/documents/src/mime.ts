/**
 * Sniffing MIME par « magic bytes » (jamais la seule extension fournie
 * par le navigateur) + blocage des exécutables (décision Sprint 7 :
 * 50 Mo max, tout type sauf exécutables).
 */

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Extensions exécutables refusées (le contenu ne doit jamais pouvoir
 *  être lancé depuis le coffre). */
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".msi",
  ".com",
  ".scr",
  ".bat",
  ".cmd",
  ".ps1",
  ".vbs",
  ".js",
  ".jse",
  ".wsf",
  ".wsh",
  ".sh",
  ".app",
  ".dll",
  ".jar",
]);

export type SniffedKind =
  | "pdf"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "zip"
  | "gzip"
  | "sevenz"
  | "pe-executable"
  | "elf-executable"
  | "text"
  | "unknown";

export interface SniffResult {
  kind: SniffedKind;
  /** MIME officiel reconnu via la signature (prioritaire sur le type déclaré). */
  mime?: string;
  /** En-tête hex pour télémétrie de diagnostic (16 octets max). */
  headerHex: string;
}

/** Lit la signature binaire en tête du fichier. */
export function sniffMagic(header: Buffer): SniffResult {
  const headerHex = header.subarray(0, 16).toString("hex");
  const at = (offset: number, bytes: number[]) =>
    bytes.every((byte, i) => header[offset + i] === byte);

  if (at(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { kind: "pdf", mime: "application/pdf", headerHex };
  }
  if (at(0, [0x89, 0x50, 0x4e, 0x47])) {
    return { kind: "png", mime: "image/png", headerHex };
  }
  if (at(0, [0xff, 0xd8, 0xff])) {
    return { kind: "jpeg", mime: "image/jpeg", headerHex };
  }
  if (
    at(0, [0x47, 0x49, 0x46, 0x38]) &&
    (header[4] === 0x37 || header[4] === 0x39)
  ) {
    return { kind: "gif", mime: "image/gif", headerHex };
  }
  if (
    at(0, [0x52, 0x49, 0x46, 0x46]) &&
    at(8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return { kind: "webp", mime: "image/webp", headerHex };
  }
  // Archives Office OOXML / ODF / ZIP
  if (at(0, [0x50, 0x4b, 0x03, 0x04]) || at(0, [0x50, 0x4b, 0x05, 0x06])) {
    return { kind: "zip", mime: "application/zip", headerHex };
  }
  if (at(0, [0x1f, 0x8b])) {
    return { kind: "gzip", mime: "application/gzip", headerHex };
  }
  if (at(0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return { kind: "sevenz", mime: "application/x-7z-compressed", headerHex };
  }
  // Exécutables
  if (at(0, [0x4d, 0x5a])) {
    return { kind: "pe-executable", headerHex };
  }
  if (at(0, [0x7f, 0x45, 0x4c, 0x46])) {
    return { kind: "elf-executable", headerHex };
  }
  // Texte : majoritairement imprimable, sans octet nul
  const sample = header.subarray(0, Math.min(header.length, 512));
  if (sample.length > 0) {
    let printable = 0;
    for (const byte of sample) {
      if (byte === 0x00) return { kind: "unknown", headerHex };
      if (
        byte === 0x09 ||
        byte === 0x0a ||
        byte === 0x0d ||
        (byte >= 0x20 && byte <= 0x7e) ||
        byte >= 0x80
      ) {
        printable += 1;
      }
    }
    if (printable / sample.length > 0.85) {
      return { kind: "text", mime: "text/plain", headerHex };
    }
  }
  return { kind: "unknown", headerHex };
}

export interface UploadGateInput {
  fileName: string;
  declaredMime: string | null;
  sizeBytes: number;
  magic: SniffResult;
}

export interface UploadGateResult {
  blocked: boolean;
  /** MIME final retenu (signature reconnue > déclaré > binaire générique). */
  resolvedMime: string;
  reason?: string;
}

/** Garde-fou d'entrée du coffre — messages FR prêts à afficher. */
export function gateUpload(input: UploadGateInput): UploadGateResult {
  const extension = input.fileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0];

  if (input.sizeBytes <= 0) {
    return {
      blocked: true,
      resolvedMime: "application/octet-stream",
      reason: "Le fichier est vide — rien à déposer au coffre.",
    };
  }
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      blocked: true,
      resolvedMime: "application/octet-stream",
      reason: `Le fichier dépasse la limite de 50 Mo (${Math.ceil(
        input.sizeBytes / (1024 * 1024),
      )} Mo reçus).`,
    };
  }
  if (
    extension !== undefined &&
    BLOCKED_EXTENSIONS.has(extension)
  ) {
    return {
      blocked: true,
      resolvedMime: "application/octet-stream",
      reason:
        "Les fichiers exécutables ou scripts ne sont pas acceptés au coffre (sécurité).",
    };
  }
  if (
    input.magic.kind === "pe-executable" ||
    input.magic.kind === "elf-executable"
  ) {
    return {
      blocked: true,
      resolvedMime: "application/octet-stream",
      reason:
        "Ce fichier contient un programme exécutable — il ne peut pas être déposé au coffre.",
    };
  }

  const resolvedMime =
    input.magic.mime ??
    (input.declaredMime && input.declaredMime.length > 0
      ? input.declaredMime
      : "application/octet-stream");
  return { blocked: false, resolvedMime };
}
