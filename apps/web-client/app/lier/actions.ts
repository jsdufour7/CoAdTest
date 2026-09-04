"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { claimPortalInvite } from "@coadvisor/health-engine";
import { DomainError } from "@coadvisor/types";

import { getSessionUserFromCookies } from "../../lib/session";

export interface ClaimState {
  error?: string;
}

/**
 * Liaison du compte au dossier client :
 * code d'invitation + consentement EXPLICITE exigé (Loi 25) —
 * le consentement est horodaté côté serveur (consent_at) et audité.
 */
export async function claimAction(
  _prevState: ClaimState,
  formData: FormData,
): Promise<ClaimState> {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  if (formData.get("consent") !== "on") {
    return {
      error:
        "Votre consentement explicite est requis pour lier votre compte au dossier de votre conseiller.",
    };
  }

  try {
    await claimPortalInvite(user.userId, formData.get("code"));
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/espace");
  redirect("/espace");
}
