/**
 * Îlot PUR de Signdoc — sous-chemin `@coadvisor/signdoc/pure` :
 * aucun import Node, aucun accès disque, importable depuis les
 * composants "use client" (aperçus de signature en temps réel) comme
 * depuis le serveur. Source unique des styles + initiales.
 */

export interface SignatureStyle {
  /** Identifiant persisté sur la ligne signataire (slug stable). */
  id: string;
  /** Étiquette affichée dans la boîte d'adoption. */
  label: string;
  /** Fichier TTF dans assets/fonts (null = police standard PDF). */
  fontFile: string | null;
  /** Police standard pdf-lib lorsque fontFile est null. */
  builtinFont: "Helvetica-Oblique" | null;
  /** Famille CSS pour l'aperçu navigateur temps réel. */
  cssFamily: string;
  /** Rendre l'aperçu en italique (styles à police standard). */
  cssItalic: boolean;
}

export const SIGNATURE_STYLES: readonly SignatureStyle[] = [
  {
    id: "classique",
    label: "Classique",
    fontFile: null,
    builtinFont: "Helvetica-Oblique",
    cssFamily: "'Segoe Script', 'Brush Script MT', cursive",
    cssItalic: true,
  },
  {
    id: "sacramento",
    label: "Sacramento",
    fontFile: "Sacramento-Regular.ttf",
    builtinFont: null,
    cssFamily: "'signdoc-sacramento', cursive",
    cssItalic: false,
  },
  {
    id: "great-vibes",
    label: "Great Vibes",
    fontFile: "GreatVibes-Regular.ttf",
    builtinFont: null,
    cssFamily: "'signdoc-great-vibes', cursive",
    cssItalic: false,
  },
  {
    id: "alex-brush",
    label: "Alex Brush",
    fontFile: "AlexBrush-Regular.ttf",
    builtinFont: null,
    cssFamily: "'signdoc-alex-brush', cursive",
    cssItalic: false,
  },
  {
    id: "parisienne",
    label: "Parisienne",
    fontFile: "Parisienne-Regular.ttf",
    builtinFont: null,
    cssFamily: "'signdoc-parisienne', cursive",
    cssItalic: false,
  },
] as const;

export const DEFAULT_SIGNATURE_STYLE_ID = "classique";

/** Style par identifiant — repli « classique » jamais bloquant. */
export function resolveSignatureStyle(styleId: string | null | undefined): {
  style: SignatureStyle;
  /** Vrai si l'identifiant reçu était inscrit au registre. */
  recognized: boolean;
} {
  const found = SIGNATURE_STYLES.find((style) => style.id === styleId);
  if (found) return { style: found, recognized: true };
  return { style: SIGNATURE_STYLES[0]!, recognized: false };
}

export function isSignatureStyleId(value: string): boolean {
  return SIGNATURE_STYLES.some((style) => style.id === value);
}

/** « Jean Bouchard » → « J.B. » (robuste aux particules et accents). */
export function deriveInitials(typedName: string): string {
  const parts = typedName
    .trim()
    .split(/[\s-]+/)
    .filter((part) => part.length > 0)
    .filter((part) => !/^(de|du|des|la|le|van|von)$/i.test(part));
  if (parts.length === 0) return "?";
  return parts.map((part) => `${part.charAt(0).toUpperCase()}.`).join("");
}
