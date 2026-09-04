import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ValidationError } from "@coadvisor/types";

import { resolveSignatureStyle } from "./pure";
import type { SignatureStyle } from "./pure";

/**
 * Accès SERVEUR aux polices de signature (Sprint 7c — rendu façon
 * DocuSign). Les métadonnées de styles vivent dans ./pure (partage
 * client-serveur) ; ce module ajoute la lecture des TTF (SIL OFL 1.1,
 * licence embarquée : assets/fonts/LICENSE-OFL.txt) et l'identifiant
 * d'apposition probant.
 */

export {
  DEFAULT_SIGNATURE_STYLE_ID,
  deriveInitials,
  isSignatureStyleId,
  resolveSignatureStyle,
  SIGNATURE_STYLES,
  type SignatureStyle,
} from "./pure";

// ═════════════ Accès fichiers de polices (serveur) ═════════════

function fontsDirCandidates(): string[] {
  const candidates: string[] = [];
  try {
    // NB : pas de `new URL("dossier/", import.meta.url)` — webpack tente
    // alors une résolution STATIQUE du dossier (échec de build). Le
    // dirname + join restent des valeurs d'exécution, invisibles au bundler.
    candidates.push(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "assets",
        "fonts",
      ),
    );
  } catch {
    // import.meta.url indisponible (paquet déjà bundlé) — repli ci-dessous.
  }
  candidates.push(
    path.join(process.cwd(), "packages/signdoc/assets/fonts"),
    path.join(process.cwd(), "../../packages/signdoc/assets/fonts"),
    path.join(process.cwd(), "node_modules/@coadvisor/signdoc/assets/fonts"),
  );
  return candidates;
}

const fontBytesCache = new Map<string, Promise<Uint8Array>>();

/** Octets TTF d'un style (cache processus) — null pour police standard. */
export function readStyleFontBytes(
  style: SignatureStyle,
): Promise<Uint8Array> | null {
  if (!style.fontFile) return null;
  const cached = fontBytesCache.get(style.fontFile);
  if (cached) return cached;
  const promise = (async () => {
    for (const dir of fontsDirCandidates()) {
      try {
        return new Uint8Array(await readFile(path.join(dir, style.fontFile!)));
      } catch {
        // Candidat suivant.
      }
    }
    throw new ValidationError(
      "Les polices de signature du moteur Signdoc sont introuvables sur ce serveur.",
    );
  })();
  fontBytesCache.set(style.fontFile, promise);
  return promise;
}

/** Fichier pour la route de service web (allowlist stricte). */
export function signdocFontPublicName(styleId: string): string | null {
  const { style, recognized } = resolveSignatureStyle(styleId);
  return recognized ? style.fontFile : null;
}

export function signdocFontContentType(): string {
  return "font/ttf";
}

/**
 * Identifiant de preuve d'apposition « façon DocuSign » : 12 caractères
 * hex MAJUSCULES dérivés déterministement de (signataire, enveloppe) —
 * stable entre la vignette estampillée et un affichage de vérification.
 */
export function signatureStampId(signerId: string, envelopeId: string): string {
  return createHash("sha256")
    .update(`signdoc-stamp:${envelopeId}:${signerId}`)
    .digest("hex")
    .toUpperCase()
    .slice(0, 12);
}
