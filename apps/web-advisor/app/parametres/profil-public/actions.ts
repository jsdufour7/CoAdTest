"use server";

import { revalidatePath } from "next/cache";

import {
  setProfileListing,
  upsertMyPublicProfile,
} from "@coadvisor/marketplace";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../lib/advisor-context";

export interface ProfileMutationState {
  error?: string;
  success?: boolean;
}

function toError(error: unknown): ProfileMutationState {
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

const text = (formData: FormData, name: string): string =>
  String(formData.get(name) ?? "").trim();

/** Sauvegarde « Mon profil public » (brouillon — la visibilité se gère à part). */
export async function saveProfileAction(
  _prevState: ProfileMutationState,
  formData: FormData,
): Promise<ProfileMutationState> {
  const { actor } = await requireAdvisorContext();
  const meta = await getRequestMeta();

  const yearsRaw = text(formData, "yearsExperience");
  const raw = {
    displayName: text(formData, "displayName"),
    headline: text(formData, "headline") || null,
    bio: text(formData, "bio"),
    regions: text(formData, "regions")
      .split(",")
      .map((region) => region.trim())
      .filter((region) => region !== ""),
    languages: formData.getAll("languages").map(String),
    specialties: formData.getAll("specialties").map(String),
    yearsExperience: yearsRaw === "" ? null : Number(yearsRaw),
    credentialsText: text(formData, "credentialsText") || null,
    photoData: text(formData, "photoData") || null,
    removePhoto: formData.get("photoRemoved") === "1",
  };

  try {
    await upsertMyPublicProfile(actor, raw, meta);
    revalidatePath("/parametres/profil-public");
    return { success: true };
  } catch (error) {
    return toError(error);
  }
}

/** Active / retire la visibilité publique (OPT-IN + consentement horodaté). */
export async function setListingAction(
  _prevState: ProfileMutationState,
  formData: FormData,
): Promise<ProfileMutationState> {
  const { actor } = await requireAdvisorContext();
  const meta = await getRequestMeta();
  const target = text(formData, "target") === "list";
  const consent = formData.get("consent") === "on";

  try {
    await setProfileListing(actor, target, consent, meta);
    revalidatePath("/parametres/profil-public");
    return { success: true };
  } catch (error) {
    return toError(error);
  }
}
