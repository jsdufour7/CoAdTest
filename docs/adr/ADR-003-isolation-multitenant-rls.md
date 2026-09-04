# ADR-003 — Isolation multi-tenant par Row Level Security PostgreSQL

- **Statut :** Accepté — Sprint 1
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Une fuite inter-tenant est le risque critique n° 1 d'une plateforme
FinTech mutualisée (AMF, Loi 25, confiance client). Le filtrage par
`WHERE tenantId = …` au niveau applicatif seul est insuffisant : un seul
oubli dans une requête suffit.

## Décision

Défense en profondeur :

1. **Schéma partagé** + colonne `tenant_id` sur chaque table tenant-based.
2. **RLS + FORCE ROW LEVEL SECURITY** sur toutes ces tables
   (migration `0002_rls_multitenancy`). Défaut = aucune ligne visible.
3. **Deux rôles PostgreSQL** :
   - `coadvisor_app` (runtime, `NOBYPASSRLS`) → politiques appliquées ;
   - propriétaire (migrations DDL, `DATABASE_URL` vs `DIRECT_URL`).
4. **Contexte transactionnel** posé par `@coadvisor/database` :
   - `withTenantContext(tenantId, userId, fn)` →
     `SET LOCAL app.tenant_ctx/app.current_tenant/app.current_user` ;
   - `withSystemContext(fn)` → flux privilégiés (auth, bootstrap,
     invitations) après vérification RBAC applicative.
5. **Tests d'intégration dédiés** (`rls.integration.test.ts`, CI) prouvant
   l'impossibilité de lecture/écriture croisée.

## Conséquences

- Un bug applicatif ne peut plus provoquer de fuite : la BD refuse.
- Toute requête hors contexte échoue « fermé » (défaut refus).
- Prisma + RLS exige la discipline « contexte en transaction » : encadrée
  par les seules fonctions ci-dessus (revues de code).

## Alternatives écartées

- Schéma/base par tenant : isolation maximale mais opérations (migrations ×N)
  incompatibles avec la vélocité MVP ; réévaluable pour clients Enterprise.
- Filtrage applicatif seul : rejeté (risque inacceptable).
