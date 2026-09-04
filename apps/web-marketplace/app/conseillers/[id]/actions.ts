"use server";

import { headers } from "next/headers";

import { submitContactRequest } from "@coadvisor/marketplace";
import { DomainError } from "@coadvisor/types";

export interface ContactMutationState {
  error?: string;
  success?: boolean;
  advisorName?: string;
}

const text = (formData: FormData, name: string): string =>
  String(formData.get(name) ?? "").trim();

/** Envoi de la demande de contact (flux public, anonyme, consenti). */
export async function submitContactAction(
  profileId: string,
  advisorName: string,
  _prevState: ContactMutationState,
  formData: FormData,
): Promise<ContactMutationState> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");

  const input = {
    firstName: text(formData, "firstName"),
    lastName: text(formData, "lastName"),
    email: text(formData, "email"),
    phone: text(formData, "phone") || undefined,
    message: text(formData, "message"),
    consent: formData.get("consent") === "on",
  };

  try {
    await submitContactRequest({
      profileId,
      input,
      assessmentId: text(formData, "assessmentId") || undefined,
      portraitToken: text(formData, "portraitToken") || undefined,
      ipAddress: forwardedFor?.split(",")[0]?.trim(),
      userAgent: requestHeaders.get("user-agent") ?? undefined,
    });
    return { success: true, advisorName };
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
}
