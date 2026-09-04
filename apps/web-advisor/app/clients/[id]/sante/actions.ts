"use server";

import { revalidatePath } from "next/cache";

import {
  calculateFhi,
  createPortalInvite,
  revokePortalAccess,
} from "@coadvisor/health-engine";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";

/** État des mutations de la page Santé (invitation portail incluse). */
export interface SanteMutationState {
  error?: string;
  success?: boolean;
  /** Code d'invitation — affiché UNE SEULE fois, jamais relisible ensuite. */
  inviteCode?: string;
}

function toError(error: unknown): SanteMutationState {
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

/** Recalcule l'indice FHI — snapshot immuable + historique (Règle 3). */
export async function recalculateFhiAction(
  clientId: string,
  _prevState: SanteMutationState,
  _formData: FormData,
): Promise<SanteMutationState> {
  const { actor } = await requireAdvisorContext();
  try {
    await calculateFhi(actor, clientId, await getRequestMeta());
  } catch (error) {
    return toError(error);
  }
  revalidatePath(`/clients/${clientId}/sante`);
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}

/** Génère un code d'invitation portail (révoque l'ancien lien s'il existe). */
export async function invitePortalAction(
  clientId: string,
  _prevState: SanteMutationState,
  _formData: FormData,
): Promise<SanteMutationState> {
  const { actor } = await requireAdvisorContext();
  let code: string;
  try {
    const invite = await createPortalInvite(actor, clientId, await getRequestMeta());
    code = invite.code;
  } catch (error) {
    return toError(error);
  }
  revalidatePath(`/clients/${clientId}/sante`);
  return { success: true, inviteCode: code };
}

/** Révoque l'accès portail du particulier (formulaire serveur). */
export async function revokePortalAction(clientId: string): Promise<void> {
  const { actor } = await requireAdvisorContext();
  await revokePortalAccess(actor, clientId, await getRequestMeta());
  revalidatePath(`/clients/${clientId}/sante`);
}
