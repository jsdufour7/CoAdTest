import { describe, expect, it } from "vitest";

import {
  computeFhi,
  FHI_CATEGORIES,
  FHI_WEIGHTS,
  FHI_ENGINE_VERSION,
  retirementMultiple,
} from "../engine";
import type { FhiInput } from "../engine";

/** Profil sain de référence (famille, bonne discipline financière). */
const HEALTHY: FhiInput = {
  age: 40,
  dependents: 3,
  annualIncome: 153_000,
  monthlyExpenses: 4_420,
  monthlySavings: 800,
  monthlyDebtPayments: 1_870,
  consumerDebt: 2_400,
  totalDebt: 314_400,
  liquidAssets: 22_000,
  investedAssets: 152_000,
  registeredAssets: 118_000,
  realEstate: 465_000,
  otherAssets: 0,
  lifeCoverage: 1_000_000,
  hasDisabilityInsurance: true,
  retirementAge: 65,
  targetRetirementIncome: 68_000,
  registeredAccountsUsage: "PARTIAL",
  hasWill: true,
  beneficiariesStatus: "YES",
  activeGoalsCount: 2,
  goalsFundedRatio: 0.12,
};

/** Profil fragile de référence. */
const FRAGILE: FhiInput = {
  age: 45,
  dependents: 2,
  annualIncome: 62_000,
  monthlyExpenses: 3_900,
  monthlySavings: 0,
  monthlyDebtPayments: 1_900,
  consumerDebt: 21_000,
  totalDebt: 47_000,
  liquidAssets: 800,
  investedAssets: 4_000,
  registeredAssets: 4_000,
  realEstate: 0,
  otherAssets: 0,
  lifeCoverage: 0,
  hasDisabilityInsurance: false,
  retirementAge: 62,
  targetRetirementIncome: null,
  registeredAccountsUsage: "NONE",
  hasWill: false,
  beneficiariesStatus: "UNKNOWN",
  activeGoalsCount: 0,
  goalsFundedRatio: 0,
};

describe("retirementMultiple", () => {
  it("croît de 0,5× à 10× entre 25 et 65 ans", () => {
    expect(retirementMultiple(25)).toBe(0.5);
    expect(retirementMultiple(65)).toBe(10);
    expect(retirementMultiple(45)).toBeGreaterThan(retirementMultiple(35));
  });
});

describe("computeFhi — structure", () => {
  it("produit les 10 catégories FHE, bornées 0-100", () => {
    const r = computeFhi(HEALTHY);
    expect(FHI_CATEGORIES).toHaveLength(10);
    for (const cat of FHI_CATEGORIES) {
      expect(r.categoryScores[cat]).toBeGreaterThanOrEqual(0);
      expect(r.categoryScores[cat]).toBeLessThanOrEqual(100);
    }
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.engineVersion).toBe(FHI_ENGINE_VERSION);
  });

  it("les pondérations totalisent exactement 1", () => {
    expect(
      Object.values(FHI_WEIGHTS).reduce((a, b) => a + b, 0),
    ).toBeCloseTo(1, 12);
  });

  it("est déterministe", () => {
    expect(computeFhi(HEALTHY)).toEqual(computeFhi(HEALTHY));
  });

  it("un profil sain surpasse nettement un profil fragile", () => {
    expect(computeFhi(HEALTHY).score).toBeGreaterThan(
      computeFhi(FRAGILE).score + 30,
    );
  });
});

describe("computeFhi — explications FR-FHE-002", () => {
  it("produit facteurs positifs ET négatifs sur le profil sain", () => {
    const { insights } = computeFhi(HEALTHY);
    expect(insights.some((i) => i.type === "STRENGTH")).toBe(true);
  });

  it("signale l'absence d'assurance vie avec des personnes à charge", () => {
    const r = computeFhi(FRAGILE);
    expect(
      r.insights.some((i) => i.category === "INSURANCE" && i.type === "RISK"),
    ).toBe(true);
    expect(r.categoryScores.INSURANCE).toBeLessThanOrEqual(30);
  });

  it("signale l'absence de testament", () => {
    const r = computeFhi(FRAGILE);
    expect(
      r.insights.some((i) => i.category === "ESTATE" && i.type === "RISK"),
    ).toBe(true);
  });

  it("signale les comptes enregistrés inutilisés sur revenu significatif", () => {
    const r = computeFhi(FRAGILE);
    expect(
      r.insights.some((i) => i.category === "TAX" && i.type === "RISK"),
    ).toBe(true);
  });

  it("chaque insight négatif porte une recommandation actionnable", () => {
    for (const insight of computeFhi(FRAGILE).insights) {
      if (insight.type === "RISK" || insight.type === "ACTION") {
        expect(insight.recommendation).toBeTruthy();
      }
    }
  });

  it("les ratios clés sont exposés pour l'affichage", () => {
    const r = computeFhi(HEALTHY);
    expect(r.ratios.emergencyMonths).toBeGreaterThan(0);
    expect(r.ratios.debtServiceRatio).toBeGreaterThan(0);
    expect(r.ratios.savingsRate).toBeGreaterThan(0);
  });
});
