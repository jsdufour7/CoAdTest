import type {
  CopilotContextPack,
  CopilotGenerateRequest,
  CopilotGenerateResult,
  CopilotProvider,
  CopilotSuggestion,
} from "../contract";

/**
 * LocalComposerProvider — composition DÉTERMINISTE de textes d'assistance
 * en français à partir des données structurées du dossier. Sert de :
 *  1. secours automatique quand la passerelle est indisponible;
 *  2. provider de démonstration (aucune donnée ne quitte le serveur).
 * Règles AI Strategy respectées : assistance et pédagogie, jamais de
 * conseil réglementé automatisé — le conseiller valide avant usage.
 */

const money = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const percent = (v: number) => `${Math.round(v * 100)} %`;

const CATEGORY_LABELS: Record<string, string> = {
  LIQUIDITY: "Liquidités",
  BUDGET: "Budget",
  DEBT: "Dettes",
  SAVINGS: "Épargne",
  INVESTMENTS: "Investissements",
  RETIREMENT: "Retraite",
  TAX: "Fiscalité",
  INSURANCE: "Assurance",
  ESTATE: "Succession",
  GOALS: "Objectifs",
};

const TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "particulier",
  FAMILY: "famille",
  CORPORATE: "entreprise",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-CA", { dateStyle: "long" });

const fullName = (pack: CopilotContextPack) =>
  `${pack.client.firstName} ${pack.client.lastName}`;

function topCategories(
  scores: Record<string, number>,
  dir: "asc" | "desc",
  n: number,
): Array<[string, number]> {
  return Object.entries(scores)
    .map(([k, v]) => [k, Math.round(v)] as [string, number])
    .sort((a, b) => (dir === "desc" ? b[1] - a[1] : a[1] - b[1]))
    .slice(0, n);
}

function healthWord(score: number): string {
  if (score >= 75) return "excellente";
  if (score >= 60) return "bonne";
  if (score >= 40) return "fragile";
  return "à risque";
}

