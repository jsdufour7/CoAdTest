# Sprint 2 — CRM Financial Foundation

- **Objectif (critère de succès) :** un conseiller peut gérer un dossier
  client.
- **Statut :** Code généré et validé (2026-07-30) — tests unitaires ✓
  (9 nouveaux tests schémas CRM, suite complète verte), typecheck 11/11 ✓,
  lint 11/11 ✓, build 3/3 ✓ (web-advisor : 7 → 10 pages). Reste à exécuter
  sur environnement réel : migrations `0003`/`0004` + tests RLS
  (RUN_DB_TESTS=1) + e2e Playwright (DB requise).

## Tickets

| # | Ticket | Statut | Preuve |
|---|--------|--------|--------|
| S2-01 | Schéma CRM (Client, FamilyMember, TimelineEvent, Note, Task + 8 enums) | ✅ | migration `0003_crm_foundation` |
| S2-02 | RLS + FORCE sur les 5 tables CRM (boucle DO, défaut refus) | ✅ code / ⏳ exécu. CI | migration `0004_crm_rls` |
| S2-03 | Package `@coadvisor/crm` (frontière module, index public) | ✅ | `packages/crm/` |
| S2-04 | Schémas zod + messages français (dates/textes facultatifs de formulaire) | ✅ | `schemas.ts`, 9 tests |
| S2-05 | Service clients : créer (FR-CRM-001), lister/rechercher, compter, fiche 360 | ✅ | `clients/client.service.ts` |
| S2-06 | Timeline Financial Life OS (FR-CRM-002) — historique préservé, jamais supprimé | ✅ | `timeline/timeline.service.ts` |
| S2-07 | Notes professionnelles auditées (MEETING → entrée timeline) | ✅ | `notes/note.service.ts` |
| S2-08 | Tâches de suivi (création, bascule TODO↔DONE auditée) | ✅ | `tasks/task.service.ts` |
| S2-09 | Entourage financier (famille) + événement de vie timeline | ✅ | `family/family.service.ts` |
| S2-10 | UI conseiller : liste/recherche, nouveau dossier, fiche 360 (notes/tâches/famille/timeline) | ✅ | `apps/web-advisor/app/clients/` |
| S2-11 | Dashboard branché : nav partagée `ADVISOR_NAV`, KPI « Clients suivis » réel | ✅ | `app/dashboard/page.tsx` |
| S2-12 | Middleware : protection des routes `/clients/*` | ✅ | `middleware.ts` |
| S2-13 | Seed démo enrichi (Jean Bouchard, famille, timeline, note, tâche) — idempotent | ✅ | `packages/database/src/seed.ts` |
| S2-14 | Test RLS cross-tenant CRM (clients + tables liées cloisonnées) | ✅ code / ⏳ CI | `rls.integration.test.ts` |
| S2-15 | e2e : parcours complet « gérer un dossier client » + recherche | ✅ code / ⏳ exécu. | `e2e/web-advisor.spec.ts` |

## Décisions appliquées

- **Pattern acteur** : chaque service reçoit `CrmActor { userId, tenantId,
  role }` établi une fois par requête (`requireAdvisorContext`) —
  `requirePermission` (RBAC) systématique, `withTenantContext` systématique,
  `recordAudit` systématique sur mutation sensible (Playbook règles 1, 3, 6).
- **Fiche client 360°** : un seul `getClient` (notes + tâches + famille +
  timeline, bornes de pagination) — couche UI mince, zéro logique métier.
- **Progressive enhancement** : formulaires en server actions
  (`useActionState`), bascule de tâche sans JS requis.
- **Données financières préservées** : aucune suppression exposée sur les
  entités CRM ; la timeline ignore l'UPDATE/DELETE par conception
  (Règle 3 — historique financier sacré).

## Hors scope (confirmé)

- Modification/archivage de dossier via UI (service prêt côté statuts,
  écran à venir), documents au dossier (Sprint 7), partage multi-conseiller
  granulaire, import en masse, vue « Rencontres » transversale (Sprint 3+).

## Suites immédiates (backlog → Sprint 3)

1. Exécuter migrations `0003`/`0004` + suite complète sur l'environnement
   cible (`README`) ; jouer le parcours e2e.
2. Sprint 3 — Financial Needs Assessment Engine (analyse publique, leads,
   rapports) selon la roadmap.
