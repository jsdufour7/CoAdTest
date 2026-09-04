import { describe, expect, it } from "vitest";

import {
  filterProfiles,
  matchAdvisors,
  MATCH_ENGINE_VERSION,
  MATCH_WEIGHTS,
} from "../match/engine";
import type { FilterableProfile, MatchCandidate } from "../match/engine";
import { dimensionToSpecialty } from "../match/specialties";

/** Candidat de test utilitaire. */
function candidate(overrides: Partial<MatchCandidate> & { profileId: string }): MatchCandidate {
  return {
    specialties: [],
    regions: [],
    languages: [],
    yearsExperience: null,
    ...overrides,
  };
}

describe("mktmatch-1.0 — moteur de matching déterministe", () => {
  it("la somme des pondérations atteint exactement 100", () => {
    const total = MATCH_WEIGHTS.priorities.reduce((a, b) => a + b, 0)
      + MATCH_WEIGHTS.region
      + MATCH_WEIGHTS.language;
    expect(total).toBe(100);
  });

  it("correspondance parfaite = 100/100 avec raisons détaillées", () => {
    const results = matchAdvisors(
      [
        candidate({
          profileId: "p1",
          specialties: ["RETIREMENT", "SAVINGS", "GOALS"],
          regions: ["Montréal"],
          languages: ["fr"],
        }),
      ],
      {
        priorities: ["retirement", "savings", "goals"],
        region: "Montréal",
        language: "fr",
      },
    );
    const perfect = results[0];
    expect(results).toHaveLength(1);
    expect(perfect?.score).toBe(100);
    expect(perfect?.engineVersion).toBe(MATCH_ENGINE_VERSION);
    expect(perfect?.reasons).toHaveLength(5);
    expect(perfect?.reasons[0]).toContain("Retraite");
    expect(perfect?.reasons[0]).toContain("priorité n° 1");
    expect(perfect?.reasons[0]).toContain("+40");
  });

  it("le rang de la priorité module le poids (40/25/15)", () => {
    const [only] = matchAdvisors(
      [
        candidate({ profileId: "a", specialties: ["DEBT"] }),
        candidate({ profileId: "b", specialties: ["EMERGENCY_FUND"] }),
        candidate({ profileId: "c", specialties: ["SAVINGS"] }),
      ],
      { priorities: ["emergencyFund", "debt", "savings"] },
    );
    expect(only?.profileId).toBe("b");
    expect(only?.score).toBe(40);
    const third = matchAdvisors(
      [candidate({ profileId: "c", specialties: ["SAVINGS"] })],
      { priorities: ["emergencyFund", "debt", "savings"] },
    )[0];
    expect(third?.score).toBe(15);
  });

  it("déterminisme : entrée identique ⇒ sortie identique (ordre et scores)", () => {
    const candidates = [
      candidate({ profileId: "x1", specialties: ["RETIREMENT"], yearsExperience: 5 }),
      candidate({ profileId: "x2", specialties: ["RETIREMENT"], yearsExperience: 15 }),
      candidate({ profileId: "x3", specialties: ["PROTECTION"] }),
    ];
    const criteria = { priorities: ["retirement", "protection", "goals"] as const };
    const run = () => matchAdvisors(candidates, { priorities: [...criteria.priorities] }, 10);
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    // égalité de score entre x1 et x2 → l'expérience départage
    expect(a[0]?.profileId).toBe("x2");
    expect(a[1]?.profileId).toBe("x1");
  });

  it("les candidats sans adéquation sont exclus (score 0)", () => {
    const results = matchAdvisors(
      [candidate({ profileId: "z", specialties: ["PROTECTION"] })],
      { priorities: ["retirement"] },
    );
    expect(results).toEqual([]);
  });

  it("la limite est respectée", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      candidate({ profileId: `m${i}`, specialties: ["RETIREMENT"] }),
    );
    expect(matchAdvisors(many, { priorities: ["retirement"] })).toHaveLength(3);
  });

  it("chaque dimension FNAE a sa spécialité", () => {
    expect(dimensionToSpecialty("emergencyFund")).toBe("EMERGENCY_FUND");
    expect(dimensionToSpecialty("debt")).toBe("DEBT");
    expect(dimensionToSpecialty("savings")).toBe("SAVINGS");
    expect(dimensionToSpecialty("retirement")).toBe("RETIREMENT");
    expect(dimensionToSpecialty("protection")).toBe("PROTECTION");
    expect(dimensionToSpecialty("goals")).toBe("GOALS");
  });
});

describe("filterProfiles — recherche d'annuaire", () => {
  const profiles: FilterableProfile[] = [
    {
      profileId: "a1",
      displayName: "Marie Tremblay",
      firmName: "Cabinet Démo",
      headline: "Planificatrice retraite",
      bio: "Optimisation REER et CELI pour familles.",
      specialties: ["RETIREMENT", "SAVINGS"],
      regions: ["Montréal", "Laval"],
      languages: ["fr", "en"],
      yearsExperience: 12,
    },
    {
      profileId: "a2",
      displayName: "Karim Haddad",
      firmName: "Cabinet Démo",
      headline: "Protection et désendettement",
      bio: "Assurance vie et fonds d'urgence d'abord.",
      specialties: ["PROTECTION", "DEBT"],
      regions: ["Longueuil"],
      languages: ["fr"],
      yearsExperience: 8,
    },
  ];

  it("recherche textuelle insensible à la casse ET aux accents", () => {
    expect(filterProfiles(profiles, { query: "MARIE" }).map((p) => p.profileId)).toEqual(["a1"]);
    expect(filterProfiles(profiles, { query: "montreal" }).map((p) => p.profileId)).toEqual(["a1"]);
    expect(filterProfiles(profiles, { query: "réer" }).map((p) => p.profileId)).toEqual(["a1"]);
  });

  it("filtre par spécialité, région partielle et langue", () => {
    expect(
      filterProfiles(profiles, { specialty: "DEBT" }).map((p) => p.profileId),
    ).toEqual(["a2"]);
    expect(
      filterProfiles(profiles, { region: "longueuil" }).map((p) => p.profileId),
    ).toEqual(["a2"]);
    expect(
      filterProfiles(profiles, { language: "en" }).map((p) => p.profileId),
    ).toEqual(["a1"]);
  });

  it("filtres combinés", () => {
    expect(
      filterProfiles(profiles, { specialty: "RETIREMENT", language: "en" }).map(
        (p) => p.profileId,
      ),
    ).toEqual(["a1"]);
    expect(
      filterProfiles(profiles, { specialty: "RETIREMENT", language: "en", query: "karim" }),
    ).toEqual([]);
  });
});