// ── Résumé de dossier ──────────────────────────────────────────────
function composeSummary(pack: CopilotContextPack): string {
  const c = pack.client;
  const lines: string[] = [`## Résumé du dossier — ${fullName(pack)}`, ""];

  lines.push("### En bref");
  const tags: string[] = [`dossier ${TYPE_LABELS[c.type] ?? c.type}`];
  if (c.age !== null) tags.push(`${c.age} ans`);
  if (pack.household.length > 0) {
    tags.push(
      `entourage : ${pack.household.map((h) => `${h.name} (${h.roleLabel})`).join(", ")}`,
    );
  }
  lines.push(`- ${fullName(pack)} — ${tags.join(" · ")}.`);
  lines.push(`- Client du cabinet ${pack.tenant.name} depuis le ${fmtDate(c.createdAt)}.`);
  if (c.email || c.phone) {
    lines.push(`- Contact : ${[c.email, c.phone].filter(Boolean).join(" · ")}.`);
  }
  lines.push("");

  if (pack.finance) {
    const f = pack.finance;
    lines.push("### Situation financière");
    lines.push(
      `- Revenus annuels de **${money.format(f.annualIncome)}**, dépenses mensuelles de **${money.format(f.monthlyExpenses)}**` +
        (f.monthlySavings > 0
          ? `, dont **${money.format(f.monthlySavings)}** épargnés chaque mois.`
          : " — aucune épargne mensuelle n'est saisie."),
    );
    lines.push(
      `- Actif total ${money.format(f.totalAssets)}, passif ${money.format(f.totalDebts)} → **avoir net de ${money.format(f.netWorth)}**.`,
    );
    if (f.counts.liabilities > 0) {
      lines.push(`- Paiements de dettes : ${money.format(f.monthlyDebtPayments)}/mois.`);
    }
    if (f.liquidMonths !== null) {
      lines.push(
        `- Fonds d'urgence : ~**${f.liquidMonths.toFixed(1)} mois** de dépenses en liquidités.`,
      );
    }
    if (f.savingsRate !== null) {
      lines.push(`- Taux d'épargne : **${percent(f.savingsRate)}** du revenu brut.`);
    }
    if (f.retirement) {
      lines.push(
        `- Retraite visée à **${f.retirement.age} ans** avec ${money.format(f.retirement.targetAnnualIncome)}/an.`,
      );
    }
    lines.push(
      `- Testament : ${f.hasWill ? "signé" : "**aucun**"} · bénéficiaires : ${
        { YES: "à jour", OUTDATED: "à réviser", NO: "aucun", UNKNOWN: "inconnu" }[
          f.beneficiariesStatus
        ]
      } · comptes enregistrés : ${
        { FULL: "maximisés", PARTIAL: "partiellement utilisés", NONE: "inutilisés", UNKNOWN: "inconnu" }[
          f.registeredAccountsUsage
        ]
      }.`,
    );
  } else {
    lines.push("### Situation financière");
    lines.push(
      "- Profil financier granulaire **non saisi** — voir l'onglet « Données financières ». À compléter en priorité pour activer le FHI.",
    );
  }
  lines.push("");

  lines.push("### Santé financière (FHI)");
  if (pack.health) {
    const h = pack.health;
    lines.push(
      `- Indice **${h.score}/100 — santé ${healthWord(h.score)}** (${h.engineVersion}, calculé le ${fmtDate(h.calculatedAt)}` +
        (h.deltaSincePrevious !== null
          ? `, ${h.deltaSincePrevious >= 0 ? "+" : ""}${h.deltaSincePrevious} pts depuis le calcul précédent).`
          : ")."),
    );
    const strengths = topCategories(h.categoryScores, "desc", 2);
    const weaknesses = topCategories(h.categoryScores, "asc", 2);
    lines.push(
      `- Points forts : ${strengths.map(([k, v]) => `${CATEGORY_LABELS[k] ?? k} (${v})`).join(", ")}.`,
    );
    lines.push(
      `- À travailler : ${weaknesses.map(([k, v]) => `${CATEGORY_LABELS[k] ?? k} (${v})`).join(", ")}.`,
    );
  } else {
    lines.push(
      "- Aucun indice calculé — aller à « Santé financière » pour produire le premier FHI.",
    );
  }
  if (pack.goals.length > 0) {
    lines.push(
      `- Objectifs actifs : ${pack.goals.map((g) => `${g.name} (${money.format(g.targetAmount)})`).join(", ")}.`,
    );
  }
  lines.push("");

  lines.push("### Activité récente");
  if (pack.recentTimeline.length === 0) {
    lines.push("- Aucun événement enregistré pour le moment.");
  } else {
    for (const e of pack.recentTimeline.slice(0, 3)) {
      lines.push(`- ${fmtDate(e.date)} — ${e.title} (${e.typeLabel}).`);
    }
  }
  if (pack.openTasks.length > 0) {
    const overdue = pack.openTasks.filter((t) => t.overdue).length;
    lines.push(
      `- ${pack.openTasks.length} tâche(s) ouverte(s)` +
        (overdue > 0 ? `, dont **${overdue} en retard**` : "") +
        ` : ${pack.openTasks.slice(0, 3).map((t) => t.title).join(" · ")}.`,
    );
  }
  lines.push("");

  lines.push("### Points d'attention");
  const attention = buildAttentionPoints(pack);
  if (attention.length === 0) {
    lines.push("- Rien de bloquant — poursuivre le suivi régulier.");
  } else {
    for (const point of attention) {
      lines.push(`- ${point}`);
    }
  }
  return lines.join("\n");
}

function buildAttentionPoints(pack: CopilotContextPack): string[] {
  const points: string[] = [];
  if (!pack.finance) {
    points.push("Profil financier à compléter (aucun revenu ni actif saisi).");
  }
  if (!pack.health) {
    points.push("FHI jamais calculé — premier calcul à planifier.");
  }
  if (pack.finance && !pack.finance.hasWill) {
    points.push("Aucun testament au dossier — sujet succession à aborder.");
  }
  if (pack.finance?.beneficiariesStatus === "OUTDATED") {
    points.push("Désignations de bénéficiaires à réviser.");
  }
  if (
    pack.finance &&
    pack.finance.counts.insurances === 0 &&
    pack.household.length > 0
  ) {
    points.push("Entourage à charge sans assurance saisie — évaluer les besoins de protection.");
  }
  const overdue = pack.openTasks.filter((t) => t.overdue);
  if (overdue.length > 0) {
    points.push(`${overdue.length} tâche(s) échue(s) : ${overdue[0]!.title}.`);
  }
  if (pack.health) {
    const weakest = topCategories(pack.health.categoryScores, "asc", 1)[0];
    if (weakest && weakest[1] < 40) {
      points.push(
        `Catégorie FHI la plus faible : ${CATEGORY_LABELS[weakest[0]] ?? weakest[0]} (${weakest[1]}/100).`,
      );
    }
  }
  return points;
}

