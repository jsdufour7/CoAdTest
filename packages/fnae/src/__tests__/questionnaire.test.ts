import { describe, expect, it } from "vitest";

import { questionnaireSchema } from "../questionnaire";

const VALID = {
  age: "40",
  householdType: "COUPLE",
  dependents: "1",
  annualIncome: "75000",
  otherAnnualIncome: "5000",
  housingMonthly: "1500",
  otherMonthlyExpenses: "1800",
  liquidSavings: "12000",
  investments: "20000",
  retirementSavings: "60000",
  homeValue: "",
  mortgageBalance: "",
  consumerDebt: "2500",
  monthlyDebtPayments: "120",
  retirementAge: "65",
  monthlySavings: "400",
  lifeInsurance: "PARTIAL",
  primaryGoal: "RETIREMENT",
  goalHorizonYears: "25",
  goalAmount: "",
};

describe("questionnaireSchema (formulaire → types)", () => {
  it("coerce les chaînes de formulaire en nombres et les vides en undefined", () => {
    const parsed = questionnaireSchema.parse(VALID);
    expect(parsed.age).toBe(40);
    expect(parsed.annualIncome).toBe(75_000);
    expect(parsed.homeValue).toBeUndefined();
    expect(parsed.goalAmount).toBeUndefined();
  });

  it("exige un revenu annuel strictement positif", () => {
    const result = questionnaireSchema.safeParse({ ...VALID, annualIncome: "0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/revenu/i);
    }
  });

  it("refuse un visiteur mineur", () => {
    expect(questionnaireSchema.safeParse({ ...VALID, age: "17" }).success).toBe(
      false,
    );
  });

  it("refuse un âge de retraite inférieur à l'âge actuel", () => {
    const result = questionnaireSchema.safeParse({
      ...VALID,
      age: "60",
      retirementAge: "55",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("retirementAge");
    }
  });

  it("refuse les montants négatifs", () => {
    expect(
      questionnaireSchema.safeParse({ ...VALID, consumerDebt: "-100" }).success,
    ).toBe(false);
  });

  it("refuse les valeurs d'énumération inconnues", () => {
    expect(
      questionnaireSchema.safeParse({ ...VALID, primaryGoal: "YACHT" }).success,
    ).toBe(false);
  });
});
