/**
 * Constantes typographiques du coffre — entrypoint `client-safe`
 * (aucun import serveur ; importable depuis des composants "use client").
 *
 * Sprint 7c (ADR-012) : les constantes du domaine signature vivent
 * dans @coadvisor/signdoc (entité autonome) — ré-exportées ici pour
 * compatibilité des importations existantes, sans duplication.
 */

export {
  LEGACY_TO_SIGN_SUFFIX,
  MAX_SIGNERS_PER_ENVELOPE,
  SIGNATURE_CONSENT_TEXT,
  SIGNATURE_FIELD_KIND_LABELS,
  SIGNATURE_REMINDER_INTERVAL_HOURS,
  SIGNATURE_STATUS_LABELS,
  SIGNER_KIND_LABELS,
  SIGNER_STATUS_LABELS,
  SIGNING_MODE_LABELS,
  type SignatureFieldKindValue,
  type SignatureStatusValue,
  type SignerKindValue,
  type SignerStatusValue,
  type SigningModeValue,
} from "@coadvisor/signdoc/labels";

export const DOCUMENT_CATEGORIES = [
  "JUSTIFICATIF",
  "RELEVE",
  "AVIS_COTISATION",
  "IDENTITE",
  "CONTRAT",
  "RAPPORT",
  "AUTRE",
] as const;

export type DocumentCategoryValue = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategoryValue, string> = {
  JUSTIFICATIF: "Justificatif",
  RELEVE: "Relevé",
  AVIS_COTISATION: "Avis de cotisation",
  IDENTITE: "Pièce d'identité",
  CONTRAT: "Contrat",
  RAPPORT: "Rapport",
  AUTRE: "Autre",
};

export const SHARE_CHANNEL_LABELS = {
  PORTAL: "Portail particulier",
  LINK: "Lien public (7 jours)",
} as const;

export type ShareChannelValue = keyof typeof SHARE_CHANNEL_LABELS;

export const MAX_UPLOAD_DISPLAY = "50 Mo";

/** Formatage québécois des tailles de fichier (o / Ko / Mo) — source unique. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Vue publique d'une pièce du coffre (affichage fiche + listes). */
export interface VaultDocumentSummary {
  id: string;
  label: string;
  category: DocumentCategoryValue;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: Date;
}
