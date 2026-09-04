"use server";

import { revalidatePath } from "next/cache";

import {
  cancelEnvelope,
  declineAsStaff,
  resendEnvelope,
  sendEnvelopeReminder,
  signAsStaff,
} from "@coadvisor/documents";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../lib/advisor-context";

export interface SignatureDeskActionState {
  error?: string;
  success?: string;
  externalLinks?: Array<{ email: string; fullName: string; url: string }>;
}

async function toState(
  action: () => Promise<SignatureDeskActionState>,
): Promise<SignatureDeskActionState> {
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

/**
 * Contre-signature d'un membre du cabinet — depuis la console
 * Signatures (page « ouvrir et signer » dédiée, Sprint 7c).
 */
export async function signStaffMyAction(
  signerId: string,
  payload: {
    signerName: string;
    initials?: string;
    signatureStyle?: string;
    drawnPngDataUrl?: string;
  },
): Promise<SignatureDeskActionState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const { outcome } = await signAsStaff(actor, signerId, payload, meta);
    return {
      success:
        outcome === "completed"
          ? "Contre-signature apposée — toutes les parties ont signé : la copie certifiée est téléchargeable ci-dessous."
          : "Contre-signature enregistrée — en attente des autres signataires.",
    };
  });
}

/** Refus motivé côté cabinet (la ronde se clôt — copie constatante). */
export async function declineStaffMyAction(
  signerId: string,
  payload: { reason: string },
): Promise<SignatureDeskActionState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    await declineAsStaff(actor, signerId, payload, meta);
    return {
      success: "Refus enregistré — l'enveloppe est close et le motif consigné.",
    };
  });
}

/** Annulation d'une enveloppe ouverte — suivi console. */
export async function cancelEnvelopeDeskAction(
  envelopeId: string,
): Promise<SignatureDeskActionState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    await cancelEnvelope(actor, envelopeId, meta);
    revalidatePath("/signatures");
    return {
      success: "Enveloppe annulée — les signataires ne peuvent plus y répondre.",
    };
  });
}

/** Relance manuelle (tour courant) — cadence anti-spam 4 h. */
export async function remindEnvelopeDeskAction(
  envelopeId: string,
): Promise<SignatureDeskActionState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const result = await sendEnvelopeReminder(actor, envelopeId, meta);
    revalidatePath("/signatures");
    return {
      success: `${result.reminded} relance(s) envoyée(s) par courriel (cadence anti-spam : 4 h).`,
    };
  });
}

/** « Nouvel envoi » d'une enveloppe close (Sprint 7c). */
export async function resendEnvelopeDeskAction(
  envelopeId: string,
  payload: { message?: string; expiresInDays?: number },
): Promise<SignatureDeskActionState> {
  return toState(async () => {
    const { actor } = await requireAdvisorContext();
    const meta = await getRequestMeta();
    const result = await resendEnvelope(actor, envelopeId, payload, meta);
    revalidatePath("/signatures");
    return {
      success: `Nouvel envoi reparti — avis par courriel relancés${
        result.externalLinks.length > 0
          ? ". Liens externes régénérés ci-dessous (les anciens sont morts)."
          : "."
      }`,
      externalLinks: result.externalLinks,
    };
  });
}
