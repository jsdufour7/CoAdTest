# ADR-011 — Enveloppes de signature multi-signataires : 3 canaux (portail/cabinet/externe), champs positionnés, tour gravé en RLS, relaxation des invitations portail pour les couples

- **Statut :** Accepté — Sprint 7b
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le Sprint 7 livrait la signature **unilatérale** (un signataire,
nom tapé, certificat fusionné — ADR-010). Le retour de validation
d'équipe du 2026-08-01 (« tout fonctionne » + retours) a fixé le cap du
7b — un système de signature **niveau DocuSign**, décidé par question
dédiée :

1. **correctif statut** : « à signer » doit être un **badge dérivé** à
   côté de la pièce, jamais incrusté dans son libellé (bug observé :
   « Mandat … — à signer — signé ») ;
2. **plusieurs signataires** (couple + conseiller), avec les **trois
   canaux** : client(s) au portail, contre-signature du cabinet dans
   l'app, et **signataire externe par courriel sans compte** ;
3. **placement des zones de signature sur le document** (comme DocuSign),
   incluant les **paraphes** — un usage quasi obligatoire au Québec ;
4. **système complet** : séquentiel/parallèle, refus motivé, échéance,
   relances automatiques 72 h, gabarits réutilisables, signature tracée
   (canvas).

Lignes rouges héritées : monolithe modulaire (`@coadvisor/documents`
propriétaire), audit transactionnel, jamais d'`UPDATE` de snapshots,
RBAC à 3 étages, Loi 25, aucune duplication.

## Décision 1 — Modèle « enveloppe » : 1 demande = N signataires

`DocumentSignature` devient l'**enveloppe** (mode, mot, échéance,
horodatages d'état, preuve) ; les nouvelles tables possèdent les
parties :

- **`SignatureSigner`** — une ligne par signataire (`kind`, `userId`?
  sessionnel, `email`, `fullName`, `sortOrder`, état + preuves
  horodatées, `tokenHash` pour les externes). Un signataire ne figure
  qu'une fois par enveloppe (clé applicative) ;
- **`SignatureField`** — zone normalisée (page, coin haut-gauche x/y
  fractionnaires, largeur/hauteur) assignée à UN signataire, type
  `SIGNATURE` | `INITIALS` | `DATE` ;
- **`SignatureTemplate`** — gabarit réutilisable (champs JSON +
  nom) par tenant.

La migration 0017 **convertit** les lignes historiques : chaque demande
v1 devient une enveloppe à une ligne signataire (signataire déduit de
`signer_side`/`signer_user_id`, preuves déplacées sur la ligne). Aucune
donnée probante perdue ; le certificat v1 reste rejouable
(`buildSignedPdf` conservé, compatibilité).

## Décision 2 — Trois canaux de signataires, trois surfaces

- **PORTAL_USER** — client et **conjoint** au portail : carte
  « Signatures en attente » (co-signataires, zones prévues, tour
  séquentiel affiché), nom tapé + initiales (dérivées du nom si
  omises) + tracé facultatif, lecture d'abord (`Lire d'abord`).
- **STAFF** — contre-signature dans l'app conseiller : bloc « Votre
  contre-signature est attendue » directement sur la ligne de la pièce,
  avec indication d'attente lorsque le tour séquentiel n'est pas venu.
- **EXTERNAL** — tiers sans compte (notaire, conjoint non client…) :
  **capability token 128 bits haché** (motif ADR-009/010), page publique
  `/signature/[token]` (web-marketplace), flux PDF borné au jeton, états
  terminaux explicites (signé/refusé/fermé).

## Décision 3 — Relaxation des invitations portail (couples)

`createPortalInvite` ne révoque plus que les invitations **non
consommées** (`INVITED`) : inviter la conjointe ne coupe plus le lien
`ACTIVE` du client — deux comptes peuvent désormais être `ACTIVE` sur le
même dossier (un par conjoint). La règle « **un seul** lien `ACTIVE»
demeure ferme à la revendication — avec une exception **idempotente** :
revendiquer un code pour un dossier **déjà lié à ce même compte** est un
succès silencieux (ré-invitation courante d'un client inactif, scripts
démo rejoués), l'invitation excédentaire étant simplement consommée
(audit `portal.claim_redundant`). Revendiquer alors qu'on est lié à un
**autre** dossier reste une erreur.

Conséquence directe : le partage auto de la copie certifiée vise le lien
`ACTIVE` par dossier — le couple entier la reçoit.

## Décision 4 — Zones positionnées, estampillage local, paraphes

