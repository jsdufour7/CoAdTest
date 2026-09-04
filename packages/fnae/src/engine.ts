import type { QuestionnaireAnswers } from "./questionnaire";

/**
 * Moteur FNAE v1 — calcul DÉTERMINISTE du portrait financier.
 * Aucune IA ici (l'IA reste assistive et viendra expliquer, pas décider) :
 * score 0-100 sur 6 dimensions, fondé sur des ratios financiers standards.
 */

export const ENGINE_VERSION = "fnae-1.0";

export const DIMENSIONS = [
  "emergencyFund",
  "debt",
  "savings",
  "retirement",
  "protection",
  "goals",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_WEIGHTS: Record<Dimension, number> = {
  emergencyFund: 0.2,
  debt: 0.2,
  retirement: 0.2,
  savings: 0.15,
  protection: 0.15,
  goals: 0.1,
};

export type InsightType = "STRENGTH" | "RISK" | "OPPORTUNITY" | "ACTION";
export type Severity = "LOW" | "MEDIUM" | "HIGH";

export interface Insight {
  type: InsightType;
  dimension: Dimension;
  severity: Severity;
  message: string;
}

export type Profile = "FRAGILE" | "EN_PROGRESSION" | "SOLIDE" | "EXCELLENT";

export interface Ratios {
  monthlyIncome: number;
  monthlyNeeds: number;
  emergencyMonths: number;
  debtServiceRatio: number;
  savingsRate: number;
  retirementProgress: number;
}

export interface Portrait {
  profile: Profile;
  summary: string;
  dimensionScores: Record<Dimension, number>;
  insights: Insight[];
  /** 3 priorités d'action (dimensions les plus faibles). */
  priorities: string[];
  ratios: Ratios;
}

export interface EngineResult extends Portrait {
  score: number;
  engineVersion: typeof ENGINE_VERSION;
}

// ── Utilitaires ───────────────────────────────────────────────

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const score = (ratio: number) => Math.round(clamp01(ratio) * 100);
const round = (value: number) => Math.round(value * 100) / 100;

/** Multiple du revenu annuel à avoir accumulé pour la retraite, selon l'âge. */
export function targetRetirementMultiple(age: number): number {
  // 0,5× à 25 ans → 10× à 65 ans (repère nord-américain courant, simplifié)
  return Math.min(10, Math.max(0.5, ((age - 25) / 40) * 10));
}

// ── Moteur ────────────────────────────────────────────────────

export function computePortrait(answers: QuestionnaireAnswers): EngineResult {
  const totalAnnualIncome = answers.annualIncome + answers.otherAnnualIncome;
  const monthlyIncome = totalAnnualIncome / 12;
  const monthlyNeeds =
    answers.housingMonthly +
    answers.otherMonthlyExpenses +
    answers.monthlyDebtPayments;

  const insights: Insight[] = [];
  const dimensionScores = {} as Record<Dimension, number>;

  // 1. Fonds d'urgence — couverture des besoins mensuels (cible 3-6 mois)
  const emergencyMonths =
    monthlyNeeds > 0 ? answers.liquidSavings / monthlyNeeds : 3;
  dimensionScores.emergencyFund =
    monthlyNeeds === 0
      ? 80
      : emergencyMonths >= 6
        ? 100
        : emergencyMonths >= 3
          ? Math.round(70 + ((emergencyMonths - 3) / 3) * 30)
          : Math.round((emergencyMonths / 3) * 70);
  if (monthlyNeeds > 0 && emergencyMonths < 3) {
    insights.push({
      type: "RISK",
      dimension: "emergencyFund",
      severity: emergencyMonths < 1 ? "HIGH" : "MEDIUM",
      message: `Votre épargne liquide couvre environ ${round(emergencyMonths)} mois de besoins — la cible est de 3 à 6 mois.`,
    });
  } else if (emergencyMonths >= 3) {
    insights.push({
      type: "STRENGTH",
      dimension: "emergencyFund",
      severity: "LOW",
      message: `Fonds d'urgence sain : ${round(emergencyMonths)} mois de besoins couverts.`,
    });
  }

  // 2. Dettes — ratio de service de la dette (logement inclus)
  const debtService =
    (answers.monthlyDebtPayments + answers.housingMonthly) /
    Math.max(monthlyIncome, 1);
  dimensionScores.debt = score((0.45 - debtService) / (0.45 - 0.2));
  if (debtService >= 0.36) {
    insights.push({
      type: "RISK",
      dimension: "debt",
      severity: debtService >= 0.43 ? "HIGH" : "MEDIUM",
      message: `Vos paiements de dette et de logement absorbent ${Math.round(debtService * 100)} % de vos revenus (cible : 36 % ou moins).`,
    });
  } else if (debtService <= 0.2) {
    insights.push({
      type: "STRENGTH",
      dimension: "debt",
      severity: "LOW",
      message: "Excellent contrôle des dettes — votre marge de manœuvre est grande.",
    });
  }
  if (answers.consumerDebt > 0) {
    insights.push({
      type: answers.consumerDebt > totalAnnualIncome * 0.2 ? "RISK" : "OPPORTUNITY",
      dimension: "debt",
      severity: "MEDIUM",
      message: "Les dettes à la consommation (cartes, marges) coûtent cher : les rembourser est souvent le meilleur « placement » immédiat.",
    });
  }

  // 3. Épargne — taux d'épargne (cible 15 %)
  const savingsRate = (answers.monthlySavings * 12) / Math.max(totalAnnualIncome, 1);
  dimensionScores.savings = score(savingsRate / 0.15);
  if (savingsRate >= 0.15) {
    insights.push({
      type: "STRENGTH",
      dimension: "savings",
      severity: "LOW",
      message: `Rythme d'épargne remarquable : ${Math.round(savingsRate * 100)} % de vos revenus.`,
    });
  } else if (savingsRate < 0.05) {
    insights.push({
      type: "OPPORTUNITY",
      dimension: "savings",
      severity: "MEDIUM",
      message: "Automatiser même une petite cotisation (REER/CELI) à chaque paie transforme la trajectoire à long terme.",
    });
  }

  // 4. Retraite — progression vs repère d'âge + rythme d'épargne
  const retirementTarget = totalAnnualIncome * targetRetirementMultiple(answers.age);
  const retirementProgress =
    retirementTarget > 0 ? answers.retirementSavings / retirementTarget : 0;
  dimensionScores.retirement = score(
    0.65 * clamp01(retirementProgress) + 0.35 * clamp01(savingsRate / 0.12),
  );
  if (retirementProgress < 0.5 && answers.retirementAge - answers.age <= 15) {
    insights.push({
      type: "RISK",
      dimension: "retirement",
      severity: "MEDIUM",
      message: "L'horizon retraite se rapproche et le capital accumulé est en retard sur les repères — un plan de rattrapage s'impose.",
    });
  } else if (retirementProgress >= 1) {
    insights.push({
      type: "STRENGTH",
      dimension: "retirement",
      severity: "LOW",
      message: "Votre épargne-retraite est en avance sur les repères pour votre âge.",
    });
  }

  // 5. Protection — filet d'assurance si des personnes dépendent de vous
  const hasDependents = answers.dependents > 0 || answers.householdType === "FAMILY";
  dimensionScores.protection = hasDependents
    ? { NONE: 15, PARTIAL: 60, ADEQUATE: 95 }[answers.lifeInsurance]
    : { NONE: 70, PARTIAL: 85, ADEQUATE: 100 }[answers.lifeInsurance];
  if (hasDependents && answers.lifeInsurance === "NONE") {
    insights.push({
      type: "RISK",
      dimension: "protection",
      severity: "HIGH",
      message: "Des personnes dépendent de vos revenus, mais aucune protection d'assurance n'est en place — un risque majeur à couvrir.",
    });
  } else if (answers.lifeInsurance !== "NONE") {
    insights.push({
      type: "STRENGTH",
      dimension: "protection",
      severity: "LOW",
      message: "Une protection d'assurance est déjà en place — à revoir périodiquement selon l'évolution de vos besoins.",
    });
  }

  // 6. Objectifs — clarté + moyens d'y arriver
  const goalClarity = 50 + (answers.goalAmount ? 20 : 0) + 10; // objectif choisi + horizon + montant
  const goalMeans = clamp01(savingsRate / 0.1) * 40;
  dimensionScores.goals = Math.min(100, Math.round(goalClarity + goalMeans - 20));
  if (answers.goalHorizonYears <= 5 && savingsRate < 0.05) {
    insights.push({
      type: "OPPORTUNITY",
      dimension: "goals",
      severity: "MEDIUM",
      message: "Votre objectif principal arrive dans moins de 5 ans : une épargne dédiée, séparée du reste, augmente fortement les chances de l'atteindre.",
    });
  }

  // Score global pondéré
  const globalScore = Math.round(
    DIMENSIONS.reduce(
      (total, dim) => total + dimensionScores[dim] * DIMENSION_WEIGHTS[dim],
      0,
    ),
  );

  const profile: Profile =
    globalScore < 40
      ? "FRAGILE"
      : globalScore < 65
        ? "EN_PROGRESSION"
        : globalScore < 85
          ? "SOLIDE"
          : "EXCELLENT";

  // Priorités = 3 dimensions les plus faibles
  const ACTION_LABELS: Record<Dimension, string> = {
    emergencyFund: "Bâtir un fonds d'urgence couvrant 3 à 6 mois de besoins.",
    debt: "Réduire le poids des dettes, en commençant par les dettes à la consommation.",
    savings: "Mettre en place une épargne automatique à chaque paie.",
    retirement: "Accélérer l'épargne-retraite et valider votre plan avec un professionnel.",
    protection: "Protéger vos proches avec une couverture d'assurance adéquate.",
    goals: "Préciser votre objectif principal et lui dédier une épargne distincte.",
  };
  const priorities = [...DIMENSIONS]
    .sort((a, b) => dimensionScores[a] - dimensionScores[b])
    .slice(0, 3)
    .map((dim) => ACTION_LABELS[dim]);

  const SUMMARIES: Record<Profile, string> = {
    FRAGILE:
      "Vos fondations financières demandent une attention immédiate : quelques gestes ciblés peuvent rapidement changer la donne.",
    EN_PROGRESSION:
      "Vous avez de bonnes bases. Avec un plan structuré, vos prochaines années financières peuvent s'améliorer nettement.",
    SOLIDE:
      "Votre situation est globalement saine. L'enjeu maintenant : optimiser (fiscalité, placements, retraite) plutôt que réparer.",
    EXCELLENT:
      "Excellente discipline financière. Un accompagnement professionnel peut vous faire franchir le niveau supérieur d'optimisation.",
  };

  return {
    score: globalScore,
    profile,
    summary: SUMMARIES[profile],
    dimensionScores,
    insights,
    priorities,
    ratios: {
      monthlyIncome: round(monthlyIncome),
      monthlyNeeds: round(monthlyNeeds),
      emergencyMonths: round(emergencyMonths),
      debtServiceRatio: round(debtService),
      savingsRate: round(savingsRate),
      retirementProgress: round(retirementProgress),
    },
    engineVersion: ENGINE_VERSION,
  };
}
