/**
 * Financial Health Engine v1 — calcul DÉTERMINISTE du Financial Health
 * Index (FR-FHE-001). Aucune IA (aiGenerated=false) : le moteur produit
 * un score 0-100 sur 10 catégories + les explications exigées par
 * FR-FHE-002 (facteurs positifs, négatifs, pistes d'amélioration).
 *
 * Les repères financiers (cibles de ratios) sont des HEURISTIQUES
 * nord-américaines standard, versionnées avec le moteur.
 */

export const FHI_ENGINE_VERSION = "fhe-1.0";

export const FHI_CATEGORIES = [
  "LIQUIDITY",
  "BUDGET",
  "DEBT",
  "SAVINGS",
  "INVESTMENTS",
  "RETIREMENT",
  "TAX",
  "INSURANCE",
  "ESTATE",
  "GOALS",
] as const;
export type FhiCategory = (typeof FHI_CATEGORIES)[number];

/** Libellés FR canoniques des 10 catégories (source unique — UI + PDF). */
export const FHI_CATEGORY_LABELS: Record<FhiCategory, string> = {
  LIQUIDITY: "Liquidités",
  BUDGET: "Budget",
  DEBT: "Dettes",
  SAVINGS: "Épargne",
  INVESTMENTS: "Investissements",
  RETIREMENT: "Retraite",
  TAX: "Fiscalité",
  INSURANCE: "Assurance",
  ESTATE: "Succession",
  GOALS: "Objectifs",
};

/** Pondération v1 (somme = 1) — documentée en ADR-007. */
export const FHI_WEIGHTS: Record<FhiCategory, number> = {
  LIQUIDITY: 0.1,
  BUDGET: 0.12,
  DEBT: 0.12,
  SAVINGS: 0.1,
  INVESTMENTS: 0.08,
  RETIREMENT: 0.15,
  TAX: 0.1,
  INSURANCE: 0.13,
  ESTATE: 0.03,
  GOALS: 0.07,
};

export type FhiInsightType = "STRENGTH" | "RISK" | "OPPORTUNITY" | "ACTION";
export type FhiSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface FhiInsight {
  type: FhiInsightType;
  category: FhiCategory;
  severity: FhiSeverity;
  message: string;
  recommendation?: string;
}

/** Entrées AGRÉGÉES du moteur (assemblées par le service à partir des
 * tables granulaires — le moteur lui-même ne touche jamais la DB). */
export interface FhiInput {
  age: number | null;
  dependents: number;
  annualIncome: number;
  monthlyExpenses: number; // hors catégorie SAVINGS
  monthlySavings: number;
  monthlyDebtPayments: number;
  consumerDebt: number; // cartes + marges
  totalDebt: number;
  liquidAssets: number; // CASH
  investedAssets: number; // INVESTMENT
  registeredAssets: number; // comptes enregistrés (REER/CELI…)
  realEstate: number;
  otherAssets: number;
  lifeCoverage: number;
  hasDisabilityInsurance: boolean;
  retirementAge: number | null;
  targetRetirementIncome: number | null;
  registeredAccountsUsage: "NONE" | "PARTIAL" | "FULL" | "UNKNOWN";
  hasWill: boolean;
  beneficiariesStatus: "YES" | "NO" | "OUTDATED" | "UNKNOWN";
  activeGoalsCount: number;
  /** Couverture des cibles d'objectifs par les actifs mobilisables (0..1+). */
  goalsFundedRatio: number;
}

