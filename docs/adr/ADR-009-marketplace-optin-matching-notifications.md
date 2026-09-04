# ADR-009 — Marketplace : annuaire opt-in, matching déterministe sans confiance, provider de notifications, requêtes publiques sans jointures

- **Statut :** Accepté — Sprint 6
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le Sprint 6 (Playbook — *Marketplace*) livre la connexion
**prospect-conseiller** (FR-MKT-001) : profils professionnels, recherche
et matching. Décisions d'équipe actées par question dédiée :

1. **visibilité strictement opt-in** : aucun conseiller n'est listé sans
   consentement explicite et **horodaté** (« Visible depuis le… »,
   journalisé à l'audit) ;
2. **deux portes d'entrée** : un **annuaire filtrable** (mot-clé,
   spécialité, région, langue) *et* des **recommandations de matching**
   depuis le portrait financier FNAE ;
3. **prise de contact = lead CRM + notification e-mail** au conseiller ;
4. **profil étendu** : photo, années d'expérience, certifications
   affichées avec la mention « informations déclaratives **non
   vérifiées** par CoAdvisor » (validation AMF laissée au visiteur).

Lignes rouges héritées : aucun conseil financier automatisé, isolation
multitenant RLS partout y compris pour le **public non authentifié**,
Loi 25 (consentement explicite, finalité limitée, aucune revente),
aucune duplication (le moteur FNAE reste la seule source de priorités).

Leçons appliquées des sprints précédents :

- **ADR-006 (addendum)** : Prisma `create` émet `INSERT … RETURNING` et
  la clause `RETURNING` exige que la ligne passe la politique `SELECT`
  de la RLS — refusé (42501) sous contexte public (le public ne
  `SELECT` jamais). Le Sprint 3 avait tranché : identifiants générés
  côté application + `createMany` (sans `RETURNING`). Même piège ici
  pour les demandes de contact et les leads.
- **ADR-008** : le pattern *contrat + providers + résolveur* du Copilot
  s'est avéré (bridge local Codex, secours local, zéro clé dans
  l'app). Les notifications e-mail réutilisent exactement ce pattern.

## Décision

### 1. Modèle opt-in, jamais de publication implicite

`advisor_public_profiles` (1-1 avec `users`, même tenant, RLS
`is_listed = true` pour le public) :

- le formulaire « Mon profil public » sauvegarde un **brouillon**
  privé ; la visibilité est un acte distinct (interrupteur avec
  consentement Loi 25), qui n'est autorisé que si le profil est complet
  et valide ;
- chaque activation/retrait : `listed_at` (ou retrait) + événement
  d'audit `marketplace.profile.listed | unlisted | updated` (métadonnées
  seulement — ADR-004) ;
- spécialités limitées à **6 domaines** miroirs des dimensions FNAE
  (`MarketplaceSpecialty`) — une seule taxonomie, aucune traduction
  parallèle (`dimensionToSpecialty`) ;
- photo : **data URL** (PNG/JPEG ≤ 450 Ko, validée par schéma) — stockage
  fichier/objet renvoyé au Sprint 7 (coffre documentaire) ; le champ est
  déjà isolé pour migration transparente.

### 2. Accès public : contexte RLS dédié, jamais de jointure

`withMarketplacePublicContext(profileId, fn)` (base de données,
`packages/database/src/context.ts`) pose `app.tenant_ctx = 'public'` et
le GUC de preuve `app.marketplace_profile = <profileId>` :

- la politique `advisor_public_profiles_access` n'expose au public que
  `is_listed = true` ; `marketplace_contact_requests_access` autorise
  l'INSERT public **uniquement** si le GUC pointe un profil listé du
  même tenant (`EXISTS` recoupé dans la politique) ; `leads_marketplace_insert`
  exige la même preuve GUC + `source = 'annuaire'` ;
- **pas de requêtes imbriquées publiques** : sous contexte public,
  `tenants` et `users` sont invisibles aux politiques existantes
  (0002), donc `include: { tenant, advisor }` renvoie des relations
  nulles (`PrismaClientUnknownRequestError: Inconsistent query
  result`). Règle : les requêtes publiques ne sélectionnent que les
  colonnes de la table propre ; l'enrichissement se fait ensuite par
  **contexte système avec `select` étroit** (`resolveFirmNames` :
  id → nom du cabinet ; `loadAdvisorRecipient` : courriel + prénom du
  destinataire) — les PII restent côté serveur, jamais exposées.

