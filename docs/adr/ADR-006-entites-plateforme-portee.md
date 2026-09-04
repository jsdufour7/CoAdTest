# ADR-006 — Entités à portée plateforme : capability token + consentement Loi 25

- **Statut :** Accepté — Sprint 3
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le Sprint 3 (acquisition publique) introduit les premières entités **sans
tenant** de CoAdvisor : un visiteur anonyme remplit un questionnaire
(`assessments`) puis, seulement s'il le demande, devient un lead
(`leads` — PII : courriel, téléphone). L'architecture RLS d'ADR-003
supposait `tenant_id` sur toute ligne métier. Il fallait étendre le modèle
sans affaiblir le principe « défaut = refus ».

Options écartées :
- *Tenant « public » factice* : pollution du modèle tenant, risque
  d'attributions croisées, comptes-rendus d'audit faussés.
- *Lecture des portraits côté service sans RLS* : briserait la défense en
  profondeur (le DB comme dernier filet) et exposerait les portraits par
  énumération d'UUID.

## Décision

1. **`assessments` = portée plateforme pure** (aucun `tenant_id`).
   - Création : nouveau contexte DB `withPublicContext`
     (`app.tenant_ctx = 'public'`) — la politique n'autorise que des
     insertions sans tenant.
   - Lecture : **capability token** — chaque analyse porte un
     `read_token` UUID généré aléatoirement ; la politique RLS n'expose la
     ligne que si `app.assessment_token` correspond. Le token vit dans
     l'URL du portrait (`/portrait/<id>?k=<token>`) : qui détient le lien
     détient le portrait. Mauvais token ⇒ même résultat qu'une analyse
     inexistante (anti-énumération, 404).
2. **`leads` = tenant optionnel** (`tenant_id` NULLABLE).
   - NULL = boîte plateforme (routage/matching futur, Sprint 6) : invisible
     de tous les tenants.
   - Renseigné = transmis au cabinet référent (lien `?cabinet=slug`,
     résolu **côté serveur** — jamais de `tenant_id` fourni par le client).
   - La PII des leads n'est **jamais** lisible par le contexte public,
     même avec token.
3. **Consentement Loi 25 matérialisé** : case à cocher obligatoire,
   `consent` + `consent_at` horodaté sur chaque lead ; aucune coordonnée
   collectée avant le portrait (minimisation).
4. **Attribution auditée côté cabinet** : transitions de statut et
   conversion lead → client consignées dans `audit_logs` (tenant connu).

## Conséquences

- Le modèle RLS couvre désormais 3 contextes : `system`, `tenant`,
  `public` — toujours avec défaut = refus.
- Les pages portrait sont `noindex` ; le lien est l'unique clé d'accès
  (communication explicite à l'utilisateur).
- Anti-abus reportés au backlog : rate limiting public, expiration des
  tokens, purge des analyses anonymes, file de modération anti-spam pour
  les leads attribués.
- Le conseiller lisant le portrait d'un lead passe par le contexte
  `system` **après** vérification RBAC (`leads:read`) — documenté dans
  `packages/fnae/src/services/leads.ts`.

## Addendum (2026-07-30) — le piège INSERT … RETURNING

Toute écriture Prisma (`create`/`update`) émet `INSERT … RETURNING` :
PostgreSQL exige alors que la ligne retournée satisfasse **aussi** les
politiques SELECT (`USING`), pas seulement le `WITH CHECK`. Une ligne
`assessments` n'étant visible que par son capability token, un INSERT
« public » échouait en `42501` (message trompeur : le `WITH CHECK`
passait). Correctif (migration `0007` + service) :

1. le capability token est **généré par l'application** et le GUC
   `app.assessment_token` est posé **avant** l'insertion ;
2. les politiques sont éclatées par commande (`FOR SELECT`,
   `FOR INSERT`, `FOR ALL` réservé au système) — intention explicite ;
3. la branche « dépôt public de lead » de 0006 est retirée : le même
   piège RETURNING s'y appliquait (PII invisible au public) et le dépôt
   passe par le contexte `system` applicatif.

Règle durable révélée par ce correctif : **toute ligne dont la
visibilité SELECT dépend d'un token/capability doit présenter ce token
dans le GUC AVANT son insertion** (sinon interdire le RETURNING —
impossible avec Prisma `create`).