// ── Préparation de rencontre ───────────────────────────────────────
function composeMeetingPrep(pack: CopilotContextPack): string {
  const lines: string[] = [
    `## Préparation de rencontre — ${fullName(pack)}`,
    "",
    `_Préparée le ${fmtDate(pack.generatedAt)} — à valider par le conseiller._`,
    "",
    "### Depuis la dernière fois",
  ];
  if (pack.recentTimeline.length === 0) {
    lines.push("- Premier contact structuré — aucune activité antérieure.");
  } else {
    for (const e of pack.recentTimeline.slice(0, 4)) {
      lines.push(`- ${fmtDate(e.date)} — ${e.title}`);
    }
  }
  if (pack.health?.deltaSincePrevious !== null && pack.health?.deltaSincePrevious !== undefined) {
    lines.push(
      `- FHI : **${pack.health.score}/100** (${pack.health.deltaSincePrevious >= 0 ? "+" : ""}${pack.health.deltaSincePrevious} pts depuis le dernier calcul).`,
    );
  }
  lines.push("");

  lines.push("### Ordre du jour suggéré");
  const agenda: string[] = [];
  if (pack.finance === null) {
    agenda.push("Compléter le profil financier (revenus, dépenses, actifs, dettes).");
  }
  if (pack.health === null) {
    agenda.push("Produire le premier indice de santé financière ensemble.");
  }
  const overdueTasks = pack.openTasks.filter((t) => t.overdue);
  if (overdueTasks.length > 0) {
    agenda.push(`Régulariser ${overdueTasks.length} tâche(s) échue(s) — dont « ${overdueTasks[0]!.title} ».`);
  }
  if (pack.health && pack.health.risks.length > 0) {
    agenda.push(`Traiter le risque identifié : ${pack.health.risks[0]!.toLowerCase()}`);
  }
  if (pack.finance && !pack.finance.hasWill) {
    agenda.push("Aborder la planification testamentaire et les bénéficiaires.");
  }
  if (pack.finance && pack.finance.registeredAccountsUsage !== "FULL") {
    agenda.push("Vérifier la stratégie de cotisation REER/CELI de l'année.");
  }
  if (pack.goals.length > 0) {
    agenda.push(`Faire le point sur l'objectif « ${pack.goals[0]!.name} » (${money.format(pack.goals[0]!.targetAmount)}).`);
  }
  agenda.push("Confirmer les prochaines étapes et des responsabilités de chacun.");
  agenda.slice(0, 6).forEach((item, i) => lines.push(`${i + 1}. ${item}`));
  lines.push("");

  lines.push("### Chiffres repères à avoir sous la main");
  if (pack.finance) {
    const f = pack.finance;
    lines.push(`- Revenus ${money.format(f.annualIncome)}/an · dépenses ${money.format(f.monthlyExpenses)}/mois · avoir net ${money.format(f.netWorth)}.`);
  }
  if (pack.health) {
    lines.push(`- FHI ${pack.health.score}/100 (${pack.health.engineVersion}).`);
  }
  lines.push("");

  lines.push("### Questions à poser");
  const questions: string[] = [];
  if (pack.finance === null) {
    questions.push("Quels sont vos revenus et dépenses actuels, et qui contribue au budget?");
  }
  if (pack.finance?.counts.insurances === 0) {
    questions.push("Que se passerait-il financièrement demain si votre revenu s'arrêtait?");
  }
  if (pack.finance && !pack.finance.hasWill) {
    questions.push("Avez-vous un testament, et à qui souhaitez-vous transmettre vos biens?");
  }
  if (pack.health && pack.health.risks.length > 0) {
    questions.push(`Le rapport signale : « ${pack.health.risks[0]!} » — comment voyez-vous cette situation?`);
  }
  questions.push("Y a-t-il eu un changement de vie récent (emploi, famille, projet) à intégrer au plan?");
  questions.slice(0, 4).forEach((q) => lines.push(`- ${q}`));
  return lines.join("\n");
}

