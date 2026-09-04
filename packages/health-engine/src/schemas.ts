import { z } from "zod";

/** Schémas d'entrée des données financières granulaires (FR-FHE-001).
 *  Montants aidés par formulaires HTML (chaînes → nombres). */
const money = z.coerce
  .number({ invalid_type_error: "Montant invalide." })
  .min(0, "Le montant ne peut pas être négatif.")
  .max(1_000_000_000, "Montant irréaliste.");

const optionalMoney = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().min(0, "Le montant ne peut pas être négatif.").max(1_000_000_000).optional(),
);

const optionalText = (max: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );

const optionalDate = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.date().optional(),
);

// ── Actifs ─────────────────────────────────────────────────────
export const addAssetSchema = z.object({
  type: z.enum(["CASH", "INVESTMENT", "REAL_ESTATE", "BUSINESS", "OTHER"]),
  label: z.string().trim().min(1, "La description est requise.").max(120),
  institution: optionalText(120),
  value: money,
  registered: z.preprocess(
    (value) => value === "on" || value === "true" || value === true,
    z.boolean(),
  ),
  notes: optionalText(500),
});
export type AddAssetInput = z.infer<typeof addAssetSchema>;

// ── Dettes ─────────────────────────────────────────────────────
export const addLiabilitySchema = z.object({
  type: z.enum(["MORTGAGE", "LOAN", "CREDIT_CARD", "LINE_OF_CREDIT"]),
  label: z.string().trim().min(1, "La description est requise.").max(120),
  balance: money,
  interestRate: optionalMoney,
  monthlyPayment: money,
});
export type AddLiabilityInput = z.infer<typeof addLiabilitySchema>;

// ── Revenus ────────────────────────────────────────────────────
export const addIncomeSchema = z.object({
  label: z.string().trim().min(1, "La source est requise.").max(120),
  amount: money,
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "ANNUAL"]),
  taxable: z.preprocess(
    (value) => value === "on" || value === "true" || value === true || value === undefined,
    z.boolean(),
  ),
});
export type AddIncomeInput = z.infer<typeof addIncomeSchema>;

// ── Dépenses ───────────────────────────────────────────────────
export const addExpenseSchema = z.object({
  category: z.enum([
    "HOUSING",
    "FOOD",
    "TRANSPORT",
    "UTILITIES",
    "INSURANCE",
    "LEISURE",
    "SAVINGS",
    "OTHER",
  ]),
  label: optionalText(120),
  amount: money,
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "ANNUAL"]),
});
export type AddExpenseInput = z.infer<typeof addExpenseSchema>;

// ── Assurances ─────────────────────────────────────────────────
export const addInsuranceSchema = z.object({
  type: z.enum(["LIFE", "DISABILITY", "CRITICAL_ILLNESS", "PROPERTY"]),
  provider: optionalText(120),
  coverage: money,
  premium: money,
});
export type AddInsuranceInput = z.infer<typeof addInsuranceSchema>;

// ── Objectifs ──────────────────────────────────────────────────
export const addGoalSchema = z.object({
  name: z.string().trim().min(1, "L'objectif est requis.").max(160),
  targetAmount: money,
  targetDate: optionalDate,
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
export type AddGoalInput = z.infer<typeof addGoalSchema>;

// ── Plan de retraite (1:1) ─────────────────────────────────────
export const upsertRetirementPlanSchema = z.object({
  retirementAge: z.coerce
    .number({ invalid_type_error: "Âge invalide." })
    .int()
    .min(50, "L'âge de retraite visé doit être d'au moins 50 ans.")
    .max(80, "Âge irréaliste."),
  targetAnnualIncome: money,
});
export type UpsertRetirementPlanInput = z.infer<
  typeof upsertRetirementPlanSchema
>;

// ── Contexte fiscalité & succession (1:1) ──────────────────────
export const upsertFinancialContextSchema = z.object({
  registeredAccountsUsage: z.enum(["NONE", "PARTIAL", "FULL", "UNKNOWN"]),
  hasWill: z.preprocess(
    (value) => value === "on" || value === "true" || value === true,
    z.boolean(),
  ),
  beneficiariesStatus: z.enum(["YES", "NO", "OUTDATED", "UNKNOWN"]),
});
export type UpsertFinancialContextInput = z.infer<
  typeof upsertFinancialContextSchema
>;
