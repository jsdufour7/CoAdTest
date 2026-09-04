"use server";

import { headers } from "next/headers";

import { declineAsExternal, signAsExternal } from "@coadvisor/documents";
import { DomainError } from "@coadvisor/types";

export interface ExternalSignState {
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
 * Signature d'un signataire EXTERNE (sans compte — capability token).
 * La RLS externe (jeton haché en GUC) borne l'UPDATE en base.
 */
export async function signExternalAction(
  token: string,
  payload: {
    signerName: string;
    initials?: string;
    signatureStyle?: string;
    drawnPngDataUrl?: string;
  },
): Promise<ExternalSignState> {
  const meta = await requestMeta();
  try {
    const { outcome } = await signAsExternal(token, payload, meta);
    // PAS de revalidatePath : la page basculerait vers l'état « déjà
    // signé » et détruirait le message de confirmation (course RSC).
    return {
      success:
        outcome === "completed"
          ? "Merci — toutes les parties ont signé. Le document final (avec certificat) peut être téléchargé ci-dessous."
          : "Merci — votre signature est enregistrée. L'enveloppe passe au signataire suivant.",
    };
  } catch (error) {
    return {
      error:
        error instanceof DomainError
          ? error.message
          : "La signature n'a pas abouti — réessayez ou demandez un nouveau lien.",
    };
  }
}

/** Refus motivé d'un signataire externe — le professionnel est avisé. */
export async function declineExternalAction(
  token: string,
  payload: { reason: string },
): Promise<ExternalSignState> {
  const meta = await requestMeta();
  try {
    await declineAsExternal(token, payload, meta);
    return {
      success:
        "Votre refus est enregistré — le professionnel a été avisé du motif.",
    };
  } catch (error) {
    return {
      error:
        error instanceof DomainError
          ? error.message
          : "Le refus n'a pas abouti — réessayez ou demandez un nouveau lien.",
    };
  }
}