// ── Suggestions actionnables ───────────────────────────────────────
function buildSuggestions(pack: CopilotContextPack): CopilotSuggestion[] {
  const suggestions: CopilotSuggestion[] = [];

  if (pack.finance === null) {
    suggestions.push({
      title: "Compléter le profil financier granulaire",
      rationale:
        "Aucun revenu ni actif n'est saisi : le FHI et les analyses reposent sur ces données. 15 minutes de saisie débloquent tout le suivi.",
      category: "DATA_QUALITY",
    });
  }
  if (pack.health === null) {
    suggestions.push({
      title: "Calculer le premier indice FHI",
      rationale:
        "Le score de santé financière n'a jamais été produit — il structure la conversation et fait ressortir les priorités.",
      category: "TASK",
    });
  }
  if (pack.health !== null) {
    const weakest = topCategories(pack.health.categoryScores, "asc", 1)[0];
    if (weakest && weakest[1] < 50) {
      suggestions.push({
        title: `Plan d'action « ${CATEGORY_LABELS[weakest[0]] ?? weakest[0]} » (${weakest[1]}/100)`,
        rationale:
          "Catégorie la plus faible du dernier FHI — y consacrer la prochaine rencontre maximise le gain de score.",
        category: "REVIEW",
      });
    }
    if (pack.health.risks.length > 0) {
      suggestions.push({
        title: "Adresser le risque signalé par le FHI",
        rationale: pack.health.risks[0]!,
        category: "REVIEW",
      });
    }
  }
  if (pack.finance !== null && !pack.finance.hasWill) {
    suggestions.push({
      title: "Démarrer la démarche testamentaire",
      rationale:
        "Aucun testament au dossier — référer au notaire et inscrire le suivi au plan.",
      category: "TASK",
    });
  }
  if (pack.finance?.beneficiariesStatus === "OUTDATED" || pack.finance?.beneficiariesStatus === "NO") {
    suggestions.push({
      title: "Réviser les désignations de bénéficiaires",
      rationale:
        "Bénéficiaires absents ou désuets sur les comptes/polices — vérification annuelle recommandée.",
      category: "REVIEW",
    });
  }
  if (pack.finance && pack.finance.registeredAccountsUsage !== "FULL") {
    suggestions.push({
      title: "Optimiser les cotisations REER/CELI",
      rationale:
        "Les droits de cotisation ne sont pas pleinement utilisés — quantifier l'espace disponible au prochain relevé.",
      category: "OPPORTUNITY",
    });
  }
  if (pack.finance && pack.finance.counts.insurances === 0 && pack.household.length > 0) {
    suggestions.push({
      title: "Évaluer les besoins en assurance",
      rationale:
        "Des personnes dépendent des revenus du dossier et aucune couverture n'est saisie — analyse de besoins à planifier.",
      category: "REVIEW",
    });
  }
  const overdue = pack.openTasks.filter((t) => t.overdue);
  if (overdue.length > 0) {
    suggestions.push({
      title: `Régulariser ${overdue.length} tâche(s) échue(s)`,
      rationale: `Dont « ${overdue[0]!.title} » — un dossier à jour garde le plan crédible.`,
      category: "TASK",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      title: "Planifier la revue périodique",
      rationale:
        "Aucun point critique détecté — maintenir le rythme de suivi et recalculer le FHI après tout changement de vie.",
      category: "TASK",
    });
  }
  return suggestions.slice(0, 6);
}

