# Sprint 1 — Core Platform Foundation

- **Objectif (critère de succès) :** un cabinet peut créer son
  environnement sécurisé.
- **Statut :** Code généré et validé (2026-07-29) — tests unitaires 19/19 ✓,
  typecheck 9/9 ✓, lint 9/9 ✓, build 3/3 ✓. Reste à exécuter sur
  environnement réel : migrations + tests RLS (RUN_DB_TESTS=1) + e2e
  Playwright (DB + navigateur requis).

## Tickets

| # | Ticket | Statut | Preuve |
|---|--------|--------|--------|
| S1-01 | Bootstrap monorepo (Turbo + pnpm, TS strict, ESLint) | ✅ | `turbo.json`, `tsconfig.*` |
| S1-02 | Validation env + `.env.example` | ✅ | `.env.example`, `DIRECT_URL` |
| S1-03 | PostgreSQL local (docker-compose + pgvector, rôle NOBYPASSRLS) | ✅ | `docker-compose.yml`, `docker/db/init.sql` |
| S1-04 | Schéma Core (Tenant, User, TenantUser, Session, AuditLog) | ✅ | migration `0001_init` |
| S1-05 | RLS multi-tenant + tests d'isolation | ✅ code / ⏳ exécu. CI | migration `0002`, `rls.integration.test.ts` |
| S1-06 | Auth auto-hébergée (sessions hachées, Argon2id, cookie HttpOnly) | ✅ | `packages/auth` |
| S1-07 | RBAC 5 rôles + guards (tests unitaires) | ✅ | `rbac.ts`, `rbac.test.ts` |
| S1-08 | Audit transactionnel + immutabilité DB | ✅ | migration `0002`, `audit.service.ts` |
| S1-09 | Parcours « créer mon espace » + invitation + shell 3 apps | ✅ code / ⏳ e2e | `apps/*`, `e2e/` |
| S1-10 | CI (lint, typecheck, tests, build, migrations) + ADR | ✅ | `.github/workflows/ci.yml`, `docs/adr/` |

## Hors scope (confirmé)

- MFA complet (schéma prêt), flux courriel d'invitation (mot de passe
  temporaire affiché), réinitialisation de mot de passe, billing, CRM.

## Suites immédiates (backlog Sprint 1.x → 2)

1. Exécuter la suite complète sur l'environnement cible (`README`).
2. Durcissement auth : rate limiting login, message anti-énumération
   au bootstrap, rotation des sessions.
3. Sprint 2 — CRM Financial (clients, familles, timeline, notes, tâches).
