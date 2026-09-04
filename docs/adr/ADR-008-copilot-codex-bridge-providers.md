# ADR-008 — Copilot : contrat de providers, passerelle locale codex-bridge, secours déterministe, exécution serveur uniquement

- **Statut :** Accepté — Sprint 5
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le Sprint 5 (Playbook — *Advisor Intelligence*) livre le Copilot
conseiller : résumé de dossier, préparation de rencontre, suggestions
actionnables et bilan client imprimable (FR-AI-001). Critère de
validation : **le conseiller économise du temps**.

La stratégie IA fixe deux lignes rouges absolues : **JAMAIS** de conseil
financier automatique ni de diagnostic ; **TOUJOURS** de l'assistance et
de la pédagogie au service du conseiller, qui valide avant usage.

Décision d'équipe (spécification Sprint 5, actée) :

- l'application ne reçoit **aucune clé API OpenAI officielle** ;
- elle appelle une **API locale compatible OpenAI** (`LLM_BASE_URL`),
  hébergée sur le poste du membre de l'équipe, qui transmet les requêtes
  au client Codex local authentifié par `codex login` (compte ChatGPT
  Plus) via `codex exec --skip-git-repo-check --json "PROMPT"` ;
- la passerelle n'existe que sur les postes locaux — jamais dans
  l'infrastructure ;
- la contrainte de région canadienne **ne bloque pas** le sprint :
  l'architecture de providers doit permettre à un fournisseur conforme
  (hébergement CA, ex. Azure OpenAI Canada ou fournisseur québécois) de
  remplacer la passerelle plus tard **sans modifier l'interface du
  Copilot**.

Options écartées :

- *Clé OpenAI officielle dans l'app* : contraire à la décision d'équipe
  (aucune clé à gérer, aucun coût API, conversations sur le compte
  ChatGPT Plus existant).
- *Appel navigateur direct à la passerelle* : exposerait `LLM_BASE_URL`
  et `LLM_API_KEY` côté client, traverserait les origines (CORS) et
  empêcherait le contrôle RBAC/audit côté serveur.
- *Provider unique, échec = erreur utilisateur* : un outil de gain de
  temps qui tombe en panne quand la passerelle n'est pas lancée détruit
  la promesse du sprint ; le secours local garantit un Copilot
  **toujours utilisable**, y compris hors ligne et en CI.

## Décision

1. **Contrat abstrait commun** (`copilot/contract.ts`) : interface
   `CopilotProvider` (`name`, `kind`, `isConfigured()`, `generate()`,
   `health()`), `CopilotContextPack` (données structurées du dossier,
   assemblées une seule fois par `context-pack.ts` via le contexte
   tenant — RLS appliquée), et `CopilotBridgeError` (`DomainError`)
   typée par cause : `not_configured | network | timeout | http |
   http_auth | invalid_response`. Le kind SUGGESTIONS consomme une
   sortie structurée `{ title, rationale, category }[]`, les trois
   autres un texte Markdown (version contrat : `copilot-1.0`).
2. **Deux providers, un seul résolveur** (`copilot/resolver.ts`) :
   - `CodexBridgeProvider` — client HTTP de l'API locale compatible
     OpenAI : `POST {LLM_BASE_URL}/chat/completions` (Bearer
     `LLM_API_KEY`, modèle `LLM_MODEL`, **délai 60 s** via
     `AbortController`), validation stricte de la réponse
     (`choices[0].message.content` non vide) et sonde
     `GET {LLM_BASE_URL∖v1}/health` (délai 8 s) pour le bouton
     « Tester la passerelle » ;
   - `LocalComposerProvider` — gabarits français **déterministes**
     construits directement depuis le context pack (même qualité de
     données, zéro dépendance réseau, versionné `composer-1.0`).
   - Sélection par `COPILOT_PROVIDER` (`auto` par défaut) :
     `generateWithFallback()` tente le bridge **s'il est configuré** ;
     toute `CopilotBridgeError` déclenche le composer avec
     `fellBack=true` + provenance `attemptedProvider`. Erreur de
     validation métier (accès, données) : propagée, pas de secours —
     un secours ne masque jamais une faute d'usage.
3. **Exécution serveur uniquement** : aucun appel IA depuis le
   navigateur. Toute génération passe par des *server actions* Next.js
   (`requireAdvisorContext`, permission `clients:write`), la passerelle
   n'est jamais mentionnée au client : l'UI ne voit que
   `provider`, `model`, `fellBack` (badge « codex-bridge » /
   « composer local (secours) ») et le résultat de la sonde `/health`.
4. **Artefacts immuables et audités** (`copilot_artifacts`, RLS,
   Règle 3) : chaque génération crée une nouvelle ligne (jamais
   d'`UPDATE`) avec `provider`, `model`, `composerVersion`,
   `latencyMs`, `fellBack`, `generatedBy` + audit
   `ai.copilot.generated` en **métadonnées seulement** (minimisation :
   pas de contenu généré dans le journal). L'historique est affiché en
   bas de page Copilot.
5. **Passerelle `tools/codex-bridge/server.mjs`** (Node ≥ 20, zéro
   dépendance, hors monorepo applicatif — lancée manuellement sur le
   poste) : `GET /health` sans auth ; `POST /v1/chat/completions` avec
   Bearer (`BRIDGE_API_KEY`), aplatissement des messages OpenAI en un
   prompt unique, exécution temporaire de
   `codex exec --skip-git-repo-check --json` (`shell: false`, délai
   `CODEX_TIMEOUT_MS` = 120 s), analyse des **JSON Lines** et
   extraction du texte aux événements `type="item.completed"` /
   `item.type="agent_message"` ; réponses au format OpenAI (succès et
   erreurs). Écoute `127.0.0.1` par défaut.
6. **La mention « IA assistive » est partout** : bandeau en tête de la
   page Copilot, provenance sous chaque artefact, pied de page du bilan
   (« Ce document ne constitue pas un avis financier réglementé »).
   Les suggestions aboutissent à des **tâches** (le conseiller décide),
   jamais à des actions automatiques.

## Conséquences

- **Positives** : Copilot fonctionnel dès l'installation (composer
  local) et alimenté par Codex/ChatGPT Plus dès que la passerelle tourne
  — sans rien changer au code ; aucun secret côté navigateur ;
  traçabilité complète (provider, modèle, latence, secours) à des fins
  AMF/Loi 25 ; remplacement futur par un provider « région Canada »
  = nouveau `CopilotProvider` + `Priority` dans le résolveur, UI
  inchangée ; tests du bridge sans Codex (fausse API `node:http`).
- **Coûts/risques** : la qualité des réponses dépend du poste local
  (Codex installé, session `codex login` active, délais LLM jusqu'à
  60 s → état « Génération… » et latence affichée) ; le composer local
  produit des textes gabarités (utiles, mais non rédactionnels) —
  assumé : il est un **secours** et un démonstrateur du contrat.
- **Suivi** : Sprint 7 (rapports) réutilisera les artefacts
  `CLIENT_REPORT` ; un provider hébergé au Canada devra passer la
  revue conformité (Loi 25, résidence des données) avant activation.
