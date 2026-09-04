export {
  computeFhi,
  retirementMultiple,
  FHI_CATEGORIES,
  FHI_CATEGORY_LABELS,
  FHI_ENGINE_VERSION,
  FHI_WEIGHTS,
  type FhiCategory,
  type FhiInput,
  type FhiInsight,
  type FhiInsightType,
  type FhiResult,
  type FhiSeverity,
} from "./engine";
export {
  addAssetSchema,
  addExpenseSchema,
  addGoalSchema,
  addIncomeSchema,
  addInsuranceSchema,
  addLiabilitySchema,
  upsertFinancialContextSchema,
  upsertRetirementPlanSchema,
} from "./schemas";
export {
  addAsset,
  addExpense,
  addGoal,
  addIncome,
  addInsurance,
  addLiability,
  getFinancialProfile,
  removeEntry,
  upsertFinancialContext,
  upsertRetirementPlan,
} from "./services/profile";
export { calculateFhi, getHealthDashboard } from "./services/assessment";
export {
  claimPortalInvite,
  createPortalInvite,
  getPortalDashboard,
  getPortalLinkForClient,
  listPortalLinksForClient,
  revokePortalAccess,
  type PortalInvite,
} from "./services/portal";
export type { HealthActor } from "./actor";
