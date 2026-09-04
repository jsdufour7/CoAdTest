import { describe, expect, it } from "vitest";

import { slugify, uniqueSlug } from "../lib/slug";

describe("slugify", () => {
  it("normalise les accents et la casse", () => {
    expect(slugify("Cabinet Élégance Financière")).toBe(
      "cabinet-elegance-financiere",
    );
  });

  it("remplace les séquences non alphanumériques", () => {
    expect(slugify("  Groupe   ABC — Inc.  ")).toBe("groupe-abc-inc");
  });

  it("tronque à 48 caractères et fournit un repli", () => {
    expect(slugify("a".repeat(100))).toHaveLength(48);
    expect(slugify("!!!")).toBe("cabinet");
  });
});

describe("uniqueSlug", () => {
  it("produit des slugs distincts pour un même nom", () => {
    expect(uniqueSlug("Cabinet Démo")).not.toBe(uniqueSlug("Cabinet Démo"));
  });

  it("conserve la base lisible", () => {
    expect(uniqueSlug("Cabinet Démo")).toMatch(/^cabinet-demo-[0-9a-f]{6}$/);
  });
});
