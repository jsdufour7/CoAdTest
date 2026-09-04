"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { selfHostedAuthProvider } from "@coadvisor/auth";
import {
  declineAsPortalUser,
  signAsPortalUser,
} from "@coadvisor/documents";
import { DomainError } from "@coadvisor/types";
import { SESSION_COOKIE_NAME } from "@coadvisor/types";

import { getSessionUserFromCookies } from "../../lib/session";

/** Déconnexion particulier. */
export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await selfHostedAuthProvider.signOut(token);
  }
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export interface PortalSignState {
  error?: string;
  success?: string;
}

async function requestMeta() {
  const requestHeaders = await headers();
  return {
    ipAddress: requestHeaders.get("x-forwarded-for") ?? undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
}

/**
 * Signature d'une ligne d'enveloppe (Sprint 7b) : nom tapé + initiales
 * facultatives + tracé facultatif. La suite (sceau, certificat, prochain
 * tour) est enchaînée par le service.
 */
export async function signPortalSignerAction(
  signerId: string,
  payload: {
    signerName: string;
    initials?: string;
    signatureStyle?: string;
    drawnPngDataUrl?: string;
  },
): Promise<PortalSignState> {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login");
  const meta = await requestMeta();

  try {
    const { outcome } = await signAsPortalUser(
      user.userId,
      signerId,
      payload,
      meta,
    );
    // PAS de revalidatePath ici : la carte signerait sa disparition
    // immédiate et détruirait le message de confirmation (course RSC) —
    // la ligne signée quittera la liste à la prochaine navigation.
    return {
      success:
        outcome === "completed"
          ? "Document signé — toutes les parties ont signé : le document final (avec certificat) peut être téléchargé ci-dessous."
          : "Votre signature est enregistrée — l'enveloppe passe au signataire suivant.",
    };
  } catch (error) {
    return {
      error:
        error instanceof DomainError
          ? error.message
          : "La signature n'a pas abouti — réessayez ou contactez votre conseiller.",
    };
  }
}

/** Refus motivé d'une ligne d'enveloppe — le conseiller est avisé. */
export async function declinePortalSignerAction(
  signerId: string,
  payload: { reason: string },
): Promise<PortalSignState> {
  const user = await getSessionUserFromCookies();
  if (!user) redirect("/login");
  const meta = await requestMeta();

  try {
    await declineAsPortalUser(user.userId, signerId, payload, meta);
    return {
      success:
        "Refus enregistré — votre conseiller a été avisé du motif et l'enveloppe est close.",
    };
  } catch (error) {
    return {
      error:
        error instanceof DomainError
          ? error.message
          : "Le refus n'a pas abouti — réessayez ou contactez votre conseiller.",
    };
  }
}
