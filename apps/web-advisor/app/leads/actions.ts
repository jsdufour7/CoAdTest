"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@coadvisor/crm";
import {
  getLead,
  markLeadConverted,
  setLeadStatus,
} from "@coadvisor/fnae";
import { DomainError, ValidationError } from "@coadvisor/types";

import { getRequestMeta, requireAdvisorContext } from "../../lib/advisor-context";

export interface LeadActionState {
  error?: string;
}

/** Change le statut d'un lead (pris en charge / écarté). */
export async function setLeadStatusAction(
  leadId: string,
  status: "CONTACTED" | "DISMISSED",
): Promise<void> {
  const { actor } = await requireAdvisorContext();
  await setLeadStatus(actor, leadId, status);
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

/**
 * Conversion lead → client CRM (boucle d'acquisition).
 * Composition au niveau app : le module CRM crée le dossier (audit +
 * timeline), le module FNAE consigne la conversion (audit).
 */
export async function convertLeadAction(
  leadId: string,
  prevState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  // Signature imposée par useActionState (prevState + formData).
  void prevState;
  void formData;
  const { actor } = await requireAdvisorContext();

  const lead = await getLead(actor, leadId);
  if (!lead) {
    return { error: "Ce lead est introuvable." };
  }
  if (lead.status === "CONVERTED") {
    return { error: "Ce lead a déjà été converti en dossier client." };
  }

  let clientId: string;
  try {
    const client = await createClient(
      {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone ?? "",
        type: "INDIVIDUAL",
      },
      actor,
      await getRequestMeta(),
    );

    const converted = await markLeadConverted(actor, leadId, client.id);
    if (!converted) {
      throw new ValidationError("Conversion impossible : lead introuvable.");
    }
    clientId = client.id;
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect(`/clients/${clientId}`);
}
