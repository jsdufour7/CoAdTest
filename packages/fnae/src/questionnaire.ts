import { z } from "zod";

/**
 * Questionnaire public express (FR-FNAE-001) — < 3 minutes.
 * Collecte : revenus, dépenses, actifs, dettes, retraite, objectifs,
 * protection. Minimisation des données (Loi 25) : aucune coordonnée
 * tant que le visiteur ne demande pas à être contacté (capture lead à part).
 */

/** Champ montant requis — "" (champ vide) est coercé à 0. */
const money = (max = 100_000_000) =>
  z.coerce
    .number({ invalid_type_error: "Montant invalide." })
    .min(0, "Le montant ne peut pas être négatif.")
    .max(max, "Montant irréaliste.");

/** Champ montant facultatif — vide ou absent → undefined. */
const optionalMoney = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().min(0, "Le montant ne peut pas être négatif.").max(100_000_000).optional(),
);

export const HOUSEHOLD_TYPES = ["SINGLE", "COUPLE", "FAMILY"] as const;
export const INSURANCE_LEVELS = ["NONE", "PARTIAL", "ADEQUATE"] as const;
export const PRIMARY_GOALS = [
  "RETIREMENT",
  "HOME",
  "EDUCATION",
  "DEBT_REPAYMENT",
  "EMERGENCY_FUND",
  "OTHER",
] as const;

export const questionnaireSchema = z
  .object({
    // Profil
    age: z.coerce
      .number({ invalid_type_error: "Âge invalide." })
      .int("Âge invalide.")
      .min(18, "L'analyse est réservée aux adultes (18 ans et plus).")
      .max(100, "Âge irréaliste."),
    householdType: z.enum(HOUSEHOLD_TYPES),
    dependents: z.coerce
      .number({ invalid_type_error: "Nombre invalide." })
      .int()
      .min(0, "Ne peut pas être négatif.")
      .max(10, "Valeur irréaliste."),

    // Revenus (annuels bruts)
    annualIncome: z.coerce
      .number({ invalid_type_error: "Montant invalide." })
      .gt(0, "Votre revenu annuel est requis pour le calcul.")
      .max(100_000_000, "Montant irréaliste."),
    otherAnnualIncome: money(),

    // Dépenses (mensuelles)
    housingMonthly: money(),
    otherMonthlyExpenses: money(),

    // Actifs
    liquidSavings: money(),
    investments: money(),
    retirementSavings: money(),
    homeValue: optionalMoney,

    // Dettes
    mortgageBalance: optionalMoney,
    consumerDebt: money(),
    monthlyDebtPayments: money(),

    // Retraite & épargne
    retirementAge: z.coerce
      .number({ invalid_type_error: "Âge invalide." })
      .int()
      .min(50, "L'âge de retraite visé doit être d'au moins 50 ans.")
      .max(80, "Âge de retraite irréaliste."),
    monthlySavings: money(),

    // Protection
    lifeInsurance: z.enum(INSURANCE_LEVELS),

    // Objectifs
    primaryGoal: z.enum(PRIMARY_GOALS),
    goalHorizonYears: z.coerce
      .number({ invalid_type_error: "Horizon invalide." })
      .int()
      .min(1, "Horizon minimal : 1 an.")
      .max(40, "Horizon maximal : 40 ans."),
    goalAmount: optionalMoney,
  })
  .superRefine((data, ctx) => {
    if (data.retirementAge < data.age) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["retirementAge"],
        message:
          "L'âge de retraite visé doit être supérieur ou égal à votre âge actuel.",
      });
    }
  });

export type QuestionnaireAnswers = z.infer<typeof questionnaireSchema>;
export type HouseholdType = (typeof HOUSEHOLD_TYPES)[number];
export type InsuranceLevel = (typeof INSURANCE_LEVELS)[number];
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];
