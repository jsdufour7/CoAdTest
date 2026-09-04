# codex-bridge — passerelle locale compatible OpenAI

Expose `codex` CLI (authentifié via ton compte ChatGPT Plus avec
[`codex login`](https://github.com/openai/codex)) derrière une API locale
compatible OpenAI, pour alimenter le **Copilot CoAdvisor** sans clé API
officielle.

```
CoAdvisor (backend serveur)  →  POST http://127.0.0.1:8787/v1/chat/completions
  →  codex-bridge (ce script)  →  codex exec --skip-git-repo-check --json "…"
  →  réponse renvoyée au format chat.completion
```

## Prérequis

1. Node 18+ (déjà installé pour CoAdvisor).
2. Codex CLI installé et authentifié : `codex login` (compte ChatGPT).
3. CoAdvisor configuré dans le `.env` racine :

```env
COPILOT_PROVIDER=codex-bridge
LLM_BASE_URL=http://127.0.0.1:8787/v1
LLM_API_KEY=coadvisor-demo-secret
LLM_MODEL=gpt-5.6-terra
```

## Lancement

```powershell
# PowerShell (depuis la racine du projet)
node tools/codex-bridge/server.mjs

# Avec une autre clé locale (DEV seulement)
$env:BRIDGE_API_KEY="mot-de-passe-local"; node tools/codex-bridge/server.mjs
```

Vérification :

```powershell
curl http://127.0.0.1:8787/health
# {"status":"ok","bridge":"codex-bridge/1.0.0",...}
```

Puis démarre CoAdvisor (`pnpm dev:advisor`) et, dans un dossier client,
ouvre **Copilot → Tester la passerelle** : le badge devient `codex-bridge`.

## Configuration (variables d'environnement)

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `BRIDGE_PORT` | `8787` | Port d'écoute local |
| `BRIDGE_HOST` | `127.0.0.1` | Hôte d'écoute — **garder local** |
| `BRIDGE_API_KEY` | `coadvisor-demo-secret` | Bearer exigé sur `/v1/*` (DEV) |
| `CODEX_BIN` | `codex` | Exécutable du CLI (ex. chemin complet) |
| `CODEX_TIMEOUT_MS` | `120000` | Délai max d'une génération |

## Sécurité

- Écoute **locale seulement** (`127.0.0.1`) — aucune exposition réseau.
- La clé (`BRIDGE_API_KEY` = `LLM_API_KEY`) protège l'endpoint contre les
  autres processus de la machine; ce n'est **pas** une clé OpenAI.
- Aucune clé ne transite par le navigateur : les appels partent des
  server actions Next.js (backend CoAdvisor) uniquement.
- Le prompt (données du dossier) est passé en **argument** du processus
  (`spawn` sans shell) — pas d'injection de commandes.
- Résidence des données : conformément à ta décision Sprint 5, la
  contrainte région CA n'est pas bloquante pour ce sprint; l'architecture
  de providers permet de la remplacer ensuite sans toucher au Copilot.

## Dépannage

| Symptôme | Correctif |
| --- | --- |
| `codex CLI introuvable` | Installer le CLI puis `codex login`; ou pointer `CODEX_BIN` vers le chemin complet |
| `Non autorisé (401)` | `BRIDGE_API_KEY` (bridge) ≠ `LLM_API_KEY` (.env CoAdvisor) |
| `timeout` | Génération longue : augmenter `CODEX_TIMEOUT_MS` (bridge) et `LLM_TIMEOUT_MS` (app) |
| Badge « composer local » | Bridge non démarré, ou `LLM_BASE_URL` absent du `.env` racine — vérifier avec « Tester la passerelle » |
