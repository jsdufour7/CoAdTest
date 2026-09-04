"use server";

import { captureLead } from "@coadvisor/fnae";
import { DomainError } from "@coadvisor/types";

export interface LeadFormState {
  error?: string;
  success?: boolean;
}

/** Capture du lead consenti (Loi 25) depuis la page portrait. */
export async function captureLeadAction(
  assessmentId: string,
  readToken: string,
  cabinetSlug: string | undefined,
  _prevState: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  try {
    await captureLead(Object.fromEntries(formData), {
      assessmentId,
      readToken,
      cabinetSlug,
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  return { success: true };
}
