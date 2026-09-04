# ADR-014 — Analytique produit 100 % first-party : catalogue fermé de 16 événements, sessions pseudonymisées (SHA-256 salé), registre append-only RLS, preuve portail par fonction SECURITY DEFINER, déblocage par palier

- **Statut :** Accepté — Sprint 8 (v0.11.0)
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

La grille tarifaire (ADR-013) fait des « Statistiques de pratique » un
argument des paliers Pro/Cabinet. Il faut donc mesurer l'usage réel —
MAIS sous les contraintes maison : **Loi 25**, hébergement souverain,
aucune fuite vers un tiers (Segment/Mixpanel/GA exclus par principe et
par discours commercial « vos données restent chez nous »), et RLS 3
étages non contournable.

Deux verrous techniques ont forgé le design :

1. **La mesure doit exister même où la lecture est impossible** : les
   événements naissent dans des contextes RLS (staff, portail client,
   public anonyme) qui n'ont AUCUN droit de lecture transversale — un
   `INSERT … RETURNING` ou un `SELECT` de contrôle échouerait.
2. **Le portail client n'a pas de `tenant_users`** : Jean/Sophie ne sont
   pas membres du tenant — leur légitimité d'écrire un événement tient à
   une session vivante OU un `client_portal_links` ACTIF… deux tables
   elles-mêmes invisibles sous RLS tenante simple (les sous-requêtes de
   politique sont elles-mêmes filtrées : `SELECT count = 0`, fiasco
   classique du `NULL ≠ FALSE`).

## Décision 1 — `@coadvisor/analytics` : catalogue fermé, écriture brute, lecture par agrégats

Nouveau paquetage **`@coadvisor/analytics`** (sous-export `./pure` pour
les agrégats testables sans base) :

- `events.ts` — **catalogue fermé de 16 événements** typés
  (`auth.staff_login`, `portal.login`, `client.created`,
  `document.uploaded`, `envelope_sent/resent`, `signer.signed/declined`,
  `report.generated`, `assessment.submitted`, `contact_request.submitted`,
  `marketplace.profile_listed`, `billing.plan_changed`, `invoice_paid`,
  `backup.completed`, `tests.probe`). Pas de `track("string libre")` :
  chaque événement est une union discriminée avec ses props — le
  catalogue EST le contrat de gouvernance (revue Loi 25 en un fichier).
- **Écriture** : `trackEvent` fait un `$executeRaw` d'INSERT brut —
  jamais de RETURNING, jamais de SELECT (droit refusé en contexte
  public/privé, cf. verrou n° 1) ; `trackSafely` = variante
  « au mieux » pour les chemins métier où la mesure ne doit JAMAIS
  faire échouer l'action (pattern retenu depuis S3/S6 : la télémétrie ne
  bloque pas la facture). Les points d'émission sont câblés là où vit
  l'action : logins advisor/client, création client, dépôt coffre,
  pont signdoc (`SIGNDOC_EVENT_MAP` : les événements timeline du moteur
  autonome alimentent l'analytics SANS couplage inverse),
  rapports, annuaire, facturation, sauvegarde.
- **Pseudonymisation** : `pseudonymizeSession` = SHA-256
  `product-events:<session>` salé — non réversible, stable par session
  (comptage des « sessions actives » honnête sans conserver l'ID de
  session exploitable).
- `aggregate.ts` (pur) — `buildDailySeries`, `countActiveSessions`,
  `countActiveActors`, `signatureFunnel` (**dédoublonné par
  `props.envelopeId`** : une enveloppe renvoyée compte une fois aux
  signées/refusées), `topEvents`, `activityByActor`.
- `service.ts` — `getTenantAnalyticsSummary(actor, 30)` sous RLS
  tenante ; `getPlatformOverview` **borné opérateur** (voir Décision 3)
  avec `mrrResolver` INJECTÉ (le MRR est une responsabilité billing —
  analytics ne connaît pas les prix, composition en amont).

## Décision 2 — `product_events` append-only, RLS à deux branches

Migration 0020 + correctifs 0021/0022 :

- `product_events(tenant_id, event, actor_kind, actor_id, session_hash,
  props jsonb, occurred_at, engine_version analytics-1.0)` — **registre
  en écriture seule** : `REVOKE UPDATE, DELETE FROM coadvisor_app`
  (comme `audit_logs` — un registre de mesure ne se retouche pas).
- **RLS SELECT** : staff de SON tenant uniquement (ni portail, ni
  externe, ni public).
- **RLS INSERT à deux branches** : (a) membre staff du tenant ; (b)
  acteur portail dont la preuve est établie par la fonction
  **`public."app_portal_proof"(p_user, p_tenant)` SECURITY DEFINER
  LANGUAGE sql STABLE `SET search_path=public`** — un `EXISTS` sur
  `sessions` ∪ `client_portal_links(status='ACTIVE')`, propriétaire
  superuser (BYPASSRLS effectif : `current_user` devient bien
  `postgres`, vérifié). `GRANT EXECUTE` à `coadvisor_app`, `REVOKE` de
  PUBLIC. Leçon consignée : **jamais** `SET row_security = off` dans le
  corps (sémantique = erreur de droits à l'exécution, PAS un bypass) ;
  le `search_path` seul suffit, et la preuve « session vivante » a dû
  être corrigée de `CLAIMED` (inexistant) vers `ACTIVE` (enum
  `PortalLinkStatus`) — migration 0021 → 0022.
- Piège de test documenté : vérifier ces politiques avec des **UUID
  littéraux** — `(select id from users where email=…)` sous le rôle app
  voit 0 ligne (RLS users) → NULL ≠ succès/échec.

## Décision 3 — Déblocage par palier + vue plateforme opérateur

- `analyticsLevel: aucun | cabinet | equipe` est un attribut du PALIER
  (plans.ts) : Découverte/Essentiel → page `/analytics` = panneau
  d'upsell honnête ; Pro → série, entonnoir, top, KPIs ; Cabinet → +
  ventilation par membre (noms résolus côté page, RLS tenante).
  **Zéro collecte différentielle** : on mesure pareil pour tous — seul
  l'ACCÈS au tableau change (consentement et minimisation préservés).
- Vue plateforme (« équipe fondatrice ») : `operatorTenantSlug()` lit
  `PLATFORM_TENANT_SLUG` (défaut `twodots`, bac à sable `cabinet-demo`)
  + rôle ADMIN exigé — MRR, cabinets actifs, abonnements, distribution
  des paliers, événements 30 j, dernière sauvegarde. Aucune donnée
  client nominative n'y figure : chiffres de pilotage seulement.

## Conséquences

- Conformité Loi 25 argumentable : registre append-only, pseudonymes,
  aucun tiers, finalités bornées par le catalogue ; la page produit
  l'affiche (« aucune donnée chez un tiers ») sans rougir.
- Approximations assumées et DOCUMENTÉES : `actorKind` du pont signdoc
  reflète le CANAL d'émission (staff) plutôt que le signataire final ;
  le taux de complétion exclut les rondes encore ouvertes ; les «
  personnes actives » comptent conseillers + portails distincts par
  `actor_id` (un humain sur deux appareils = 1 personne, 2 sessions).
- Coût nul d'infrastructure : même Postgres, requêtes d'agrégats sur 30
  j glissants (index `(tenant_id, occurred_at)`).
- Chemin de sortie public : si un jour un cabinet veut exporter SES
  événements, le registre tenante l'autorise déjà — l'API d'export est
  un sprint, pas une refonte.