function composeSuggestions(
  pack: CopilotContextPack,
): { content: string; structured: { suggestions: CopilotSuggestion[] } } {
  const suggestions = buildSuggestions(pack);
  const lines: string[] = [
    `## Suggestions — ${fullName(pack)}`,
    "",
    `_Actions proposées à partir des données du dossier — le conseiller décide, l'assistante propose._`,
    "",
  ];
  suggestions.forEach((s, i) => {
    lines.push(`${i + 1}. **${s.title}** — ${s.rationale}`);
  });
  return { content: lines.join("\n"), structured: { suggestions } };
}

// ── Bilan client (rapport FR-AI-001, version imprimable) ───────────
function composeClientReport(pack: CopilotContextPack): string {
  const lines: string[] = [
    `# Bilan de santé financière`,
    `**${fullName(pack)}** — préparé avec ${pack.tenant.name}, le ${fmtDate(pack.generatedAt)}`,
    "",
    "> Document d'assistance préparé pour la discussion avec votre conseiller. Il ne constitue pas un avis financier réglementé.",
    "",
  ];

  if (pack.health) {
    const h = pack.health;
    lines.push("## Votre indice en un coup d'œil");
    lines.push(
      `Votre santé financière est **${healthWord(h.score)}** : **${h.score}/100** au ${fmtDate(h.calculatedAt)}` +
        (h.deltaSincePrevious !== null
          ? ` (${h.deltaSincePrevious >= 0 ? "+" : ""}${h.deltaSincePrevious} pts depuis le relevé précédent).`
          : "."),
    );
    lines.push("");
  }
  if (pack.finance) {
    const f = pack.finance;
    lines.push("## Votre situation financière");
    lines.push(
      `- Revenus : ${money.format(f.annualIncome)} par année · dépenses : ${money.format(f.monthlyExpenses)} par mois.`,
    );
    lines.push(
      `- Ce que vous possédez : ${money.format(f.totalAssets)} · ce que vous devez : ${money.format(f.totalDebts)} · avoir net : **${money.format(f.netWorth)}**.`,
    );
    lines.push("");
  }
  if (pack.health && pack.health.strengths.length > 0) {
    lines.push("## Ce qui va bien");
    for (const s of pack.health.strengths.slice(0, 3)) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }
  if (pack.health && pack.health.risks.length > 0) {
    lines.push("## Ce qu'on surveille ensemble");
    for (const r of pack.health.risks.slice(0, 3)) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }
  if (pack.goals.length > 0) {
    lines.push("## Vos objectifs");
    for (const g of pack.goals.slice(0, 5)) {
      lines.push(
        `- ${g.name} — cible ${money.format(g.targetAmount)}` +
          (g.targetDate ? ` pour ${fmtDate(g.targetDate)}` : "") +
          ".",
      );
    }
    lines.push("");
  }
  if (pack.health && pack.health.topActions.length > 0) {
    lines.push("## Prochaines étapes proposées");
    for (const a of pack.health.topActions.slice(0, 3)) {
      lines.push(`- ${a}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push(
    `_Généré par l'assistante CoAdvisor à partir des données vérifiées du dossier — validé par votre conseiller._`,
  );
  return lines.join("\n");
}

export class LocalComposerProvider implements CopilotProvider {
  readonly id = "local-composer";
  readonly label = "Composer local (déterministe)";

  isConfigured(): boolean {
    return true; // toujours disponible — aucun appel externe
  }

  async health() {
    return {
      configured: true,
      reachable: true,
      latencyMs: 0,
      detail: "Composition locale déterministe — aucun appel externe.",
    };
  }

  generate(
    request: CopilotGenerateRequest,
  ): Promise<Omit<CopilotGenerateResult, "fellBack">> {
    const started = Date.now();
    const pack = request.contextPack;

    let content: string;
    let structured: CopilotGenerateResult["structured"];
    switch (request.kind) {
      case "SUMMARY":
        content = composeSummary(pack);
        break;
      case "MEETING_PREP":
        content = composeMeetingPrep(pack);
        break;
      case "SUGGESTIONS": {
        const result = composeSuggestions(pack);
        content = result.content;
        structured = result.structured;
        break;
      }
      case "CLIENT_REPORT":
        content = composeClientReport(pack);
        break;
    }

    return Promise.resolve({
      content,
      structured,
      provider: this.id,
      model: "composer-1.0",
      latencyMs: Date.now() - started,
    });
  }
}
