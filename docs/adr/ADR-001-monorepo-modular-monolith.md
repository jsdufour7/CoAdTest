# ADR-001 — Monorepo Modular Monolith (Turborepo + pnpm)

- **Statut :** Accepté — Sprint 1
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

CoAdvisor vise des milliers de cabinets et des millions d'utilisateurs
(philosophie « FinTech Enterprise »), tout en devant livrer vite un MVP.
Le Playbook impose Phase 1 = Modular Monolith, Phase 2 = services spécialisés.

## Décision

Monorepo **Turborepo + pnpm workspaces** :

- `apps/` — 3 applications Next.js 15 (web-advisor, web-client, web-marketplace)
- `packages/` — modules métier et fondations (`database`, `auth`,
  `core-platform`, `ai`, `ui`, `types`, `config`)

Règles d'import strictes :

1. Une fonctionnalité = un module propriétaire (ses services, ses schémas).
2. Les apps consomment les packages via leur `index.ts` public uniquement.
3. Aucun import croisé de code interne d'un module par un autre module.

## Conséquences

- Boundaries de domaine = packages : extraction future en microservices
  sans réécriture de la logique (Playbook Phase 2).
- Builds incrémentaux + cache Turbo.
- Les packages exportent leurs sources TS (`transpilePackages`) : pas
  d'étape de build intermédiaire au prix d'une contrainte Next.js documentée.

## Alternatives écartées

- Microservices dès le départ : surcoût opérationnel rédhibitoire au MVP.
- Repo unique par app : duplication de la logique partagée (interdite par
  les Development Rules).
