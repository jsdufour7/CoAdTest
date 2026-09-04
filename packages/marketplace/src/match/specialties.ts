import type { Dimension } from "@coadvisor/fnae";

/**
 * Spécialités déclarées par les conseillers — miroir contrôlé des 6
 * dimensions FNAE (même taxonomie = croisement direct et explicable).
 */
export const MARKETPLACE_SPECIALTIES = [
  "EMERGENCY_FUND",
  "DEBT",
  "SAVINGS",
  "RETIREMENT",
  "PROTECTION",
  "GOALS",
] as const;

export type MarketplaceSpecialty = (typeof MARKETPLACE_SPECIALTIES)[number];

export const SPECIALTY_LABELS: Record<MarketplaceSpecialty, string> = {
  EMERGENCY_FUND: "Fonds d'urgence",
  DEBT: "Dettes et budget",
  SAVINGS: "Épargne",
  RETIREMENT: "Retraite",
  PROTECTION: "Protection (assurances)",
  GOALS: "Objectifs financiers",
};

/** Langues supportées par l'annuaire (MVP). */
export const MARKETPLACE_LANGUAGES = ["fr", "en"] as const;
export type MarketplaceLanguage = (typeof MARKETPLACE_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<MarketplaceLanguage, string> = {
  fr: "Français",
  en: "Anglais",
};

/** Correspondance dimension FNAE → spécialité marketplace (1:1). */
export function dimensionToSpecialty(
  dimension: Dimension,
): MarketplaceSpecialty {
  const MAP: Record<Dimension, MarketplaceSpecialty> = {
    emergencyFund: "EMERGENCY_FUND",
    debt: "DEBT",
    savings: "SAVINGS",
    retirement: "RETIREMENT",
    protection: "PROTECTION",
    goals: "GOALS",
  };
  return MAP[dimension];
}