- **Placement (web-advisor)** : rendu pdf.js (`pdfjs-dist/legacy`,
  worker « vendor » `public/pdf.worker.min.mjs`) ; dépôt au clic,
  repositionnement au glisser, suppression au ✕ ; préréglages
  déterministes (« bas de page 1 »). Coordonnées normalisées — le
  serveur revalide bornes et rattachements (zod + accord avec le nombre
  de pages à l'estampillage).
- **Estampillage `sigstamp-1.0`** : vignette de signature (cadre teinté
  par signataire, nom italique ou **image tracée**, date-heure),
  **paraphes** (`deriveInitials` — particules ignorées, prénoms composés
  inclus) et dates apposés aux fractions de page définies, en une passe
  pdf-lib si et seulement si l'enveloppe se complète.
- **Chaque signataire exige ≥ 1 zone `SIGNATURE`** (superRefine) :
  comme DocuSign, pas d'enveloppe « orpheline ».
- Le certificat `signdoc-2.0` liste **tous** les signataires (nom tapé,
  canal vérifié, horodatage, IP, agent, consentement, mode d'apposition)
  + table synthèse ; fusion = original estampillé + pages certificat,
  `proofSha256` de l'ensemble consigné sur l'enveloppe.

## Décision 5 — Le tour est gravé dans la RLS, pas seulement dans le service

Deux fonctions **`SECURITY DEFINER`** (`signature_envelope_active(uuid)`,
`signature_turn_open(uuid, integer)`, `row_security=off`,
`search_path=pg_catalog` — sinon leurs sous-requêtes hériteraient la RLS
de l'appelant et un public sans session ne verrait que sa propre ligne) :

- **`signature_signers_portal_sign`** — le membre lié ne modifie que SA
  ligne `PENDING`, dont le tour est ouvert, d'une enveloppe active ;
  le `WITH CHECK` exige le dépôt de preuves complet (SIGNED : nom +
  consentement + horodatage ; DECLINED : motif ≥ 4 + horodatage).
- **`signature_signers_external_sign`** — même garde pour le canal
  externe, borné par `token_hash = current_setting('app.signature_token')`
  posé en GUC par `withSignatureTokenContext`.
- **Lecture externe = sa ligne, son enveloppe, ses champs, sa pièce** —
  aucune PII de co-signataire en base (la *projection* prénom+état se
  fait côté service, en contexte système).
- **Aucune agrégation aux signataires** : les transitions d'enveloppe
  (`PARTIALLY_SIGNED`, `SIGNED`, `DECLINED`, `EXPIRED`, `CANCELLED`) ne
  passent que par le staff (politique 0016 durcie en 0017/0018) ou le
  moteur côté service (`settleEnvelope` en contexte système, transactions
  distinctes — jamais de contextes imbriqués). Aucune politique `DELETE`
  sur les lignes.

## Décision 6 — Cycle de vie complet

- **Séquentiel/parallèle** : avis courriel au(x) signataire(s) du tour
  courant seulement ; à chaque complétion partielle → avis au suivant ;
  blocage de tour refusé aussi en service (`resolvePendingSigner`).
- **Refus motivé** (≥ 10 c. en service, ≥ 4 en base) → enveloppe
  `DECLINED`, courriel au conseiller avec le motif, traçabilité timeline.
- **Échéance** (1–90 j, 30 par défaut) : expiration paresseuse à la
  lecture + balayage (`sweepSignatureEnvelopes`) des relances **72 h**
  (courriels comme DocuSign) ; relance manuelle cadencée à 4 h.
- **Annulation** à tout moment tant que l'enveloppe est active
  (staff, audité).
- **Copie certifiée** : libellé original **nettoyé** (suffixe hérité
  « — à signer » retiré à la dépose ; jamais de « — signé ») — le statut
  est affiché par **badges dérivés** (`En attente`, `Partiellement
  signée`, `Signée`, `Refusée`, `Expirée`, `Annulée`, plus
  « Copie certifiée » via `signedDocumentId`).

## Alternatives écartées

- **Provider externe (DocuSign/Dropbox Sign)** — coût, hébergement des
  preuves hors contrôle canadien, multi-tenant RLS impossible à graver ;
  le cap « interne + certificat » de l'ADR-010 est confirmé et étendu.
- **Un compte portail par dossier (couple = 1 compte partagé)** —
  refusé : traçabilité individuelle obligatoire (qui a signé ?),
  conformité Loi 25.
- **Estampillage côté client (canvas → PDF final navigateur)** —
  refusé : l'original chiffré ne quitte jamais le serveur ; l'image
  tracée est la seule chose qui monte (PNG borné à 400 Ko).
- **`SECURITY DEFINER` sans `search_path` épinglé** — risque d'injection
  de schéma (fix épinglé `pg_catalog` appliqué dès la migration 0018).

## Conséquences

- Les tests RLS (`rls.integration.test.ts`) prouvent : ligne d'autrui
  intouchable, tour forcé, preuves exigées, lecture externe minimale,
  agrégation refusée, gabarits invisibles publiquement.
- `pnpm db:seed:demo` livre le parcours complet : couple (2 liens
  ACTIVE), entente 3 pages avec **paraphes**, enveloppe séquentielle
  Jean → Sophie → Marie → notaire externe, gabarit enregistré, lien
  externe imprimé en console.
- Rétro-compatibilité : demandes v1 converties, certificat rejouable,
  export Loi 25 enrichi (enveloppes + lignes + champs).
