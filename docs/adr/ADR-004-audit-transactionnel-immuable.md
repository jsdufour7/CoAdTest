# ADR-004 — Journal d'audit transactionnel et immuable

- **Statut :** Accepté — Sprint 1
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Exigences Loi 25 / LPRPDE / AMF : toute modification sensible doit être
traçable (qui, quoi, quand, avant/après), de façon non falsifiable par
l'application elle-même.

## Décision

1. Table `audit_logs` : tenant, acteur, action, entité, `old_data` /
   `new_data` (JSONB), IP, user-agent, horodatage.
2. Écriture **uniquement** via `recordAudit(tx, …)` dans **la même
   transaction** que la mutation auditée : l'audit naît ou meurt avec elle
   (jamais d'audit orphelin, jamais de mutation non auditée silencieuse).
3. **Immutabilité technique** : `REVOKE UPDATE, DELETE ON audit_logs` pour
   le rôle applicatif (migration 0002). Même un code malveillant ou buggé
   ne peut plus altérer l'historique.
4. Lecture via `listAuditLogs` derrière la permission `audit:read`
   (ADMIN, COMPLIANCE_OFFICER).

## Conséquences

- Conformité par construction ; base solide pour Compliance Intelligence.
- Croissance continue de la table assumée : partitionnement futur et
  politique de rétention prévus (backlog gouvernance des données).
- Le renseignement `old_data`/`new_data` devient obligatoire pour toute
  mutation de donnée financière (Sprint 2+).

## Alternatives écartées

- Triggers PostgreSQL génériques : capture opaque, difficile à enrichir
  (acteur applicatif, IP) ; conservé comme option complémentaire.
- Audit asynchrone (file d'événements) : risque d'audit perdu si la
  mutation réussit et l'événement échoue ; réintroduit en Phase 2 sous
  forme d'outbox pour l'analytique (sans remplacer l'audit transactionnel).
