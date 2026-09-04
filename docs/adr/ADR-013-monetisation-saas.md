# ADR-013 — Monétisation SaaS : catalogue fondateur 0/59/119/199 CAD, quotas vivants en transaction, puits de paiement unique (simulateur ↔ Stripe), factures TPS/TVQ pdf-lib, aucune carte chez CoAdvisor

- **Statut :** Accepté — Sprint 8 (v0.11.0)
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

CoAdvisor est fonctionnellement complet pour un premier cabinet payant
(sprints 1→7c). Le Sprint 8 transforme le produit en **SaaS
commercialisable** : paliers tarifaires, limites d'usage APPLIQUÉES (pas
seulement affichées), paiement, factures conformes au Québec, sièges
additionnels. Les choix fondateurs (verrouillés 2026-08-02) :

1. **Facturation : Stripe réel + simulateur embarqué**, bascule par
   `STRIPE_SECRET_KEY` — aucune clé = simulateur local (aucune vraie
   carte débitée, carte de test 4242 exigée) ; clés présentes = Stripe
   Checkout + webhooks signés. Le parcours produit ne change pas d'une
   ligne entre les deux modes.
2. **Grille tarifaire custom** : **0 $ / 59 $ / 119 $ / 199 $ CAD/mois**
   (4 paliers) + sièges additionnels au palier Cabinet (+29 $/siège).
3. **Taxes** : TPS 5 % + TVQ 9,975 % calculées à la facturation, au
   centime près, niveau ligne doc.
4. **Pas de carte chez nous** : jamais de numéro complet stocké — le
   simulateur n'en retient que `last4` au journal d'audit ; en mode
   Stripe, la carte ne touche jamais nos serveurs (Checkout hébergé).

Lignes rouges héritées : monolithe modulaire (1 feature = 1 module
propriétaire), audit transactionnel, RLS 3 étages, Loi 25, aucune
duplication, aucun `revalidatePath` dans les actions mutantes.

## Décision 1 — `@coadvisor/billing` : propriétaire unique du modèle commercial

Nouveau paquetage **`@coadvisor/billing`** :

- `plans.ts` — **catalogue client-safe** (zéro secret, importable par les
  apps ET les tests) : `BILLING_PLANS`, `PLAN_ORDER`, `planRank`,
  `smallestPlanCovering`, `formatCad`, `formatBytesLimit`. Source unique
  de vérité des prix/limites — l'UI, les quotas, les seeds et les tests
  lisent tous ce fichier.

  | Palier | Prix | Sièges | Clients | Coffre | Enveloppes/mois | Vitrine | Analytics |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | Découverte | 0 $ | 1 | 10 | 1 Go | 5 | — | aucun |
  | Essentiel | 59 $ | 2 | 100 | 10 Go | 50 | incluse | aucun |
  | **Pro** | **119 $** | 3 | ∞ | 100 Go | ∞ | incluse | cabinet |
  | Cabinet | 199 $ | 5 (+29 $/siège) | ∞ | 500 Go | ∞ | incluse | équipe |

  Les sièges Essentiel/Pro ont été calibrés à 2/3 (au lieu de 1/1) au
  test de charge réelle : le cabinet démo compte 2 membres staff —
  un plafond de 1 aurait placé TOUT cabinet réel en contradiction avec
  son palier dès l'inscription d'une adjointe.
- `usage.ts` — compteurs VIVANTS : clients `ACTIVE`, sièges staff
  (`tenant_users` actifs hors rôle CLIENT), coffre (documents `ACTIVE` +
  photos de profil coffre), enveloppes du mois civil (`requested_at`),
  flag vitrine.
