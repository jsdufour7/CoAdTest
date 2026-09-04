"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  cancelRenewal,
  completeSimulatedCheckout,
  resumeRenewal,
  setSeatsExtra,
  startPlanChange,
} from "@coadvisor/billing";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  getTenantSummary,
  requireAdvisorContext,
} from "../../lib/advisor-context";

/** Origine publique de l'app (URLs de retour Stripe / simulateur). */
async function baseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host ?? "localhost:3000"}`;
}

/** CTA des cartes de paliers (page Abonnement). */
export async function choosePlanAction(formData: FormData): Promise<void> {
  const { actor, user } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const planCode = String(formData.get("plan") ?? "");
  const meta = await getRequestMeta();
  try {
    const result = await startPlanChange(
      actor,
      planCode,
      await baseUrl(),
      user.email,
      tenant?.name ?? "Cabinet",
      meta,
    );
    redirect(result.url);
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/abonnement?erreur=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
}

export interface SimCheckoutState {
  error?: string;
}

/** Soumission de la carte de test (page simulateur). */
export async function completeSimCheckoutAction(
  _prevState: SimCheckoutState,
  formData: FormData,
): Promise<SimCheckoutState> {
  const { actor } = await requireAdvisorContext();
  const meta = await getRequestMeta();
  const planCode = String(formData.get("plan") ?? "");
  try {
    await completeSimulatedCheckout(
      actor,
      { planCode },
      {
        name: String(formData.get("cardName") ?? ""),
        number: String(formData.get("cardNumber") ?? ""),
        expiry: String(formData.get("cardExpiry") ?? ""),
        cvc: String(formData.get("cardCvc") ?? ""),
      },
      meta,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  redirect("/abonnement?checkout=succes");
}

export async function cancelRenewalAction(): Promise<void> {
  const { actor } = await requireAdvisorContext();
  try {
    await cancelRenewal(actor, await getRequestMeta());
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/abonnement?erreur=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  redirect("/abonnement?renouvellement=annule");
}

export async function resumeRenewalAction(): Promise<void> {
  const { actor } = await requireAdvisorContext();
  try {
    await resumeRenewal(actor, await getRequestMeta());
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/abonnement?erreur=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  redirect("/abonnement?renouvellement=repris");
}

export async function setSeatsExtraAction(formData: FormData): Promise<void> {
  const { actor } = await requireAdvisorContext();
  const wanted = Number(String(formData.get("seatsExtra") ?? "0"));
  try {
    await setSeatsExtra(actor, wanted, await getRequestMeta());
  } catch (error) {
    if (error instanceof DomainError) {
      redirect(`/abonnement?erreur=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  redirect("/abonnement?sieges=maj");
}
