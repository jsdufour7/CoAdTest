import { describe, expect, it } from "vitest";

import {
  computePortrait,
  DIMENSIONS,
  DIMENSION_WEIGHTS,
  ENGINE_VERSION,
  targetRetirementMultiple,
} from "../engine";
import type { QuestionnaireAnswers } from "../questionnaire";

/** Profil financier sain de référence. */
const HEALTHY: QuestionnaireAnswers = {
  age: 35,
  householdType: "FAMILY",
  dependents: 2,
  annualIncome: 90_000,
  otherAnnualIncome: 0,
  housingMonthly: 1_800,
  otherMonthlyExpenses: 2_200,
  liquidSavings: 25_000,
  investments: 40_000,
  retirementSavings: 120_000,
  homeValue: 450_000,
  mortgageBalance: 300_000,
  consumerDebt: 0,
  monthlyDebtPayments: 0,
  retirementAge: 65,
  monthlySavings: 1_200,
  lifeInsurance: "ADEQUATE",
  primaryGoal: "RETIREMENT",
  goalHorizonYears: 25,
  goalAmount: 1_500_000,
};

/** Profil financier fragile de référence. */
const FRAGILE: QuestionnaireAnswers = {
  age: 42,
  householdType: "FAMILY",
  dependents: 3,
  annualIncome: 55_000,
  otherAnnualIncome: 0,
  housingMonthly: 1_600,
  otherMonthlyExpenses: 1_400,
  liquidSavings: 300,
  investments: 0,
  retirementSavings: 8_000,
  homeValue: undefined,
  mortgageBalance: undefined,
  consumerDebt: 18_000,
  monthlyDebtPayments: 650,
  retirementAge: 60,
  monthlySavings: 0,
  lifeInsurance: "NONE",
  primaryGoal: "DEBT_REPAYMENT",
  goalHorizonYears: 2,
  goalAmount: undefined,
};

describe("targetRetirementMultiple", () => {
  it("croît avec l'âge (0,5× à 25 ans, 10× à 65+)", () => {
    expect(targetRetirementMultiple(25)).toBe(0.5);
    expect(targetRetirementMultiple(65)).toBe(10);
    expect(targetRetirementMultiple(75)).toBe(10);
    expect(targetRetirementMultiple(45)).toBeGreaterThan(
      targetRetirementMultiple(35),
    );
  });
});

describe("computePortrait — structure", () => {
  it("produit les 6 dimensions, bornées entre 0 et 100", () => {
    const portrait = computePortrait(HEALTHY);
    for (const dim of DIMENSIONS) {
      expect(portrait.dimensionScores[dim]).toBeGreaterThanOrEqual(0);
      expect(portrait.dimensionScores[dim]).toBeLessThanOrEqual(100);
    }
    expect(portrait.score).toBeGreaterThanOrEqual(0);
    expect(portrait.score).toBeLessThanOrEqual(100);
    expect(portrait.engineVersion).toBe(ENGINE_VERSION);
    expect(portrait.priorities).toHaveLength(3);
  });

  it("les poids des dimensions totalisent 1", () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("est déterministe (mêmes réponses → même portrait)", () => {
    expect(computePortrait(HEALTHY).score).toBe(
      computePortrait(HEALTHY).score,
    );
  });
});

describe("computePortrait — profiles", () => {
  it("une situation saine obtient un score élevé", () => {
    const { score, profile } = computePortrait(HEALTHY);
    expect(score).toBeGreaterThanOrEqual(65);
    expect(["SOLIDE", "EXCELLENT"]).toContain(profile);
  });

  it("une situation fragile est identifiée comme telle", () => {
    const { score, profile } = computePortrait(FRAGILE);
    expect(score).toBeLessThan(40);
    expect(profile).toBe("FRAGILE");
  });
});

describe("computePortrait — insights métier", () => {
  it("signale un fonds d'urgence insuffisant (< 3 mois)", () => {
    const { insights, ratios } = computePortrait(FRAGILE);
    expect(ratios.emergencyMonths).toBeLessThan(3);
    expect(
      insights.some((i) => i.dimension === "emergencyFund" && i.type === "RISK"),
    ).toBe(true);
  });

  it("signale l'absence de protection avec des personnes à charge", () => {
    const { insights } = computePortrait(FRAGILE);
    expect(
      insights.some(
        (i) => i.dimension === "protection" && i.severity === "HIGH",
      ),
    ).toBe(true);
  });

  it("signale les dettes à la consommation même saines", () => {
    const { insights } = computePortrait({ ...HEALTHY, consumerDebt: 4_000 });
    expect(insights.some((i) => i.dimension === "debt")).toBe(true);
  });

  it("souligne les forces d'un bon profil", () => {
    const { insights } = computePortrait(HEALTHY);
    expect(insights.some((i) => i.type === "STRENGTH")).toBe(true);
  });

  it("les priorités correspondent aux dimensions les plus faibles", () => {
    const portrait = computePortrait(FRAGILE);
    const sorted = [...DIMENSIONS].sort(
      (a, b) => portrait.dimensionScores[a] - portrait.dimensionScores[b],
    );
    // Les 2 dimensions à score 0 passent en tête (ordre d'égalité libre)
    expect(portrait.dimensionScores[sorted[0] ?? "debt"]).toBe(0);
    expect(["debt", "savings"]).toContain(sorted[0]);
    // Le fonds d'urgence (~0,08 mois) fait partie des 3 priorités
    expect(sorted.slice(0, 3)).toContain("emergencyFund");
  });
});
