/**
 * Libellés et constantes du domaine signature (source unique — le
 * module @coadvisor/documents les ré-exporte pour compatibilité).
 */

export const SIGNATURE_STATUS_LABELS = {
  REQUESTED: "En attente",
  PARTIALLY_SIGNED: "Partiellement signée",
  SIGNED: "Signée",
  DECLINED: "Refusée",
  EXPIRED: "Expirée",
  CANCELLED: "Annulée",
} as const;

export type SignatureStatusValue = keyof typeof SIGNATURE_STATUS_LABELS;

/** Canaux de signataires et champs positionnés (ADR-011). */
export const SIGNER_KIND_LABELS = {
  PORTAL_USER: "Portail client",
  STAFF: "Cabinet",
  EXTERNAL: "Externe (courriel)",
} as const;

export type SignerKindValue = keyof typeof SIGNER_KIND_LABELS;

export const SIGNER_STATUS_LABELS = {
  PENDING: "En attente",
  SIGNED: "Signé",
  DECLINED: "Refusé",
} as const;

export type SignerStatusValue = keyof typeof SIGNER_STATUS_LABELS;

export const SIGNATURE_FIELD_KIND_LABELS = {
  SIGNATURE: "Signature",
  INITIALS: "Paraphe",
  DATE: "Date",
} as const;

export type SignatureFieldKindValue = keyof typeof SIGNATURE_FIELD_KIND_LABELS;

export const SIGNING_MODE_LABELS = {
  SEQUENTIAL: "Séquentiel (chacun son tour)",
  PARALLEL: "En parallèle (ordre libre)",
} as const;

export type SigningModeValue = keyof typeof SIGNING_MODE_LABELS;

/** Cadence des relances automatiques (heures) — balayage au coffre. */
export const SIGNATURE_REMINDER_INTERVAL_HOURS = 72;

/** Plafond de signataires par enveloppe (UX + garde-fou schéma). */
export const MAX_SIGNERS_PER_ENVELOPE = 6;

/** Suffixe hérité du seed Sprint 7 — nettoyé à la complétion (7b). */
export const LEGACY_TO_SIGN_SUFFIX = " — à signer";

/** Texte EXACT du consentement affiché à la signature (consigné en base). */
export const SIGNATURE_CONSENT_TEXT =
  "En apposant mon nom ci-dessous, je consens à signer électroniquement ce document ; je reconnais que cette signature me lie au même titre qu'une signature manuscrite (art. 2827 C.c.Q.).";
