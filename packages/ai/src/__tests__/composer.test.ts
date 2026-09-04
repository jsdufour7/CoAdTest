import { describe, expect, it } from "vitest";

import { LocalComposerProvider } from "../copilot/providers/local-composer.provider";
import type { CopilotContextPack } from "../copilot/contract";

/** Paquet de données réaliste (structure CopilotContextPack). */
function fixturePack(): CopilotContextPack {
  return {
    tenant: { name: "Cabinet Démo" },
    client: {
      firstName: "Jean",
      lastName: "Bouchard",
      type: "FAMILY",
      status: "ACTIVE",
      age: 48,
      email: "jean.bouchard@exemple.ca",
      phone: "514-555-0182",
      createdAt: "2026-07-20T14:00:00.000Z",
    },
    household: [{ name: "Sophie Bouchard", roleLabel: "Conjoint·e" }],
    finance: {
      annualIncome: 153_000,
      monthlyExpenses: 4_170,
      monthlySavings: 1_000,
      monthlyDebtPayments: 1_870,
      totalAssets: 639_000,
      totalDebts: 314_400,
      netWorth: 324_600,
      liquidMonths: 3.6,
      savingsRate: 0.078,
      counts: {
        incomes: 2,
        expenses: 6,
        assets: 4,
        liabilities: 2,
        insurances: 2,
        goals: 2,
      },
      retirement: { age: 65, targetAnnualIncome: 68_000 },
      registeredAccountsUsage: "PARTIAL",
      hasWill: true,
      beneficiariesStatus: "YES",
    },
    health: {
      score: 68,
      engineVersion: "fhe-1.0",
      calculatedAt: "2026-07-30T12:00:00.000Z",
      categoryScores: { LIQUIDITY: 76, BUDGET: 100, RETIREMENT: 38, INSURANCE: 43 },
      strengths: ["Fonds d'urgence sain : 3.64 mois de dépenses couverts."],
      risks: ["La couverture vie (33 % du repère ~10× revenu) est insuffisante."],
      topActions: ["Évaluer une temporaire vie adaptée aux charges familiales."],
      deltaSincePrevious: 4,
    },
    goals: [
      {
        name: "Retraite confortable à 65 ans",
        targetAmount: 1_400_000,
        targetDate: "2043-04-12T00:00:00.000Z",
        priority: "HIGH",
      },
    ],
    openTasks: [
      {
        title: "Obtenir les relevés REER",
        dueDate: "2026-07-25T16:00:00.000Z",
        priority: "HIGH",
        overdue: true,
      },
    ],
    recentTimeline: [
      {
        date: "2026-07-30T12:00:00.000Z",
        typeLabel: "Financier",
        title: "Indice de santé financière calculé : 68/100",
      },
    ],
    recentNotes: [],
    generatedAt: "2026-07-31T04:00:00.000Z",
  };
}

const composer = new LocalComposerProvider();

describe("LocalComposerProvider — composition déterministe FR", () => {
  it("est toujours configuré et joignable", async () => {
    expect(composer.isConfigured()).toBe(true);
    const health = await composer.health();
    expect(health.reachable).toBe(true);
  });

  it("résumé : contient identité, chiffres exacts, FHI et points d'attention", async () => {
    const result = await composer.generate({
      kind: "SUMMARY",
      contextPack: fixturePack(),
    });
    expect(result.provider).toBe("local-composer");
    expect(result.content).toContain("Résumé du dossier — Jean Bouchard");
    expect(result.content).toContain("48 ans");
    // fr-CA : espace insécable/fine (U+202F, U+00A0) avant le symbole $
    const normalized = result.content.replace(/[\u00A0\u202F]/g, " ");
    expect(normalized).toContain("153 000 $");
    expect(result.content).toContain("68/100");
    expect(result.content).toContain("+4 pts");
    expect(result.content).toContain("Points d'attention");
    expect(result.content).toContain("REER"); // tâche échue citée
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("préparation : ordre du jour + questions + chiffres repères", async () => {
    const result = await composer.generate({
      kind: "MEETING_PREP",
      contextPack: fixturePack(),
    });
    expect(result.content).toContain("Préparation de rencontre — Jean Bouchard");
    expect(result.content).toContain("Ordre du jour suggéré");
    expect(result.content).toContain("Questions à poser");
    expect(result.content).toMatch(/1\. /); // numérotation
    expect(result.content).toContain("68/100");
  });

  it("suggestions : charge STRUCTURÉE actionnable + markdown", async () => {
    const result = await composer.generate({
      kind: "SUGGESTIONS",
      contextPack: fixturePack(),
    });
    expect(result.structured?.suggestions.length).toBeGreaterThanOrEqual(2);
    const titles = result.structured!.suggestions.map((s) => s.title).join(" ");
    expect(titles).toContain("Retraite"); // catégorie la plus faible (38)
    // Avec testament signé, aucune suggestion testamentaire
    expect(titles).not.toContain("testamentaire");
    // La couverture insuffisante est un risque FHI connu
    expect(
      result.structured!.suggestions.some((s) =>
        s.rationale.includes("couverture vie"),
      ),
    ).toBe(true);
  });

  it("bilan client : vulgarisation + avertissement réglementaire", async () => {
    const result = await composer.generate({
      kind: "CLIENT_REPORT",
      contextPack: fixturePack(),
    });
    expect(result.content).toContain("Bilan de santé financière");
    expect(result.content).toContain("Ce qui va bien");
    expect(result.content).toContain("ne constitue pas un avis financier réglementé");
    expect(result.content).toContain("Cabinet Démo");
  });

  it("dossier vide : signale les manques plutôt que d'inventer", async () => {
    const empty = fixturePack();
    empty.finance = null;
    empty.health = null;
    empty.recentTimeline = [];
    empty.openTasks = [];
    const result = await composer.generate({
      kind: "SUMMARY",
      contextPack: empty,
    });
    expect(result.content).toContain("non saisi");
    expect(result.content).toContain("Aucun indice calculé");
    const suggestions = await composer.generate({
      kind: "SUGGESTIONS",
      contextPack: empty,
    });
    expect(
      suggestions.structured!.suggestions.some(
        (s) => s.category === "DATA_QUALITY",
      ),
    ).toBe(true);
  });

  it("est DÉTERMINISTE : mêmes données → même texte", async () => {
    const pack = fixturePack();
    const a = await composer.generate({ kind: "SUMMARY", contextPack: pack });
    const b = await composer.generate({ kind: "SUMMARY", contextPack: pack });
    expect(a.content).toBe(b.content);
  });
});
