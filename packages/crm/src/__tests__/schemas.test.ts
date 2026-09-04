import { describe, expect, it } from "vitest";

import {
  addTaskSchema,
  clientSearchSchema,
  createClientSchema,
} from "../schemas";

describe("createClientSchema", () => {
  const valid = {
    firstName: "Jean",
    lastName: "Bouchard",
    type: "INDIVIDUAL",
  };

  it("accepte un client minimal valide", () => {
    expect(createClientSchema.safeParse(valid).success).toBe(true);
  });

  it("rejette un nom vide", () => {
    expect(createClientSchema.safeParse({ ...valid, lastName: "" }).success).toBe(
      false,
    );
  });

  it("convertit les champs vides de formulaire en undefined", () => {
    const parsed = createClientSchema.parse({
      ...valid,
      email: "",
      phone: "",
      birthDate: "",
    });
    expect(parsed.email).toBeUndefined();
    expect(parsed.phone).toBeUndefined();
    expect(parsed.birthDate).toBeUndefined();
  });

  it("rejette un courriel malformé", () => {
    expect(
      createClientSchema.safeParse({ ...valid, email: "pas-un-courriel" })
        .success,
    ).toBe(false);
  });

  it("coerce une date de naissance ISO", () => {
    const parsed = createClientSchema.parse({
      ...valid,
      birthDate: "1980-05-20",
    });
    expect(parsed.birthDate).toBeInstanceOf(Date);
  });
});

describe("clientSearchSchema", () => {
  it("accepte une recherche vide", () => {
    expect(clientSearchSchema.safeParse({ q: "", status: "" }).success).toBe(
      true,
    );
  });

  it("rejette un statut inconnu", () => {
    expect(
      clientSearchSchema.safeParse({ q: "x", status: "SUPER" }).success,
    ).toBe(false);
  });
});

describe("addTaskSchema", () => {
  it("exige un titre", () => {
    expect(
      addTaskSchema.safeParse({ title: "", priority: "MEDIUM" }).success,
    ).toBe(false);
  });

  it("rejette une priorité hors enum", () => {
    expect(
      addTaskSchema.safeParse({ title: "Suivi", priority: "CRITICAL" }).success,
    ).toBe(false);
  });
});
