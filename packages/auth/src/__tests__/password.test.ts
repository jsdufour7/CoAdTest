import { describe, expect, it } from "vitest";

import { hashPassword, validatePassword, verifyPassword } from "../password";

describe("validatePassword (politique Sprint 1)", () => {
  it("rejette un mot de passe trop court", () => {
    expect(validatePassword("Ab1").length).toBeGreaterThan(0);
  });

  it("rejette l'absence de majuscule / chiffre", () => {
    expect(validatePassword("motdepassesimple1")).toContain(
      "Le mot de passe doit contenir une lettre majuscule.",
    );
    expect(validatePassword("MotDePasseSansChiffre")).toContain(
      "Le mot de passe doit contenir un chiffre.",
    );
  });

  it("accepte un mot de passe conforme", () => {
    expect(validatePassword("Str0ng!Passw0rd2026")).toEqual([]);
  });
});

describe("hashPassword / verifyPassword (Argon2id)", () => {
  // Coûts réduits pour la rapidité des tests.
  const fastOptions = { memoryCost: 2 ** 12, timeCost: 2 };

  it("produit un haché Argon2id vérifiable", async () => {
    const hash = await hashPassword("Str0ng!Passw0rd2026", fastOptions);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(verifyPassword(hash, "Str0ng!Passw0rd2026")).resolves.toBe(
      true,
    );
  });

  it("rejette un mauvais mot de passe", async () => {
    const hash = await hashPassword("Str0ng!Passw0rd2026", fastOptions);
    await expect(verifyPassword(hash, "mauvais")).resolves.toBe(false);
  });

  it("retourne false sans lever d'erreur sur un haché invalide", async () => {
    await expect(verifyPassword("pas-un-hash", "x")).resolves.toBe(false);
  });
});
