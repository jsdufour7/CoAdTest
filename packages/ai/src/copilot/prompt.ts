import type { CopilotGenerateRequest } from "./contract";

/**
 * Sérialisation du paquet de données structurées vers un prompt texte
 * (utilisée par les providers LLM — le composer local n'en a pas besoin).
 * Isolée ici pour être testée et pour garder le contrat d'entrée unique.
 */

export const COPILOT_SYSTEM_PROMPT = [
  "Tu es l'assistante d'un conseiller financier québécois qui utilise le logiciel CoAdvisor.",
  "Ton rôle est STRICTEMENT assistif : résumer, organiser, préparer et vulgariser.",
  "Tu ne donnes jamais de conseil financier automatisé ni de diagnostic; le conseiller humain valide tout avant usage.",
  "Tu réponds en français canadien, en Markdown, avec des sections exactement comme demandé.",
  "Tu t'appuies UNIQUEMENT sur les « DONNÉES VÉRIFIÉES » fournies : cite les chiffres exacts, n'invente rien, et signale les données manquantes plutôt que d'estimer.",
  "Tu termines chaque livrable par la mention : « — Généré par l'assistante CoAdvisor, à valider par le conseiller. »",
].join("\n");

const KIND_BRIEFS: Record<CopilotGenerateRequest["kind"], string> = {
  SUMMARY:
    "Produis un RÉSUMÉ DE DOSSIER en 5 sections Markdown : « En bref », « Situation financière », « Santé financière (FHI) », « Activité récente », « Points d'attention ». Maximum 350 mots, phrases courtes, chiffres en dollars CAD.",
  MEETING_PREP:
    "Produis une PRÉPARATION DE RENCONTRE avec 4 sections Markdown : « Depuis la dernière fois », « Ordre du jour suggéré » (5-6 items numérotés), « Chiffres repères à avoir sous la main », « Questions à poser » (3-4). Ton professionnel et efficace.",
  SUGGESTIONS:
    "Produis une liste de 4 à 6 SUGGESTIONS actionnables numérotées, chacune au format : « **Titre de l'action** — justification en une phrase tirée des données. » Classes-les mentalement en tâche / révision / opportunité / qualité de données, sans afficher la classe.",
  CLIENT_REPORT:
    "Produis un BILAN DE SANTÉ FINANCIÈRE destiné AU CLIENT (vulgarisation, aucune jargon) avec les sections : « Votre indice en un coup d'œil », « Votre situation financière », « Ce qui va bien », « Ce qu'on surveille ensemble », « Vos objectifs », « Prochaines étapes proposées ». Commence par une note indiquant que ce document d'assistance ne remplace pas un avis réglementé.",
};

function jsonBlock(value: unknown): string {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

export function buildUserPrompt(request: CopilotGenerateRequest): string {
  const parts: string[] = [
    `# TÂCHE\n${KIND_BRIEFS[request.kind]}`,
    `\n# DONNÉES VÉRIFIÉES (dossier client — ${request.contextPack.tenant.name})`,
    jsonBlock(request.contextPack),
  ];
  if (request.instructions && request.instructions.trim() !== "") {
    parts.push(`\n# CONSIGNES DU CONSEILLER\n${request.instructions.trim()}`);
  }
  parts.push("\nRédige le livrable maintenant.");
  return parts.join("\n");
}
