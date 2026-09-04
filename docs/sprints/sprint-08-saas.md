# Sprint 8 — Commercialisation SaaS : paliers 0/59/119/199 CAD, quotas vivants, paiement simulateur↔Stripe, factures TPS/TVQ, analytics first-party, sauvegarde vérifiable du coffre, photo marketplace dans le coffre

- **Objectif :** transformer le produit complet (1→7c) en **SaaS
  commercialisable** — la fondatrice/l'équipe peut vendre dès
  maintenant : une grille de paliers appliquée pour de vrai, un
  paiement qui fonctionne en l'absence de clés Stripe (simulateur
  strictement isomorphe), des factures conformes au Québec, une mesure
  d'usage souveraine et une continuité du coffre vérifiable à l'octet.
- **Statut :** ✅ Livré (2026-08-02) — typecheck ✓ (20 projets),
  lint ✓, **199 tests unitaires** ✓ (billing 22, analytics 5,
  documents +backup/sigv4…), intégration **RLS 12/12** ✓, build 3/3 ✓,
  **e2e 30/30** ✓ (24 existants + 6 nouveaux), CLI backup **VERIFIED**
  (170 blobs / 802 360 o), route photo publique **200 image/png**.

## Commande de l'équipe (verrous fondateurs du 2026-08-02)

| Question | Réponse fondateur | Traduction |
| --- | --- | --- |
| Facturation | **Stripe réel + simulateur embarqué** | Bascule par `STRIPE_SECRET_KEY` ; un SEUL pipeline d'activation (ADR-013) |
| Grille | **0 $ / 59 $ / 119 $ / 199 $ CAD** | Découverte · Essentiel · Pro (recommandé) · Cabinet ; +29 $/siège au Cabinet |
| Analytics | **100 % maison, first-party** | `@coadvisor/analytics` — aucun tiers, Loi 25 (ADR-014) |
| Sauvegardes | **S3-compatible Canada + réplica locale** | SigV4 maison, ca-central-1/OVH BHS/MinIO (ADR-015) |

## Ce qui est livré

### 1. Modèle commercial (`@coadvisor/billing` — nouveau paquetage)

- Catalogue unique `plans.ts` (prix, sièges 1/2/3/5, clients 10/100/∞,
  coffre 1/10/100/500 Go, enveloppes 5/50/∞, vitrine, analytics) —
  lu par l'UI, les quotas, les seeds ET les tests.
- **Quotas appliqués dans la transaction métier** : 101e client refusé
  (CTA Pro), coffre plein bloqué avant stockage, 51e enveloppe du mois
  refusée, vitrine gateée Essentiel+, siège refusé avant invitation,
  analytics par palier. Erreur `QuotaExceededError` → message FR + CTA
  de montée calculé (`smallestPlanCovering`).
- **Paiement** : simulateur embarqué (page « hébergée »
  `/abonnement/checkout`, carte 4242 exigée, refus des autres numéros,
  seul `last4` à l'audit) OU Stripe REST + webhook HMAC
  (`t.payload`, `timingSafeEqual`, tolérance 300 s) — sélection par
  `STRIPE_SECRET_KEY`, bandeau de mode visible dans l'UI.
- **Factures** : numérotation CA-YYYY-NNNN, lignes + TPS 5 % + TVQ
  9,975 % recalculées au rendu PDF (pdf-lib, 1 page, WinAnsi-safe),
  téléchargement `/abonnement/factures/<id>` confiné RLS.
- **Page Abonnement** : palier courant + annulation/reprise du
  renouvellement, **jauges d'usage vivantes** (clients, coffre Go,
  enveloppes du mois, sièges), grille 4 paliers, équipe + sièges
  additionnels (Cabinet), registre des factures avec badge Payée + PDF.
  Descente de palier : effet immédiat sans facture (v1, affiché).
- Montée de palier avec preuve de paiement AVANT activation ; pipeline
  tx mutualisé (upsert + facture + sync `tenants.subscription_plan` +
  audit + événements).

### 2. Analytique first-party (`@coadvisor/analytics` — nouveau paquetage)

- **16 événements catalogués** (logins staff/portail, client créé,
  pièce coffre, enveloppe envoyée/renvoyée, signature/refus, rapport,
  analyse FNAE, demande de contact, vitrine, changement de palier,
  facture payée, sauvegarde) émis aux points d'action, `trackSafely`
  non bloquant, INSERT brut sans RETURNING (droit de lecture refusé
  dans les contextes publics).
