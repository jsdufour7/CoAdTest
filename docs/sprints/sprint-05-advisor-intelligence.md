# Sprint 5 — Advisor Intelligence (Copilot)

> **Objectif Playbook :** AI Copilot — résumé client, préparation
> rencontre, suggestions.
> **Critère de validation :** *le conseiller économise du temps.*
> **Statut :** ✅ Livré (0.6.0) — validé unitaire + intégration RLS + e2e
> de bout en bout.

## Tickets

| # | Ticket | Livrable | Statut |
|---|--------|----------|--------|
| S5-T1 | Fondation Copilot (modèle) | `copilot_artifacts` (immuables, Règle 3) + enum 4 types — migrations `0010`/`0011` (RLS incluse) | ✅ |
| S5-T2 | Contrat fournisseurs abstrait | `packages/ai/src/copilot/contract.ts` (interface `CopilotProvider`, `CopilotContextPack`, `CopilotBridgeError` typée par cause) — exigence 2 | ✅ |
| S5-T3 | Provider passerelle Codex | `CodexBridgeProvider` : API locale compatible OpenAI (`LLM_BASE_URL`), Bearer, délai 60 s, validation stricte, sonde `/health` — exigences 1, 6, 8 | ✅ |
| S5-T4 | Secours local automatique | `LocalComposerProvider` (4 gabarits FR déterministes) + `generateWithFallback` (`fellBack` + provenance) — exigence 3 | ✅ |
| S5-T5 | Services + audit | 4 générateurs (`clients:write` requis, audit `ai.copilot.generated` en métadonnées seulement), liste + dernier artefact, sonde bridge | ✅ |
| S5-T6 | Page Copilot (réponse : page dédiée + carte 360) | `/clients/[id]/copilot` : 4 artefacts, badge moteur actif, testeur de passerelle, historique ; carte résumé sur la fiche 360° ; indicateur `codex-bridge` / `composer local (secours)` — exigence 7 | ✅ |
| S5-T7 | Bilan client imprimable | `/copilot/bilan` (impression navigateur, sans lib PDF — décision : PDF au Sprint 7) + mention « pas un avis financier réglementé » | ✅ |
| S5-T8 | Actions 1 clic | Préparation → note MEETING au journal (contrôle anti-péremption) ; Suggestion → tâche dans le dossier — réponses d'équipe | ✅ |
| S5-T9 | Passerelle locale | `tools/codex-bridge/server.mjs` (Node ≥ 20, zéro dépendance) : `POST /v1/chat/completions` → `codex exec --skip-git-repo-check --json`, parse JSONL `item.completed/agent_message`, `GET /health` — spéc. d'équipe | ✅ |
| S5-T10 | Configuration documentée | `.env.example` : `COPILOT_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY` (« Ce n'est PAS une clé API OpenAI »), `LLM_MODEL`, `LLM_TIMEOUT_MS` — exigence 5 | ✅ |

## Décisions appliquées

- **ADR-008** : contrat de providers, passerelle locale codex-bridge,
  secours déterministe, exécution serveur uniquement (aucun appel IA
  navigateur — exigences 4 et 9).
- Spécification d'équipe (message du sprint, reprise intégralement) :
  `COPILOT_PROVIDER=codex-bridge`/`auto`, fréquence `gpt-5.6-terra` par
  défaut, comportement « si `LLM_BASE_URL` non configuré ou passerelle
  muette → composer local automatiquement », région Canada **non
  bloquante** (un provider conforme pourra remplacer le bridge sans
  toucher l'UI).
- Réponses d'équipe (session planif. Sprint 5) : UX **page-360** (page
  Copilot dédiée + carte de synthèse sur la fiche), rapport
  **bilan-simple** (imprimable navigateur), préparation **savable** au
  journal en 1 clic.
- Lignes rouges IA respectées : bandeau « IA assistive — jamais de
  conseil automatique », provenance (provider + modèle + secours) sous
  chaque artefact, suggestions → **tâches** décidées par le conseiller,
  audit en métadonnées (minimisation Loi 25).

## Validation

| Niveau | Résultat |
|--------|----------|
| Unitaires (vitest) | **19/19 `@coadvisor/ai`** : 7 composer (4 gabarits FR, suggestions typées) + 12 bridge contre une fausse API OpenAI `node:http` (succès + format des messages, 401→`http_auth`, JSON invalide, contenu vide, délai d'attente, `/health`, secours `fellBack=true` avec `attemptedProvider`, composer direct) — total monorepo **75 unitaires + 5 intégration** |
| Typecheck / lint | 0 erreur, tous packages et apps |
| Build Next.js | 3/3 apps compilées |
| RLS intégration (vraie PostgreSQL) | **5/5** — dont probe `CopilotArtifact` cross-tenant (tenant B invisible depuis A) |
| e2e (Playwright, 3 apps, navigateur réel) | **12/12** — scénario Sprint 5 complet : fiche 360 → badge + test passerelle « non configurée » → résumé → préparation **sauvegardée au journal** → suggestions → **tâche créée** → bilan version imprimable → historique → note visible sur la fiche |
| Captures | `docs/screenshots/s05-advisor-copilot.png`, `s05-advisor-copilot-bilan.png`, `s05-advisor-fiche360-copilot.png` (`node scripts/visual-qa-s05.mjs`) |

### Incident détecté et corrigé en validation

Le premier passage e2e a révélé une **course critique réelle** (au-delà
du test) : après « Régénérer la préparation », un clic immédiat sur
« Sauvegarder au journal » pouvait soumettre l'identifiant de l'ancien
artefact → `STALE_ARTIFACT`… et l'exception non rattrapée faisait
**planter la page entière**. Correctifs livrés : action convertie en
formulaire à état (`SavePrepButton`) — erreur affichée **en ligne**,
page intacte ; ancres d'attente déterministes dans le test (comptage des
avis « Artefact généré avec »). Cas d'usage métier couvert : deux
onglets ouverts sur la même fiche ne peuvent plus briser l'écran.

## Hors scope (confirmé)

- Export PDF proprement dit (lib dédiée) → **Sprint 7** (le bilan est
  déjà imprimable/sauvegardable en PDF via le navigateur).
- Provider « région Canada » hébergé : l'architecture de contrat est
  prête ; la conformité résidence des données sera revue à l'activation.
- `codex login` / installation Codex : poste local de l'équipe, jamais
  dans Arena (la passerelle est livrée, non exécutée ici — exigence
  respectée : `node tools/codex-bridge/server.mjs` pour la lancer).
- Réponses streaming : la passerelle et le contrat sont prêts pour
  `delta` ultérieur ; UX actuelle = génération complète + latence
  affichée.

## Suites immédiates (backlog → Sprint 6)

- Portail & Insights : exposer les conseils vulgarisés issus du bilan
  (consentement + conseil filtré) et la courbe FHI côte à côte.
- Rencontres & Documents : la note MEETING générée ouvre la voie au
  parcours de rencontre complet (ordre du jour, présence, suivi).
- Rapports QA : réutiliser `CLIENT_REPORT` pour l'export Sprint 7.