- `entitlements.ts` — gardes pures `assert{Client,Vault,Envelope,Seat,
  Marketplace,Analytics}Quota` + `resolveEffectivePlan` (abonnement actif
  → palier ; sinon Découverte) + `planGate` (contexte tx + relecture
  usage). Erreur typée `QuotaExceededError` (`QUOTA_EXCEEDED`,
  `upgradeTo` calculé par `smallestPlanCovering`, message FR prêt pour
  l'UI avec CTA de montée de palier).
- `invoices.ts` — `computeInvoiceAmounts` (TPS/TVQ arrondies au centime
  sur le sous-total), `nextInvoiceNumber` (**CA-YYYY-NNNN**, compteur
  annuel plateforme — numérotation unique exigée d'un émetteur),
  `renderInvoicePdf` (pdf-lib 1 page, taxes **recalculées au rendu** :
  les lignes stockées restent la source, jamais de montant figé dans le
  PDF ; polices WinAnsi — aucun glyphe hors jeu, test de fumée dédié).
- `service.ts` — pipeline d'activation, changement de palier,
  annulation/reprise, sièges additionnels, PDF facture.
- `provider/` — port `PaymentProvider` + adaptateurs (§ Décision 2).

## Décision 2 — Un SEUL pipeline d'activation, deux puits de paiement

Le cœur du design : **`activateSubscriptionTx`** est mutualisé entre le
simulateur (action serveur `completeSimulatedCheckout`) et le webhook
Stripe (`customer.subscription.created`/checkout completed). Dans la
même transaction : upsert `billing_subscriptions` (tenant unique) +
facture `PAID` si `issueInvoice` + sync `tenants.subscription_plan`
(colonne legacy tenue en miroir) + audit `billing.subscription.activated`
+ événements produit `billing.plan_changed` / `invoice_paid`
(`trackSafely` — jamais bloquant).

- **Simulateur** (`provider/simulator.ts`) : « session hébergée » locale
  `/abonnement/checkout?plan=…` ; la carte est validée par
  `validateSimulatedCard` (16 chiffres débutant 4242, MM/AA future, CVC
  3-4) — seul `last4` survit (audit), le numéro complet n'est JAMAIS
  persisté.
- **Stripe** (`provider/stripe.ts`) : REST `fetch` (zéro SDK — surface
  maîtrisée), Checkout Session en mode subscription avec les prices
  `STRIPE_PRICE_{ESSENTIEL,PRO,CABINET,SEAT}`, webhook vérifié **HMAC
  SHA-256 `t.payload` + `timingSafeEqual` + tolérance 300 s**, mapping
  `checkout.session.completed` / `customer.subscription.deleted` /
  `invoice.payment_failed` vers le même pipeline.
- **Sélecteur** (`provider/resolver.ts`) : `STRIPE_SECRET_KEY` non vide
  → Stripe ; sinon simulateur. La page Abonnement affiche le bandeau
  « Mode simulateur » à l'état de routage — zéro ambiguïté pour
  l'utilisateur fondateur.

**Changement de palier** : montée = passage par le puits (preuve de
paiement AVANT activation) ; **descente = effet immédiat, sans facture**
(v1 assumé : pas de prorata ni de crédit — la mensualité s'aligne au
cycle suivant, dit noir sur blanc dans l'UI).

## Décision 3 — Les quotas s'appliquent DANS la transaction métier

Aucun garde-fou cosmétique : chaque point de création appelle sa garde
**dans la même transaction RLS** que l'écriture —

- `crm.createClient` → `assertClientQuota` (le 101e dossier au palier
  Essentiel est refusé avec CTA Pro, compteur relu à l'intérieur de la
  tx) ;
- `documents.uploadDocument` → quota coffre (documents + photos) en
  étape 1, avant tout stockage ;
- `signdoc` → port `envelopeQuota` câblé sur billing (composition,
  signdoc reste autonome — ADR-012) ; `requestedAt` du mois civil ;
- `marketplace.setProfileListing` → vitrine = Essentiel+ ;
- `dashboard.inviteMemberAction` → `assertSeatQuota` avant `inviteUser`.

`resolveEffectivePlan` retombe sur **Découverte** sans abonnement —
tout nouveau cabinet est mesuré dès son premier client.

## Décision 4 — Tables (migration 0020)

`billing_subscriptions` (UNIQUE tenant_id, plan_code, seats_extra,
provider, période courante, `engine_version billing-1.0`),
`billing_invoices` (number unique CA-YYYY-NNNN, lines `jsonb`,
montants + statut), RLS patron `client_links` éprouvé (staff de SON
tenant ; portail/externe exclus), `REVOKE UPDATE/DELETE` sur aucune
(nécessité métier : annulation = `cancel_at_period_end` UPDATE autorisé
au staff admin via politique dédiée — les FACTURES, en revanche, sont
interdites de `DELETE` par REVOKE comme tout registre comptable).

## Conséquences

- Mode démo/fondateur : `pnpm db:seed:demo` sème un abonnement
  **Essentiel actif** + 2 factures historiques — l'upsell analytics est
  visible tel quel, la montée Pro se joue en 30 s avec la carte 4242.
- Mise en production : renseigner `STRIPE_SECRET_KEY` + le secret
  webhook + les price IDs → le checkout redirige vers Stripe sans
  aucun changement de code produit.
- Limites assumées (v1) : pas de prorata, pas d'essai chronométré
  (l'essai = palier Découverte permanent), sièges additionnels offerts
  au seul palier Cabinet, renouvellement mensuel hors périmètre (tâche
  planifiée = sprint ultérieur, le modèle `current_period_end` est prêt).
- Numéros TPS/TVQ « de démonstration » au pied de facture tant que
  l'entreprise n'a pas déclaré les siens (variable dédiée à venir).