- `product_events` **append-only** (REVOKE UPDATE/DELETE) ; sessions
  pseudonymisées SHA-256 salé ; RLS INSERT deux branches dont
  `app_portal_proof` SECURITY DEFINER (leçon migrations 0021→0022
  consignée à l'ADR-014).
- Page **Statistiques** : KPIs (événements, sessions, personnes),
  sparkline SVG maison, **entonnoir signatures** (dédoublonné par
  enveloppe : taux de complétion/refus), événements fréquents,
  ventilation par membre (privilège Cabinet), **upsell** honnête sous
  Pro. **Vue plateforme** fondateurs (tenant `PLATFORM_TENANT_SLUG` +
  ADMIN) : MRR, cabinets, abonnements, distribution, 30 j, dernière
  sauvegarde.

### 3. Continuité du coffre (ADR-015)

- Client **S3 SigV4 maison** (vecteurs officiels AWS en tests) —
  virtual-hosted/path-style, `ca-central-1`, `fromEnvironment` = carte
  « Prêt à câbler » tant que non configuré.
- Cycle **inventaire → réplica locale (atomique .part) → S3 →
  manifeste JSON → vérification par re-lecture et re-hash SHA-256** ;
  ligne `backup_runs` écrite UNIQUEMENT à l'issue (VERIFIED/FAILED),
  append-only.
- Gâchettes : bouton opérateur (ADMIN + tenant plateforme) et CLI
  `pnpm --filter @coadvisor/documents backup:run` (contexte système).
- Page **Sauvegardes** : routage 3 zones, registre avec manifestes
  sha256 affichés.

### 4. Photo marketplace dans le coffre

- Upload photo profil conseiller → pièce chiffrée `avatars/<tenant>/…`
  (≤ 5 Mo, PNG/JPEG/WebP), quota coffre appliqué, purge de l'ancien
  blob post-succès, retrait explicite ; 5 colonnes `photo_*` sur
  `advisor_public_profiles` ; fiche + cartes annuaire servies par
  `/conseillers/<id>/photo` (déchiffrement en mémoire au fil de l'eau,
  cache public 1 h) — la photo n'est plus un data URL en base.

## Migrations 0020 → 0022

`0020_saas_billing` : 7 enums + `billing_subscriptions` (UNIQUE tenant),
`billing_invoices`, `product_events`, `backup_runs`, colonnes photo,
RLS complète + REVOKE append-only. `0021` : branche INSERT portail
(1re version erronée `CLAIMED`). `0022` : `app_portal_proof` SECURITY
DEFINER (`search_path` fixé, JAMAIS `row_security=off`) + politique
refaite sur `ACTIVE`.

## Validation

- Unitaires : **199** — catalogue/quotas/factures TPS-TVQ/carte
  simulateur/HMAC Stripe (billing 22), agrégats + funnel + pseudonymes
  (analytics 5), vecteurs SigV4 officiels AWS + inventaire backup
  (documents 28)…
- Intégration RLS 12/12 : souscriptions/factures confinées + UPDATE
  croisé refusé + facture DELETE 42501 + events (staff insère et lit ;
  portail insère par PREUVE mais ne lit rien ; public sans GUC refusé ;
  UPDATE 42501) + backup_runs insert-only.
- E2E 30/30 dont les 6 nouveaux : palier Essentiel (jauges, grille,
  facture PDF 200 application/pdf, upsell) → **montée Pro payée en
  simulateur** (carte 5555 refusée puis 4242 acceptée, 136,82 $
  TPS/TVQ, facture CA-2026-… PDF régénéré) → **analytics débloquées**
  (KPIs, sparkline, entonnoir, MRR 119 $) → **sauvegarde manuelle
  VERIFIED** → **descente Essentiel** sans facture + analytics
  reverrouillées (porte des quotas prouvée dans les DEUX sens) →
  **photo marketplace** servie du coffre (200, image/png, bytes > 5 Ko).

## Finitions détectées à la VALIDATION réelle

| Détecté | Correction |
| --- | --- |
| Rendu facture : `WinAnsi cannot encode "→"` (pdf-lib) | « Période : du … au … » + test de fumée WinAnsi dédié (22e test billing) |
| Sièges 1/1/1 → tout cabinet réel (2 staff) en infraction d'office | Catalogue calibré **1/2/3/5** + tests recalés |
| Champs carte sans `id` → label non relié (a11y) | `id` ajoutés aux 4 `TextField` du checkout |
| Non-idempotence e2e : les enveloppes de tests passés expulsaient le mandat semé hors de l'historique (cap 5) | Reset documenté (purge enveloppes + `seed:demo`) avant suites — consigné aussi au README |

## Déroulé démo (jeu semé)

1. **Abonnement** — `/abonnement` : Essentiel actif, jauges dont
   sièges « 2 / 2 » rouges, grille 0/59/119/199, 2 factures 67,84 $
   TPS/TVQ téléchargeables ; `/analytics` → **upsell** (mesure
   verrouillée) MAIS vue plateforme visible (MRR 59 $).
2. **Montée Pro** — « Passer à Pro » → simulateur : 5555… refusée,
   **4242 4242 4242 4242 · 12/30 · 123** acceptée → facture
   136,82 $ (119 + TPS + TVQ), jauges ∞, sièges 2/3.
3. **Statistiques** — `/analytics` : 30 j d'activité semée (funnel
   31 envoyées / taux de complétion, top événements), ventilation
   « Palier Cabinet », vue plateforme MRR 119 $ + « Pro · 1 ».
4. **Sauvegardes** — `/parametres/sauvegardes` : routage réplica +
   S3 « Prêt à câbler », « Lancer une sauvegarde maintenant » →
   VERIFIED + manifeste sha256 ; CLI `backup:run` pour la planifiée.
5. **Photo** — fiche Marie : photo servie depuis le coffre chiffré
   (route `/conseillers/<id>/photo`).
6. **Retour Essentiel** — « Revenir à Essentiel » : immédiat, sans
   facture ; `/analytics` reverrouillée.

Captures : `docs/screenshots/s08-01…10.png` +
`s08-facture-CA-2026-0002.pdf` (rendu réel, taxes recalculées).
