import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import { parseOrThrow } from "../actor";
import type { HealthActor, RequestMeta } from "../actor";
import {
  addAssetSchema,
  addExpenseSchema,
  addGoalSchema,
  addIncomeSchema,
  addInsuranceSchema,
  addLiabilitySchema,
  upsertFinancialContextSchema,
  upsertRetirementPlanSchema,
} from "../schemas";

/**
 * Profil financier granulaire du client (Data Architecture §5/§6).
 * Chaque ajout/retrait est audité (données financières sensibles) ; le
 * retrait physique conserve ses valeurs dans le journal d'audit immuable
 * (Règle 3 — rien n'est jamais « perdu »).
 */

type EntityKind =
  | "ASSET"
  | "LIABILITY"
  | "INCOME"
  | "EXPENSE"
  | "INSURANCE"
  | "GOAL";

const KIND_TO_MODEL: Record<EntityKind, string> = {
  ASSET: "asset",
  LIABILITY: "liability",
  INCOME: "income",
  EXPENSE: "expense",
  INSURANCE: "insurancePolicy",
  GOAL: "financialGoal",
};

const KIND_TO_ACTION = {
  ASSET: "finance.asset",
  LIABILITY: "finance.liability",
  INCOME: "finance.income",
  EXPENSE: "finance.expense",
  INSURANCE: "finance.insurance",
  GOAL: "finance.goal",
} as const;

async function ensureClient(actor: HealthActor, clientId: string) {
  const client = await withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.client.findFirst({ where: { id: clientId }, select: { id: true } }),
  );
  if (!client) {
    throw new ValidationError("Ce dossier client est introuvable.");
  }
}

function addEntry<K extends EntityKind>(
  kind: K,
  rawInput: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  const schemas = {
    ASSET: addAssetSchema,
    LIABILITY: addLiabilitySchema,
    INCOME: addIncomeSchema,
    EXPENSE: addExpenseSchema,
    INSURANCE: addInsuranceSchema,
    GOAL: addGoalSchema,
  };
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(schemas[kind], rawInput) as Record<
    string,
    unknown
  >;

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await ensureClient(actor, clientId);
    const model = KIND_TO_MODEL[kind];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (tx as any)[model].create({
      data: { tenantId: actor.tenantId, clientId, ...input },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `${KIND_TO_ACTION[kind]}.added`,
      entityType: model,
      entityId: created.id,
      newData: { clientId, ...input },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return created;
  });
}

export const addAsset = (
  raw: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) => addEntry("ASSET", raw, actor, clientId, meta);

export const addLiability = (
  raw: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) => addEntry("LIABILITY", raw, actor, clientId, meta);

export const addIncome = (
  raw: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) => addEntry("INCOME", raw, actor, clientId, meta);

export const addExpense = (
  raw: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) => addEntry("EXPENSE", raw, actor, clientId, meta);

export const addInsurance = (
  raw: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) => addEntry("INSURANCE", raw, actor, clientId, meta);

export const addGoal = (
  raw: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) => addEntry("GOAL", raw, actor, clientId, meta);

/** Retirer une entrée (valeurs archivées dans le journal d'audit). */
export async function removeEntry(
  kind: EntityKind,
  entryId: string,
  actor: HealthActor,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const model = KIND_TO_MODEL[kind];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (tx as any)[model].findFirst({
      where: { id: entryId },
    });
    if (!existing) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx as any)[model].delete({ where: { id: entryId } });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: `${KIND_TO_ACTION[kind]}.removed`,
      entityType: model,
      entityId: entryId,
      oldData: existing as object,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return true;
  });
}

/** Plan de retraite (upsert 1:1) — audité. */
export async function upsertRetirementPlan(
  rawInput: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(upsertRetirementPlanSchema, rawInput);

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await ensureClient(actor, clientId);
    const plan = await tx.retirementPlan.upsert({
      where: { clientId },
      create: { tenantId: actor.tenantId, clientId, ...input },
      update: { ...input },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "finance.retirement_plan.updated",
      entityType: "retirementPlan",
      entityId: plan.id,
      newData: { clientId, ...input },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return plan;
  });
}

/** Contexte fiscalité & succession (upsert 1:1) — audité. */
export async function upsertFinancialContext(
  rawInput: unknown,
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(upsertFinancialContextSchema, rawInput);

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await ensureClient(actor, clientId);
    const context = await tx.financialContext.upsert({
      where: { clientId },
      create: { tenantId: actor.tenantId, clientId, ...input },
      update: { ...input },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "finance.context.updated",
      entityType: "financialContext",
      entityId: context.id,
      newData: { clientId, ...input },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return context;
  });
}

/** Profil financier complet (lecture) — permission `clients:read`. */
export async function getFinancialProfile(
  actor: HealthActor,
  clientId: string,
) {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.client.findFirst({
      where: { id: clientId },
      select: {
        id: true,
        birthDate: true,
        familyMembers: { select: { role: true } },
        assets: { orderBy: { createdAt: "desc" } },
        liabilities: { orderBy: { createdAt: "desc" } },
        incomes: { orderBy: { createdAt: "desc" } },
        expenses: { orderBy: { createdAt: "desc" } },
        insurancePolicies: { orderBy: { createdAt: "desc" } },
        financialGoals: {
          where: { status: { not: "CANCELLED" } },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        },
        retirementPlan: true,
        financialContext: true,
      },
    }),
  );
}
