# Sprint 4 — Financial Health Engine

> **Objectif Playbook :** créer le différenciateur principal.
> **Critère de validation :** *le client comprend sa santé financière.*
> **Statut :** ✅ Livré (0.5.0) — validé unitaire + intégration RLS + e2e de bout en bout.

## Tickets

| # | Ticket | Livrable | Statut |
|---|--------|----------|--------|
| S4-T1 | Modèle granulaire (Data Arch. §5/§6) | 12 tables : `assets`, `liabilities`, `incomes`, `expenses`, `insurance_policies`, `financial_goals`, `retirement_plans`, `financial_contexts` + snapshots FHI (migrations 0008/0009, RLS incluse) | ✅ |
| S4-T2 | Moteur FHI v1 (FR-FHE-001) | `packages/health-engine` — `computeFhi` pur, 10 catégories pondérées, `fhe-1.0`, 100 % déterministe | ✅ |
| S4-T3 | Explications (FR-FHE-002) | Insights typés (`STRENGTH/RISK/OPPORTUNITY/ACTION`) + sévérité + piste d'amélioration obligatoire sur les signaux RISK/ACTION | ✅ |
| S4-T4 | Saisie granulaire conseiller | Page `/clients/[id]/finances` : 8 sections (revenus, dépenses, actifs, dettes, assurances, objectifs, retraite, fiscalité/succession), ajouts + retraits audités | ✅ |
| S4-T5 | Tableau santé conseiller | Page `/clients/[id]/sante` : jauge FHI, 10 barres pondérées, insights groupés, historique immuable, badge FHI sur la fiche 360° | ✅ |
| S4-T6 | Historique & progression | `health_progress` (delta + raison) — jamais d'UPDATE, timeline FINANCIAL_EVENT, audit `fhi.calculated` | ✅ |
| S4-T7 | Portail particulier | `client_portal_links` (code haché affiché une fois, consentement Loi 25 horodaté, révocation) + `/inscription`, `/lier`, `/espace` (:3001) tableau FHI read-only | ✅ |
| S4-T8 | Seed démo FHI | Profil financier complet de Jean Bouchard (le FHI se calcule via le produit — jamais simulé) | ✅ |

## Décisions appliquées

- **ADR-007** : moteur déterministe pur, pondération v1 (Retraite 15 %,
  Assurance 13 %, Budget/Dette 12 %…), `Decimal` en base ↔ `Number` dans
  le moteur, snapshots immuables, `Asset.registered` (projection du
  `metadata` §5), lien portail par code haché + consentement horodaté.
- Réponses fondatrice (session planif. Sprint 4) : modèle **granulaire
  complet** (pas de raccourci « agrégats saisis à la main ») et FHI
  affiché **au conseiller ET au portail** dès ce sprint.
- ESLint base : convention `_` (placeholder intentionnel) désormais
  acceptée (`argsIgnorePattern: "^_"`) — les signatures de server actions
  React 19 (`_prevState`, `_formData`) restent lisibles.

## Validation

| Niveau | Résultat |
|--------|----------|
| Unitaires (vitest) | **11/11 health-engine** (pondération = 1, déterminisme, HEALTHY > FRAGILE + 30, signaux assurance/fiscalité/succession, recommandations requises) + 45/45 autres packages |
| Typecheck / lint | 0 erreur, tous packages et apps |
| Build Next.js | 3/3 apps compilées |
| RLS intégration (vraie PostgreSQL) | 5/5 — dont nouveau test FHE : 12 tables cloisonnées, écriture cross-tenant rejetée |
| E2E Playwright (3 applis, prod) | **11/11** — dont boucle complète : saisie granulaire → calcul FHI (refus sans revenu) → catégories + explications + historique préservé → badge 360° → invitation → liaison **consentie** (refus sans consentement) → FHI visible et explicable côté client → code non réutilisable |

Captures : `docs/screenshots/s04-advisor-sante-fhi.png`,
`s04-advisor-finances.png`, `s04-portail-lier.png`,
`s04-portail-espace-fhi.png`.

## Hors scope (confirmé)

- Simulations/scénarios retraite détaillés (`projectionData`, `scenarios`
  — Data Arch. §6 : modélisés, calcul reporté).
- Import de relevés / agrégation bancaire.
- Envoi du code d'invitation par e-mail/SMS (remise manuelle v1).
- « AI Financial Twin » (Sprint 8+ — consommera les snapshots en lecture).
- Contribution du particulier à ses données (portail read-only v1).

## Suites immédiates (backlog → Sprint 5)

- Rencontres & documents (nav « Rencontres » est prévue) + parcours
  onboarding client complet.
- Projection retraite simple (le moteur a déjà `retirementMultiple`).
- Durcissement UX du portail (graphique de progression, partage PDF?).
- Piège documenté ADR-007 : jamais de `GRANT … ON ALL TABLES` après les
  migrations (immutabilité audit_logs, ADR-004).
