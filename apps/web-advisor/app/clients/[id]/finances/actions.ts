"use server";

import { revalidatePath } from "next/cache";

import {
  addAsset,
  addExpense,
  addGoal,
  addIncome,
  addInsurance,
  addLiability,
  removeEntry,
  upsertFinancialContext,
  upsertRetirementPlan,
} from "@coadvisor/health-engine";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";

/** État des formulaires de mutation du profil financier. */
export interface MutationState {
  error?: string;
  success?: boolean;
}

function toError(error: unknown): MutationState {
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

type EntryKind = "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "INSURANCE" | "GOAL";

const ADDERS = {
  INCOME: addIncome,
  EXPENSE: addExpense,
  ASSET: addAsset,
  LIABILITY: addLiability,
  INSURANCE: addInsurance,
  GOAL: addGoal,
} as const;

/** Action générique d'ajout d'une entrée granulaire (auditée). */
export async function addEntryAction(
  kind: EntryKind,
  clientId: string,
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const { actor } = await requireAdvisorContext();
  try {
    await ADDERS[kind](
      Object.fromEntries(formData),
      actor,
      clientId,
      await getRequestMeta(),
    );
  } catch (error) {
    return toError(error);
  }
  revalidatePath(`/clients/${clientId}/finances`);
  return { success: true };
}

/** Retrait d'une entrée — ses valeurs restent archivées en audit (Règle 3). */
export async function removeEntryAction(
  kind: EntryKind,
  clientId: string,
  entryId: string,
): Promise<void> {
  const { actor } = await requireAdvisorContext();
  await removeEntry(kind, entryId, actor, await getRequestMeta());
  revalidatePath(`/clients/${clientId}/finances`);
}

export async function upsertRetirementPlanAction(
  clientId: string,
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const { actor } = await requireAdvisorContext();
  try {
    await upsertRetirementPlan(
      Object.fromEntries(formData),
      actor,
      clientId,
      await getRequestMeta(),
    );
  } catch (error) {
    return toError(error);
  }
  revalidatePath(`/clients/${clientId}/finances`);
  return { success: true };
}

export async function upsertFinancialContextAction(
  clientId: string,
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const { actor } = await requireAdvisorContext();
  try {
    await upsertFinancialContext(
      Object.fromEntries(formData),
      actor,
      clientId,
      await getRequestMeta(),
    );
  } catch (error) {
    return toError(error);
  }
  revalidatePath(`/clients/${clientId}/finances`);
  return { success: true };
}
