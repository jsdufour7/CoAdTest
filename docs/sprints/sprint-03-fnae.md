# Sprint 3 — Financial Needs Assessment Engine

- **Objectif (critère de succès) :** un utilisateur peut obtenir son
  portrait financier.
- **Statut :** Code généré et validé (2026-07-30) — tests unitaires ✓
  (45 au total, dont 17 FNAE), typecheck 12/12 ✓, lint 12/12 ✓,
  build 3/3 ✓ (web-advisor 11 pages, web-marketplace 8 pages).
  **Validé ensuite sur PostgreSQL réel** : suite RLS 4/4 ✓ et e2e
  Playwright 8/8 ✓ (Sprints 1-3). Correctif 0.4.1 (piège INSERT…RETURNING
  RLS, voir addendum ADR-006 + migration `0007`).

## Tickets

| # | Ticket | Statut | Preuve |
|---|--------|--------|--------|
| S3-01 | Schéma plateforme `Assessment` + `Lead` (consentement Loi 25) | ✅ | migration `0005_fnae_foundation` |
| S3-02 | RLS portée plateforme : capability token, leads tenant NULLABLE, défaut refus | ✅ code / ⏳ exécu. CI | migration `0006_fnae_rls` |
| S3-03 | Contexte DB `withPublicContext` (3e contexte après system/tenant) | ✅ | `packages/database/src/context.ts` |
| S3-04 | Package `@coadvisor/fnae` (frontière module) | ✅ | `packages/fnae/` |
| S3-05 | Questionnaire express FR-FNAE-001 (revenus, dépenses, actifs, dettes, retraite, objectifs, protection) | ✅ | `questionnaire.ts` + 6 tests |
| S3-06 | Moteur déterministe `fnae-1.0` : 6 dimensions, score /100, insights, 3 priorités | ✅ | `engine.ts` + 11 tests |
| S3-07 | Questionnaire public multi-étapes (5 étapes, validation par étape) sur web-marketplace | ✅ | `app/analyse/` |
| S3-08 | Page Portrait : score, dimensions, ratios, priorités, observations — noindex, token-only | ✅ | `app/portrait/[id]/page.tsx` |
| S3-09 | Capture lead consentie (Loi 25) + déduplication + attribution `?cabinet=slug` résolue serveur | ✅ | `services/public.ts` |
| S3-10 | Boîte de réception `/leads` conseiller (liste, filtre statut, fiche portrait) | ✅ | `app/leads/` |
| S3-11 | Conversion lead → client CRM (composition app : crm.createClient + fnae.markLeadConverted, audits des 2 côtés) | ✅ | `leads/actions.ts` |
| S3-12 | RBAC `leads:read`/`leads:write` (5 rôles) + nav « Leads » + KPI tableau de bord | ✅ | `rbac.ts`, `nav.tsx`, `dashboard` |
| S3-13 | CTA landing activé (« Faire mon analyse gratuite ») | ✅ | `app/page.tsx` |
| S3-14 | Tests RLS FNAE (token, anti-énumération, PII jamais publique, cross-tenant) | ✅ code / ⏳ CI | `rls.integration.test.ts` |
| S3-15 | e2e : portrait obtenu, token requis, consentement obligatoire, inbox conseiller | ✅ code / ⏳ exécu. | `e2e/web-marketplace.spec.ts` |
| S3-16 | ADR-006 (entités plateforme) | ✅ | `docs/adr/ADR-006` |

## Décisions appliquées

- **Moteur 100 % déterministe** (ratios financiers standards) : l'IA reste
  assistive — elle expliquera le portrait plus tard, ne le calcule pas
  (AI Strategy).
- **Aucune coordonnée avant le résultat** (minimisation Loi 25) : le
  portrait est immédiat et anonyme ; le courriel n'est demandé qu'après,
  avec consentement explicite horodaté.
- **Modules découplés** : `@coadvisor/fnae` n'importe PAS `@coadvisor/crm` —
  la conversion est orchestrée par l'app (racine de composition).
- **Pas d'audit pour les flux anonymes** (audit_logs exige un tenant) :
  traçabilité portée par les lignes elles-mêmes (consent_at, created_at).

## Hors scope (confirmé)

- Matching lead ↔ conseiller (Sprint 6 marketplace), expiration/purge des
  tokens et analyses anonymes, rate limiting public, notification courriel
  au conseiller, export PDF du portrait, renvoi du lien par courriel,
  explications narratives IA du portrait (Sprint 5 Copilot).

## Suites immédiates (backlog → Sprint 4)

1. Exécuter migrations `0005`/`0006` + suite complète (README) ; jouer le
   parcours public complet de bout en bout.
2. Sprint 4 — Financial Health Engine (FHI clients, catégories,
   progression) selon la roadmap.
