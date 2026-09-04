# CoAdvisor — Architecture (état Sprint 3)

> Décisions structurantes : voir `docs/adr/ADR-001` à `ADR-006`.

```
┌──────────────────────────────────────────────────────────────┐
│ apps/web-advisor      apps/web-client      apps/web-marketplace│  Présentation
│  :3000 (conseiller)    :3001 (particulier)  :3002 (public)     │  (couche mince)
├──────────────────────────────────────────────────────────────┤
│ @coadvisor/core-platform · @coadvisor/crm · @coadvisor/fnae    │  Modules métier
│  tenants/users/audit    clients/timeline   portrait·leads      │
│                         · @coadvisor/ai (Copilot, contrat providers)│
├──────────────────────────────────────────────────────────────┤
│ @coadvisor/auth      @coadvisor/database      @coadvisor/ui    │  Fondations
│  AuthProvider / RBAC    Prisma + RLS + audit    Design system  │
├──────────────────────────────────────────────────────────────┤
│ PostgreSQL 16 · tenant_id + RLS + entités plateforme (ADR-006) │
│ 3 contextes : system / tenant / public (capability token)      │
└──────────────────────────────────────────────────────────────┘
```

## Chaîne de responsabilité d'une requête authentifiée

1. `middleware.ts` — présence du cookie (garde périphérique, légère).
2. Page/serve action — `getSessionUserFromCookies()` valide la session
   (table `sessions`, haché seulement).
3. Service métier — `requirePermission(role, …)` (RBAC applicatif,
   matrice unique `ROLE_PERMISSIONS`).
4. `@coadvisor/database` — `withTenantContext(…)` pose le contexte RLS.
5. PostgreSQL — les politiques RLS confinent chaque requête au tenant
   (défense en profondeur ; défaut = refus).
6. Mutation sensible — `recordAudit(tx, …)` dans la même transaction.

## Modules métier (livrés et à venir)

| Sprint | Package | Contenu | Statut |
| --- | --- | --- | --- |
| 1 | `@coadvisor/core-platform` | tenants, users, rôles, audit | ✅ livré |
| 2 | `@coadvisor/crm` | clients, familles, timeline, notes, tâches | ✅ livré |
| 3 | `@coadvisor/fnae` | analyse publique, portrait, leads | ✅ livré |
| 4 | `@coadvisor/health-engine` | FHI (10 catégories), insights explicables, profil granulaire, lien portail | ✅ livré |
| 5 | `@coadvisor/ai` | Copilot conseiller (providers : codex-bridge + secours local, ADR-008) | ✅ livré |
| 6 | `@coadvisor/marketplace` | annuaire opt-in, matching `mktmatch-1.0`, contact prospect-conseiller (ADR-009) | ✅ livré |
| 6b | `@coadvisor/notifications` | courriel transactionnel (contrat `notify-1.0` : log + resend) | ✅ livré |
| 7 | `@coadvisor/documents` | coffre chiffré (`docsstore-1.0`), partage (portail + lien capability), signature `signdoc-1.0` (machine à états RLS), rapports `pdfrender-1.0`, export Loi 25 (ADR-010) | ✅ livré |
| 7b | `@coadvisor/documents` | enveloppes multi-signataires (portail/cabinet/externe), champs positionnés + paraphes (`sigstamp-1.0`), tours gravés en RLS (`SECURITY DEFINER`), relances 72 h, gabarits, certificat `signdoc-2.0` (ADR-011) | ✅ livré |
| 7c | `@coadvisor/signdoc` | **moteur de signature autonome** (ports/adaptateurs — ADR-012) : adoption façon DocuSign (`sigstamp-2.0`, styles OFL + ID d'apposition), vue « dans le document » 3 canaux, refus probant + « nouvel envoi » (`resendEnvelope`), bureau des signatures, certificat `signdoc-2.1` ; `@coadvisor/documents` = coffre + composition ; `@coadvisor/crm` : liens inter-clients certifiés (`client_links`, RLS personnel) | ✅ livré |
| 8 | `@coadvisor/billing` + `@coadvisor/analytics` | **commercialisation SaaS** (ADR-013/014/015) : paliers 0/59/119/199 CAD, quotas en transaction (`QUOTA_EXCEEDED` + CTA), paiement simulateur↔Stripe sur un pipeline unique (`billing-1.0`), factures TPS/TVQ pdf-lib (CA-YYYY-NNNN), mesure first-party 16 événements (`analytics-1.0`, `product_events` append-only, sessions SHA-256 salé, `app_portal_proof` SECURITY DEFINER), vue plateforme MRR opérateur ; `@coadvisor/documents` : sauvegarde vérifiable (`backup-1.0` — réplica atomique + client S3 SigV4 Canada, manifeste re-haché SHA-256, `backup_runs` append-only) + quotas coffre + photo marketplace chiffrée servie publiquement | ✅ livré |
| 8 | `@coadvisor/billing` | plans, Stripe, analytics | planifié |