### 3. Matching déterministe, recalculé sans confiance

`mktmatch-1.0` (`@coadvisor/marketplace`, `match/engine.ts`) :

- les priorités du visiteur viennent **uniquement** d'un recalcul
  serveur depuis `categoryScores` du portrait (`prioritiesFromCategoryScores`,
  3 catégories les plus faibles) — jamais des paramètres d'URL, qui ne
  servent qu'à **retrouver le portrait** (`getAssessmentReport(id,
  readToken)`, anti-énumération par capability token, ADR-006) ;
- poids sur 100, explicites et auditables : priorité n° 1 **+40**, n° 2
  **+25**, n° 3 **+15**, même région **+12**, langue préférée **+8** ;
- **raisons FR avec points** (« Retraite — votre priorité n° 1 (+40) »)
  affichées sur chaque carte — transparence totale, aucune boîte noire ;
- tri déterministe (score ↓, années d'expérience ↓, id ↑), filtre
  `score > 0`, limite 3 par défaut ; `engineVersion` consigné sur la
  demande de contact (rejouabilité).

### 4. Chaîne de contact : preuve → recalcul → écriture → notification

`submitContactRequest` (`contact/service.ts`) sous contexte marketplace :

1. preuve que le profil est `is_listed` (via GUC) — sinon 42501 ;
2. recalcul du score *trustless* si un portrait accompagne la demande ;
3. identifiants générés côté app (`crypto.randomUUID()`) +
   `createMany` pour `marketplace_contact_requests` et le `Lead`
   (`source = 'annuaire'`, `assessment_id` désormais **nullable** —
   migration 0012) ;
4. audit `marketplace.contact.requested` (métadonnées : score,
   engineVersion, présence téléphone/portrait — pas le message) ;
5. notification **best-effort** : échec d'e-mail ≠ échec de demande ;
   audit `notification.email.sent | failed`.

### 5. Notifications : `@coadvisor/notifications` (pattern ADR-008)

- contrat `EmailSender` (`sendEmail(message)`), `NotificationError`
  typée (`not_configured | network | timeout | http | invalid_message |
  invalid_response`) ;
- **`LogEmailProvider`** (défaut, `notify-1.0`) : boîte en mémoire +
  console — zéro dépendance, démo et CI autonomes ;
- **`ResendEmailProvider`** : REST `fetch` (zéro SDK), activable par
  `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `EMAIL_FROM`, délai 10 s ;
- `resolver.ts` : `EMAIL_PROVIDER=auto | log | resend` (auto = Resend si
  clé présente, sinon log) et `getEmailRoutingState()` pour diagnostics.

### 6. Frontière client du design system

Un composant `"use client"` qui importe le paquet depuis son entrypoint
tire le graphe serveur (argon2 → `fs`) dans le bundle webpack. Comme
`@coadvisor/marketplace/labels` : les constantes purement typographiques
(libellés FR des spécialités, langues, type `MyPublicProfile`) sont
exportées via un **sous-chemin public** `./labels` sans aucune
dépendance — `index.ts` ré-exporte depuis `labels.ts` (source unique).

### 7. Tri « NULLS LAST » explicite

`ORDER BY years_experience DESC` place les `NULL` en tête sous
PostgreSQL — un profil sans années déclarées écraserait le palmarès.
Tous les tris publics utilisent `{ sort: "desc", nulls: "last" }`.

## Conséquences

- **Le public ne voit que ce qui est listé**, ne lit jamais un tenant,
  et chaque écriture publique exige une preuve GUC vérifiable en base.
- **Le matching est explicable et rejouable** : même entrée → même
  sortie, raisons affichées, version consignée.
- **La notification est remplaçable à chaud** (démo `log`, prod future
  `resend` ou passerelle interne) sans toucher au module marketplace.
- **La photo en data URL est un compromis borné** (schéma + taille) à
  remplacer par le stockage objet du Sprint 7 — champ isolé, migration
  prévue.
- **Dette assumée** : recherche en mémoire (volume annuaire modeste au
  lancement) ; à remplacer par trigrammes SQL si le nombre de profils
  croît (à réévaluer Sprint 8+).
