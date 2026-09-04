# ADR-007 — Financial Health Engine : moteur déterministe, snapshots immuables, lien portail par code haché

- **Statut :** Accepté — Sprint 4
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le Sprint 4 livre le différenciateur principal de CoAdvisor (Playbook) :
l'**indice de santé financière (FHI)** — score 0-100 sur 10 catégories,
avec explications (FR-FHE-002) et historique, affiché au conseiller ET au
particulier sur son portail. Le document FHE exige que le score « explique
pourquoi » et que son évolution mène un jour à l'« AI Financial Twin ».

Contraintes héritées : IA assistive seulement à ce stade, audit des
données sensibles, Règle 3 (l'historique financier n'est jamais écrasé),
Loi 25 (consentement explicite horodaté), RLS multi-tenant.

Options écartées :
- *Score calculé par LLM* : non reproductible, non auditable, inacceptable
  pour un chiffre présenté à un client réglementé.
- *Mise à jour en place du score* : détruirait la courbe de progression et
  briserait la Règle 3.
- *Compte portail invité par courriel* : flux plus lourd (envoi d'e-mail
  hors scope Sprint 4) et vecteur de phishing ; le code remis en main
  propre par le conseiller est plus simple et plus sûr.

## Décision

1. **Moteur 100 % déterministe, pur et versionné** (`fhe-1.0`).
   `computeFhi(input)` est une fonction pure : aucune DB, aucune IA,
   `aiGenerated=false` sur chaque insight. Même entrée ⇒ même sortie
   (test de déterminisme en unitaire). Les repères (ex. fonds d'urgence
   3-6 mois, épargne 10 %, couverture vie ~10× revenu, multiple de
   retraite 0,5×→10× entre 25 et 65 ans) sont des **heuristiques
   nord-américaines standard**, versionnées avec le moteur : un changement
   futur de repères = nouvelle `engineVersion`, jamais de réécriture des
   snapshots passés.
2. **Pondération v1 explicite** (somme = 1) : Retraite 15 %, Assurance
   13 %, Budget 12 %, Dette 12 %, Liquidités 10 %, Épargne 10 %,
   Fiscalité 10 %, Investissements 8 %, Objectifs 7 %, Succession 3 %.
   La pondération est affichée au conseiller (pédagogie) et testée
   (somme = 1).
3. **Argent = `Decimal` en base, `Number` dans le moteur.** Le stockage
   reste exact (`Decimal(14,2)`, taux `Decimal(6,3)`) — Règle donnée
   financière. La conversion en `Number` n'a lieu qu'à l'assemblage du
   snapshot d'entrée (agrégats de ratios, précision suffisante).
4. **Snapshots immuables** : chaque calcul crée `health_assessments`
   (+ `health_insights` + `health_progress` avec delta vs le snapshot
   précédent) — jamais d'`UPDATE`. La courbe de progression et l'audit
   (`fhi.calculated`) sont préservés ; l'événement apparaît aussi dans la
   timeline Financial Life OS du dossier.
5. **`Asset.registered: boolean`** : projection concrète du `metadata`
   prescrit (Data Architecture §5) — la fiscalité exigeait de distinguer
   REER/CELI des comptes non enregistrés sans requêtes JSON ad hoc.
6. **Portail = lien par code d'invitation haché** (`client_portal_links`).
   - Code de 8 caractères sur alphabet non ambigu (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`),
     affiché **une seule fois** au conseiller ; seul le haché SHA-256
     (`hashSessionToken`) est persisté.
   - Le particulier revendique le lien avec **consentement explicite
     horodaté** (`consent_at`, audité `portal.claimed`) — Loi 25.
   - Le particulier n'est **pas** membre du tenant (aucune ligne
     `tenant_users`) : `getPortalDashboard` compose read-only après
     vérification du lien `ACTIVE` (`userId ↔ clientId`), puis lecture
     confinée par la RLS du tenant. Révocation par le conseiller
     (`status = REVOKED`, auditée).
   - Anti-énumération : message générique identique pour code invalide,
     consommé ou révoqué.

## Conséquences

- Le FHI est **explicable et défendable** : chaque insight cite la règle
  et le ratio qui l'a déclenchée, avec une piste d'amélioration.
- Toute évolution du moteur produit une nouvelle version ; l'historique
  conserve `engineVersion` par snapshot — reproductibilité garantie.
- Le seed ne peuple que le **profil granulaire** (revenus, dépenses,
  actifs, dettes, assurances, objectifs, retraite, contexte fiscal) : le
  FHI se calcule par le produit (bouton), jamais simulé.
- L'évolution « AI Financial Twin » (Sprint 8+) consommera ces snapshots
  immuables en lecture, sans risque de couplage avec le moteur v1.
- Piège opérationnel documenté : le rôle applicatif ne doit **pas**
  recevoir `GRANT UPDATE/DELETE ON ALL TABLES` **après** les migrations,
  sous peine d'écraser le `REVOKE` d'immutabilité du journal d'audit
  (ADR-004). Ordre garanti : grants du bootstrap → migrations.
