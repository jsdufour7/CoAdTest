/**
 * Catalogue des paliers SaaS CoAdvisor (ADR-013) — source de vérité
 * UNIQUE des prix et des limites. Fichier client-safe : aucune
 * dépendance Node/BD (utilisable dans les composants navigateur).
 * Grille fondatrice 2026-08 : 0 $ / 59 $ / 119 $ / 199 $ CAD/mois.
 * engineVersion « billing-1.0 ».
 */

export const PLAN_CODES = ["decouverte", "essentiel", "pro", "cabinet"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type AnalyticsLevel = "aucun" | "cabinet" | "equipe";

export interface PlanLimits {
  /** Sièges (membres staff actifs) inclus dans le palier. */
  seatsIncluded: number;
  /** Prix mensuel par siège additionnel (0 = additionnels interdits). */
  extraSeatCentsPerMonth: number;
  /** Dossiers clients ACTIFS maximum (null = illimité). */
  clientsMax: number | null;
  /** Stockage coffre maximum en octets (null = illimité). */
  vaultBytesMax: number | null;
  /** Enveloppes de signature créées par mois civil (null = illimité). */
  envelopesPerMonthMax: number | null;
  /** Droit de paraître dans l'annuaire (vitrine marketplace). */
  marketplaceListing: boolean;
  /** Niveau d'analytics produit : aucun / vue cabinet / vue équipe. */
  analyticsLevel: AnalyticsLevel;
}

export interface BillingPlan {
  code: PlanCode;
  name: string;
  priceCentsPerMonth: number;
  tagline: string;
  features: string[];
  limits: PlanLimits;
  /** Mise en avant marketing (carte « recommandée »). */
  recommended?: boolean;
}

const GIB = 1024 ** 3;

export const BILLING_PLANS: Record<PlanCode, BillingPlan> = {
  decouverte: {
    code: "decouverte",
    name: "Découverte",
    priceCentsPerMonth: 0,
    tagline: "Pour découvrir CoAdvisor sans carte.",
    features: [
      "1 conseiller",
      "10 dossiers clients actifs",
      "1 Go de coffre chiffré",
      "5 enveloppes de signature / mois",
      "Portail client inclus",
    ],
    limits: {
      seatsIncluded: 1,
      extraSeatCentsPerMonth: 0,
      clientsMax: 10,
      vaultBytesMax: 1 * GIB,
      envelopesPerMonthMax: 5,
      marketplaceListing: false,
      analyticsLevel: "aucun",
    },
  },
  essentiel: {
    code: "essentiel",
    name: "Essentiel",
    priceCentsPerMonth: 5900,
    tagline: "Le cabinet solo bien outillé.",
    features: [
      "2 sièges (conseiller + adjointe)",
      "100 dossiers clients actifs",
      "10 Go de coffre chiffré",
      "50 enveloppes de signature / mois",
      "Vitrine Annuaire incluse",
    ],
    limits: {
      seatsIncluded: 2,
      extraSeatCentsPerMonth: 0,
      clientsMax: 100,
      vaultBytesMax: 10 * GIB,
      envelopesPerMonthMax: 50,
      marketplaceListing: true,
      analyticsLevel: "aucun",
    },
  },
  pro: {
    code: "pro",
    name: "Pro",
    priceCentsPerMonth: 11900,
    tagline: "La pratique sans plafonds.",
    recommended: true,
    features: [
      "3 sièges inclus",
      "Dossiers clients illimités",
      "100 Go de coffre chiffré",
      "Enveloppes de signature illimitées",
      "Vitrine Annuaire incluse",
      "Statistiques de pratique (analytics cabinet)",
      "Soutien prioritaire",
    ],
    limits: {
      seatsIncluded: 3,
      extraSeatCentsPerMonth: 0,
      clientsMax: null,
      vaultBytesMax: 100 * GIB,
      envelopesPerMonthMax: null,
      marketplaceListing: true,
      analyticsLevel: "cabinet",
    },
  },
  cabinet: {
    code: "cabinet",
    name: "Cabinet",
    priceCentsPerMonth: 19900,
    tagline: "L'équipe au complet, pilotée par la donnée.",
    features: [
      "5 sièges inclus (+29 $/siège additionnel)",
      "Dossiers clients illimités",
      "500 Go de coffre chiffré",
      "Enveloppes de signature illimitées",
      "Vitrine Annuaire incluse",
      "Analytics d'équipe (par membre)",
    ],
    limits: {
      seatsIncluded: 5,
      extraSeatCentsPerMonth: 2900,
      clientsMax: null,
      vaultBytesMax: 500 * GIB,
      envelopesPerMonthMax: null,
      marketplaceListing: true,
      analyticsLevel: "equipe",
    },
  },
};

/** Ordre croissant des paliers (comparaisons upgrade/downgrade). */
export const PLAN_ORDER: readonly PlanCode[] = PLAN_CODES;

export function isPlanCode(value: string): value is PlanCode {
  return (PLAN_CODES as readonly string[]).includes(value);
}

/** Résout un palier ; rejette les codes inconnus (fraude URL incluse). */
export function getPlan(code: string): BillingPlan | null {
  return isPlanCode(code) ? BILLING_PLANS[code] : null;
}

export function planRank(code: PlanCode): number {
  const index = PLAN_ORDER.indexOf(code);
  return index < 0 ? 0 : index;
}

export function isUpgrade(from: PlanCode, to: PlanCode): boolean {
  return planRank(to) > planRank(from);
}

/** « 59 $ » ou « 1 234,56 $ » (CAD, fr-CA). */
export function formatCad(cents: number): string {
  const formatted = (cents / 100).toLocaleString("fr-CA", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} $`;
}

/** « 1 Go » / « 500 Mo » / « 100 Go » à partir d'octets. */
export function formatBytesLimit(bytes: number | null): string {
  if (bytes === null) return "Illimité";
  if (bytes % GIB === 0) return `${bytes / GIB} Go`;
  if (bytes % (1024 ** 2) === 0) return `${bytes / 1024 ** 2} Mo`;
  return `${Math.ceil(bytes / GIB)} Go`;
}

/**
 * Plus petit palier couvrant un besoin (ex. suggestion d'upgrade sur
 * un dépassement de quota) — null si déjà au sommet.
 */
export function smallestPlanCovering(
  pick: (limits: PlanLimits) => number | null,
  requiredValue: number,
  after?: PlanCode,
): PlanCode | null {
  const floor = after ? planRank(after) : -1;
  for (const code of PLAN_ORDER) {
    if (planRank(code) <= floor) continue;
    const limit = pick(BILLING_PLANS[code].limits);
    if (limit === null || limit >= requiredValue) return code;
  }
  return null;
}
