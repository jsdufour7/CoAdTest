"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addFamilyMember,
  addNote,
  addTask,
  createClient,
  createClientLink,
  deleteClientLink,
  setTaskStatus,
} from "@coadvisor/crm";
import { DomainError } from "@coadvisor/types";

import { getRequestMeta, requireAdvisorContext } from "../../lib/advisor-context";

/** État des formulaires de mutation (note, tâche, famille…). */
export interface MutationState {
  error?: string;
  success?: boolean;
}

export type BoundAction = (
  prevState: MutationState,
  formData: FormData,
) => Promise<MutationState>;

function toError(error: unknown): MutationState {
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

/** Création d'un dossier client → redirection vers la fiche. */
export async function createClientAction(
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const { actor } = await requireAdvisorContext();

  let clientId: string;
  try {
    const client = await createClient(
      Object.fromEntries(formData),
      actor,
      await getRequestMeta(),
    );
    clientId = client.id;
  } catch (error) {
    return toError(error);
  }

  redirect(`/clients/${clientId}`);
}

async function mutateClientData(
  clientId: string,
  mutation: () => Promise<unknown>,
): Promise<MutationState> {
  try {
    await mutation();
  } catch (error) {
    return toError(error);
  }
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}

export async function addNoteAction(
  clientId: string,
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const { actor } = await requireAdvisorContext();
  return mutateClientData(clientId, async () =>
    addNote(Object.fromEntries(formData), actor, clientId, await getRequestMeta()),
  );
}

export async function addTaskAction(
  clientId: string,
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const { actor } = await requireAdvisorContext();
  return mutateClientData(clientId, async () =>
    addTask(Object.fromEntries(formData), actor, clientId, await getRequestMeta()),
  );
}

export async function addFamilyMemberAction(
  clientId: string,
  _prevState: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const { actor } = await requireAdvisorContext();
  return mutateClientData(clientId, async () =>
    addFamilyMember(
      Object.fromEntries(formData),
      actor,
      clientId,
      await getRequestMeta(),
    ),
  );
}

/** Bascule À faire ↔ Complétée (formulaire serveur sans JS). */
export async function toggleTaskAction(
  clientId: string,
  taskId: string,
  status: "TODO" | "DONE",
): Promise<void> {
  const { actor } = await requireAdvisorContext();
  await setTaskStatus(taskId, status, actor, await getRequestMeta());
  revalidatePath(`/clients/${clientId}`);
}

// ═══ Liens inter-clients certifiés (Sprint 7c — correctif 4) ═══

export interface ClientLinkActionState {
  error?: string;
  success?: string;
}

async function toLinkState(
  action: () => Promise<ClientLinkActionState>,
): Promise<ClientLinkActionState> {
  try {
    return await action();
  } catch (error) {
    return {
      error:
        error instanceof DomainError
          ? error.message
          : "L'opération n'a pas abouti — réessayez.",
    };
  }
}

/** Certifie un lien (couple, famille, affaires…) entre deux fiches. */
export async function createClientLinkAction(
  clientId: string,
  payload: {
    otherClientId: string;
    type: "CONJOINT" | "FAMILLE" | "AFFAIRES" | "PROCURATION" | "AUTRE";
    note?: string;
  },
): Promise<ClientLinkActionState> {
  return toLinkState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const created = await createClientLink(actor, clientId, payload, meta);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath(`/clients/${created.otherClientId}`);
    return {
      success: `Lien certifié créé vers ${created.otherClientName} — navigable dans les deux sens.`,
    };
  });
}

/** Révoque un lien certifié (preuve du retrait auditée). */
export async function deleteClientLinkAction(
  clientId: string,
  linkId: string,
): Promise<ClientLinkActionState> {
  return toLinkState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    await deleteClientLink(actor, linkId, meta);
    revalidatePath(`/clients/${clientId}`);
    return { success: "Lien retiré — le retrait est consigné au registre." };
  });
}
