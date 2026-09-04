import { describe, expect, it } from "vitest";

import { contactRequestSchema, profileInputSchema } from "../profile/schemas";

const VALID_PROFILE = {
  displayName: "Marie Tremblay",
  headline: "Planificatrice financière",
  bio: "J'accompagne les familles du Grand Montréal vers une retraite sereine et structurée.",
  regions: ["Montréal", "Laval"],
  languages: ["fr", "en"],
  specialties: ["RETIREMENT", "SAVINGS"],
  yearsExperience: 12,
  credentialsText: "Pl. Fin. (IQPF)",
  photoData: null,
};

describe("schémas marketplace — validation française (Règle 2)", () => {
  it("profil valide complet accepté", () => {
    const parsed = profileInputSchema.safeParse(VALID_PROFILE);
    expect(parsed.success).toBe(true);
  });

  it("bio trop courte refusée (anti-profil vide)", () => {
    const parsed = profileInputSchema.safeParse({ ...VALID_PROFILE, bio: "Trop court." });
    expect(parsed.success).toBe(false);
  });

  it("photo : seuls PNG/JPEG en data URL, plafond de taille", () => {
    const png = `data:image/png;base64,${"A".repeat(100)}`;
    expect(profileInputSchema.safeParse({ ...VALID_PROFILE, photoData: png }).success).toBe(true);
    const gif = `data:image/gif;base64,${"A".repeat(100)}`;
    expect(profileInputSchema.safeParse({ ...VALID_PROFILE, photoData: gif }).success).toBe(false);
    const tropLourde = `data:image/png;base64,${"A".repeat(700_000)}`;
    expect(
      profileInputSchema.safeParse({ ...VALID_PROFILE, photoData: tropLourde }).success,
    ).toBe(false);
  });

  it("spécialités hors taxonomie refusées", () => {
    expect(
      profileInputSchema.safeParse({ ...VALID_PROFILE, specialties: ["CRYPTO"] }).success,
    ).toBe(false);
    expect(profileInputSchema.safeParse({ ...VALID_PROFILE, specialties: [] }).success).toBe(false);
  });

  it("contact : consentement Loi 25 littéralement obligatoire", () => {
    const base = {
      firstName: "Test",
      lastName: "Prospect",
      email: "prospect@exemple.ca",
      message: "Je veux préparer ma retraite dans dix ans.",
      consent: true,
    };
    expect(contactRequestSchema.safeParse(base).success).toBe(true);
    expect(contactRequestSchema.safeParse({ ...base, consent: false }).success).toBe(false);
  });

  it("contact : message court refusé (qualité de prise de contact)", () => {
    expect(
      contactRequestSchema.safeParse({
        firstName: "Test",
        lastName: "Prospect",
        email: "prospect@exemple.ca",
        message: "allo",
        consent: true,
      }).success,
    ).toBe(false);
  });
});