export interface FhiResult {
  score: number;
  categoryScores: Record<FhiCategory, number>;
  insights: FhiInsight[];
  ratios: Record<string, number>;
  engineVersion: typeof FHI_ENGINE_VERSION;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toScore = (ratio: number) => Math.round(clamp01(ratio) * 100);
const round = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Multiple du revenu à avoir accumulé pour la retraite, selon l'âge
 *  (0,5× à 25 ans → 10× à 65 ans et plus). */
export function retirementMultiple(age: number): number {
  return Math.min(10, Math.max(0.5, ((age - 25) / 40) * 10));
}

export function computeFhi(input: FhiInput): FhiResult {
  const insights: FhiInsight[] = [];
  const scores = {} as Record<FhiCategory, number>;
  const push = (insight: FhiInsight) => insights.push(insight);

  const monthlyIncome = input.annualIncome / 12;
  const incomePositive = input.annualIncome > 0;

  // ── LIQUIDITY — mois de couverture (cible 3-6 mois) ──────────
  const monthlyOutflow =
    input.monthlyExpenses + input.monthlyDebtPayments;
  const liquidMonths =
    monthlyOutflow > 0 ? input.liquidAssets / monthlyOutflow : 3;
  scores.LIQUIDITY =
    monthlyOutflow <= 0
      ? 80
      : liquidMonths >= 6
        ? 100
        : liquidMonths >= 3
          ? Math.round(70 + ((liquidMonths - 3) / 3) * 30)
          : Math.round((liquidMonths / 3) * 70);
  if (monthlyOutflow > 0 && liquidMonths < 3) {
    push({
      type: "RISK",
      category: "LIQUIDITY",
      severity: liquidMonths < 1 ? "HIGH" : "MEDIUM",
      message: `L'épargne liquide couvre ${round(liquidMonths)} mois de dépenses — la cible est de 3 à 6 mois.`,
      recommendation:
        "Bâtir un compte d'épargne dédié aux imprévus, alimenté automatiquement à chaque paie.",
    });
  } else if (liquidMonths >= 3) {
    push({
      type: "STRENGTH",
      category: "LIQUIDITY",
      severity: "LOW",
      message: `Fonds d'urgence sain : ${round(liquidMonths)} mois de dépenses couverts.`,
    });
  }

  // ── BUDGET — marge mensuelle (cible ≥ 20 % du revenu) ────────
  const monthlySurplus =
    monthlyIncome -
    input.monthlyExpenses -
    input.monthlyDebtPayments -
    input.monthlySavings;
  const surplusRatio = incomePositive ? monthlySurplus / monthlyIncome : -1;
  scores.BUDGET = !incomePositive
    ? 20
    : toScore((surplusRatio + 0.05) / 0.25); // -5 % → 0 … +20 % → 100
  if (incomePositive && surplusRatio < 0) {
    push({
      type: "RISK",
      category: "BUDGET",
      severity: surplusRatio < -0.1 ? "HIGH" : "MEDIUM",
      message: `Le budget est en déficit : les sorties dépassent les revenus de ${pct(Math.abs(surplusRatio))}.`,
      recommendation:
        "Revoir les postes discrétionnaires (loisirs, abonnements) et établir un budget réaliste par catégorie.",
    });
  } else if (surplusRatio >= 0.2) {
    push({
      type: "STRENGTH",
      category: "BUDGET",
      severity: "LOW",
      message: `Excellente marge budgétaire : ${pct(surplusRatio)} du revenu disponible après toutes les dépenses.`,
    });
  }

  // ── DEBT — service de la dette (cible ≤ 36 %) + consommation ─
  const debtServiceRatio = incomePositive
    ? (input.monthlyDebtPayments + 0) / monthlyIncome
    : 1;
  scores.DEBT = !incomePositive
    ? 20
    : toScore((0.45 - debtServiceRatio) / (0.45 - 0.2));
  if (debtServiceRatio >= 0.36 && incomePositive) {
    push({
      type: "RISK",
      category: "DEBT",
      severity: debtServiceRatio >= 0.43 ? "HIGH" : "MEDIUM",
      message: `Les paiements de dette absorbent ${pct(debtServiceRatio)} du revenu (cible : 36 % ou moins).`,
      recommendation:
        "Prioriser le remboursement des soldes les plus coûteux (cartes de crédit) et envisager une consolidation.",
    });
  } else if (incomePositive && consumerZero(input) && debtServiceRatio <= 0.2) {
    push({
      type: "STRENGTH",
      category: "DEBT",
      severity: "LOW",
      message: "Endettement très bien contrôlé — aucune dette à la consommation et un service de la dette faible.",
    });
  }
  if (input.consumerDebt > 0) {
    const costly = input.consumerDebt > input.annualIncome * 0.2;
    push({
      type: costly ? "RISK" : "OPPORTUNITY",
      category: "DEBT",
      severity: costly ? "MEDIUM" : "LOW",
      message: `Dettes à la consommation de ${Math.round(input.consumerDebt).toLocaleString("fr-CA")} $ — leur taux dépasse généralement tout rendement de placement raisonnable.`,
      recommendation:
        "Appliquer la méthode « avalanche » : rembourser d'abord le solde au taux le plus élevé.",
    });
  }

  // ── SAVINGS — taux d'épargne (cible 15 %) ────────────────────
  const savingsRate = incomePositive
    ? (input.monthlySavings * 12) / input.annualIncome
    : 0;
  scores.SAVINGS = !incomePositive ? 10 : toScore(savingsRate / 0.15);
  if (incomePositive && savingsRate >= 0.15) {
    push({
      type: "STRENGTH",
      category: "SAVINGS",
      severity: "LOW",
      message: `Discipline d'épargne remarquable : ${pct(savingsRate)} du revenu.`,
    });
  } else if (incomePositive && savingsRate < 0.05) {
    push({
      type: "OPPORTUNITY",
      category: "SAVINGS",
      severity: "MEDIUM",
      message: `Le taux d'épargne (${pct(savingsRate)}) est sous le repère de 15 % du revenu.`,
      recommendation:
        "Automatiser un virement vers l'épargne à chaque paie, même modeste, puis augmenter de 1 % par année.",
    });
  }

  // ── INVESTMENTS — actifs investis vs actifs financiers ───────
  const financialAssets =
    input.liquidAssets + input.investedAssets;
  const investRatio =
    financialAssets > 0 ? input.investedAssets / financialAssets : 0;
  scores.INVESTMENTS = financialAssets <= 0 ? 10 : toScore(investRatio / 0.7);
  if (financialAssets > 5_000 && investRatio < 0.3) {
    push({
      type: "OPPORTUNITY",
      category: "INVESTMENTS",
      severity: "MEDIUM",
      message: `${pct(1 - investRatio)} des actifs financiers dorment en liquidités — l'inflation érode leur valeur à long terme.`,
      recommendation:
        "Investir l'excédent au-delà du fonds d'urgence selon le profil de risque et l'horizon du client.",
    });
  } else if (investRatio >= 0.5) {
    push({
      type: "STRENGTH",
      category: "INVESTMENTS",
      severity: "LOW",
      message: "Bonne mobilisation des actifs : la majorité des liquidités excédentaires travaille en placements.",
    });
  }

  // ── RETIREMENT — progression vs repère d'âge + plan ──────────
  let retirementScore = 0;
  if (input.age !== null && incomePositive) {
    const target = input.annualIncome * retirementMultiple(input.age);
    const progress = target > 0 ? input.registeredAssets / target : 0;
    const rateComponent = clamp01(savingsRate / 0.12);
    const planBonus = input.retirementAge !== null && input.targetRetirementIncome !== null ? 10 : 0;
    retirementScore = Math.min(
      100,
      Math.round(0.6 * clamp01(progress) * 100 + 0.3 * rateComponent * 100 + planBonus),
    );
    if (progress < 0.5 && input.retirementAge !== null && input.retirementAge - input.age <= 15) {
      push({
        type: "RISK",
        category: "RETIREMENT",
        severity: "MEDIUM",
        message: "L'épargne-retraite accumulée est en retard sur les repères pour cet horizon de départ à la retraite.",
        recommendation:
          "Établir un plan de rattrapage : augmenter les cotisations et vérifier l'âge de retraite cible avec des projections.",
      });
    } else if (progress >= 1) {
      push({
        type: "STRENGTH",
        category: "RETIREMENT",
        severity: "LOW",
        message: "L'épargne-retraite est en avance sur les repères d'âge.",
      });
    }
  } else if (input.retirementAge === null) {
    push({
      type: "ACTION",
      category: "RETIREMENT",
      severity: "LOW",
      message: "Aucun plan de retraite documenté dans le dossier.",
      recommendation: "Définir l'âge de retraite visé et le revenu souhaité dans la section Retraite du profil financier.",
    });
    retirementScore = 25;
  }
  scores.RETIREMENT = retirementScore;

  // ── TAX — optimisation des comptes enregistrés ───────────────
  scores.TAX = {
    FULL: 100,
    PARTIAL: 60,
    NONE: 20,
    UNKNOWN: 40,
  }[input.registeredAccountsUsage];
  if (input.registeredAccountsUsage === "NONE" && input.annualIncome > 50_000) {
    push({
      type: "RISK",
      category: "TAX",
      severity: "MEDIUM",
      message: "Aucun compte enregistré utilisé malgré un revenu imposable significatif — de l'espace REER/CELI est perdu chaque année.",
      recommendation:
        "Prioriser le TFSA/REER selon le taux marginal d'imposition : économie d'impôt immédiate ou croissance libre d'impôt.",
    });
  } else if (input.registeredAccountsUsage === "FULL") {
    push({
      type: "STRENGTH",
      category: "TAX",
      severity: "LOW",
      message: "Pleine utilisation des comptes enregistrés — optimisation fiscale au rendez-vous.",
    });
  } else if (input.registeredAccountsUsage === "PARTIAL") {
    push({
      type: "OPPORTUNITY",
      category: "TAX",
      severity: "LOW",
      message: "Les droits de cotisation REER/CELI ne sont pas pleinement utilisés.",
      recommendation: "Vérifier le plafond de cotisation disponible et combler l'écart graduellement.",
    });
  }

  // ── INSURANCE — couverture vie vs besoin proxy ───────────────
  {
    const needsCover =
      input.dependents > 0
        ? input.annualIncome * 10
        : input.annualIncome * 3;
    const coverRatio =
      needsCover > 0 ? input.lifeCoverage / needsCover : 1;
    let base =
      input.dependents > 0
        ? input.lifeCoverage <= 0
          ? 10
          : toScore(coverRatio)
        : input.lifeCoverage <= 0
          ? 70
          : toScore(0.7 + coverRatio * 0.3);
    if (input.hasDisabilityInsurance) base = Math.min(100, base + 10);
    scores.INSURANCE = base;
    if (input.dependents > 0 && coverRatio < 0.5) {
      push({
        type: "RISK",
        category: "INSURANCE",
        severity: !input.hasDisabilityInsurance ? "HIGH" : "MEDIUM",
        message: `${input.dependents} personne(s) dépendent des revenus, mais la couverture vie (${Math.round(coverRatio * 100)} % du repère ~10× revenu) est insuffisante.`,
        recommendation:
          "Évaluer un temporaire vie et une protection invalidité adaptée aux charges familiales et aux dettes.",
      });
    } else if (input.lifeCoverage > 0 && coverRatio >= 0.7) {
      push({
        type: "STRENGTH",
        category: "INSURANCE",
        severity: "LOW",
        message: "Couverture d'assurance vie adéquate pour le niveau de revenu et la famille.",
      });
    }
    if (!input.hasDisabilityInsurance && input.annualIncome > 0) {
      push({
        type: "OPPORTUNITY",
        category: "INSURANCE",
        severity: "LOW",
        message: "Aucune protection invalidité — le revenu, principal actif du client, n'est pas protégé.",
        recommendation: "Vérifier la couverture invalidité collective ou individuelle.",
      });
    }
  }

  // ── ESTATE — testament + bénéficiaires ───────────────────────
  {
    let estate = 0;
    if (input.hasWill) estate += 60;
    if (input.beneficiariesStatus === "YES") estate += 40;
    else if (input.beneficiariesStatus === "OUTDATED") estate += 15;
    scores.ESTATE = estate;
    if (!input.hasWill) {
      push({
        type: input.dependents > 0 || financialAssets > 100_000 ? "RISK" : "OPPORTUNITY",
        category: "ESTATE",
        severity: input.dependents > 0 ? "HIGH" : "MEDIUM",
        message: "Aucun testament enregistré — la succession serait régie par les règles légales par défaut.",
        recommendation: "Rédiger un testament et une procuration, désigner les bénéficiaires des comptes enregistrés.",
      });
    } else if (input.beneficiariesStatus === "OUTDATED" || input.beneficiariesStatus === "NO") {
      push({
        type: "OPPORTUNITY",
        category: "ESTATE",
        severity: "LOW",
        message: "Les désignations de bénéficiaires méritent une révision (REER, CELI, assurances).",
        recommendation: "Revoir les bénéficiaires désignés après chaque événement de vie majeur.",
      });
    } else if (input.beneficiariesStatus === "YES") {
      push({
        type: "STRENGTH",
        category: "ESTATE",
        severity: "LOW",
        message: "Testament et désignations de bénéficiaires à jour.",
      });
    }
  }

  // ── GOALS — objectifs définis et financés ────────────────────
  {
    const funded = clamp01(input.goalsFundedRatio);
    scores.GOALS =
      input.activeGoalsCount <= 0
        ? 30
        : Math.min(100, Math.round(40 + funded * 60));
    if (input.activeGoalsCount <= 0) {
      push({
        type: "ACTION",
        category: "GOALS",
        severity: "LOW",
        message: "Aucun objectif financier actif dans le dossier.",
        recommendation: "Documenter au moins un objectif (montant, échéance, priorité) dans la section Objectifs.",
      });
    } else if (funded < 0.3) {
      push({
        type: "OPPORTUNITY",
        category: "GOALS",
        severity: "MEDIUM",
        message: "Les objectifs déclarés sont peu financés par les actifs mobilisables actuels.",
        recommendation: "Associer un plan d'épargne dédié à chaque objectif et réviser les échéances au besoin.",
      });
    } else {
      push({
        type: "STRENGTH",
        category: "GOALS",
        severity: "LOW",
        message: "Les objectifs sont clairement définis et raisonnablement financés.",
      });
    }
  }

  // ── Score global pondéré ─────────────────────────────────────
  const globalScore = Math.round(
    FHI_CATEGORIES.reduce(
      (total, cat) => total + scores[cat] * FHI_WEIGHTS[cat],
      0,
    ),
  );

  return {
    score: globalScore,
    categoryScores: scores,
    insights,
    ratios: {
      emergencyMonths: round(liquidMonths),
      budgetSurplusRatio: round(surplusRatio),
      debtServiceRatio: round(debtServiceRatio),
      savingsRate: round(savingsRate),
      investRatio: round(investRatio),
      goalsFundedRatio: round(input.goalsFundedRatio),
    },
    engineVersion: FHI_ENGINE_VERSION,
  };
}

function consumerZero(input: FhiInput): boolean {
  return input.consumerDebt <= 0;
}
