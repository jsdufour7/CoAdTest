# ADR-012 — Signdoc autonome (paquetage commercialisable, composition par ports/adaptateurs), signature « dans le document » façon DocuSign pour les 3 canaux, liens inter-clients certifiés, bureau des signatures

- **Statut :** Accepté — Sprint 7c
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le Sprint 7b livrait un système d'enveloppes niveau DocuSign (ADR-011).
Le retour de validation d'équipe du 2026-08-02 (5 correctifs ordonnés +
une orientation produit) a fixé le Sprint 7c :

1. **Refus = ronde terminée, preuve livrée** : même sur refus, le
   document AVEC certificat est téléchargeable ; la pièce ET le
   certificat constatent le refus ; un **« nouvel envoi »** (après
   discussion) évite de tout reconfigurer ;
2. **Look DocuSign** sur la pièce : vignette « Signé par : » +
   nom en **style script choisi** + ID d'apposition (cf. grille
   « Adopt Your Signature » de l'admin DocuSign) ;
3. **Signature DANS le document** : le signataire ouvre la pièce et
   voit **en temps réel** ce qu'il va signer (pas télécharger-puis-
   signer) ; téléchargement après signature ; à la clôture, **toutes
   les parties** téléchargent le document final (certificat à la
   suite) ;
4. **Liens inter-clients certifiés** (conseiller seul les crée —
   ex. couple au CRM) : fiches navigables d'un clic ;
5. **Section Signatures conseiller** : suivi des demandes, signatures
   à faire, circulation, historique ;
6. **Signdoc autonome** : le moteur de signature devient une
   **entité commercialisable/exportable** (API à terme) ; CoAdvisor
   l'utilise **par import** dès maintenant.

Lignes rouges inchangées : monolithe modulaire, audit transactionnel,
jamais d'`UPDATE` de snapshots, RBAC à 3 étages, Loi 25, aucune
duplication, aucun revalidatePath dans les actions de signature (course
RSC apprise en 7b).

## Décision 1 — `@coadvisor/signdoc` : paquetage autonome à ports

Le module signature est **extrait** de `@coadvisor/documents` vers le
paquetage **`@coadvisor/signdoc`** (propriétaire unique de toute la
logique d'enveloppes : création, tours, signature/refus sur 3 canaux,
tampons, certificat, gabarits, relances, balayage d'échéance,
bureau des signatures, nouvel envoi).

Pour rester **importable ET exportable**, Signdoc n'importe **pas** le
coffre CoAdvisor : ses dépendances externes passent par des **ports**
(`ports.ts` — `configureSigndocRuntime`, idempotent) :

| Port | Rôle | Remplissage CoAdvisor (`documents/signdoc-vault.ts`) |
| --- | --- | --- |
| `audit` (requis) | registre transactionnel | `recordAudit` (même transaction) |
| `timeline` | fil de vie client | `addTimelineEntry` |
| `mailer` | avis courriel | notifications outbox |
| `readObject` | relecture pièce du puits | coffre chiffré (déchiffrement) |
| `renderCertificateBlocks` | mise en page PDF du certificat | `renderPdf` du moteur rapports |
| `depositSignedCopy` (requis) | versement de la copie close | ligne coffre + stockage chiffré + **partage portail automatique** (tous les liens ACTIFS du dossier) |
| `externalSignerUrl` | base des liens externes | `MARKETPLACE_URL` |

`relanceAudit`… tout événement sensible est audité **dans le flux** via
le port ; Signdoc ne connaît ni AES-GCM, ni libellés de coffre, ni RLS
CoAdvisor — seulement `@coadvisor/database` (contextes) et
`@coadvisor/auth`/`types`. Le point de composition (`ensureCoAdvisorSigndocRuntime()`)
est câblé à l'import de `@coadvisor/documents` côté serveur
(`typeof window === "undefined"` — un paquetage « librairie » n'a pas
de types DOM).

### Feuille de route « application externe par API »

Toute la surface utile est exportée par `src/index.ts` (services + types
+ schémas zod). Emballer une **API REST + clés d'API** par-dessus est un
sprint d'assemblage sans retouche au cœur : endpoints étroits
(enveloppes POST/GET, vues de signature, flux de pièces en streaming,
webhook « ronde close »), chaque tenant API → `SigndocActor` + ports
fournis par l'hôte. Les **polices (SIL OFL 1.1)** et la licence sont
embarquées dans le paquetage (`assets/fonts/LICENSE-OFL.txt`) — la
distribution hors CoAdvisor est licite telle quelle.

## Décision 2 — Refus : clôture probante + « nouvel envoi »

`settleEnvelope` DECLINED produit désormais la **copie finale** comme
une signature complète : tampon **« Refusé — {nom} »** (rouge, date,
trait diagonal) sur les zones du déclinant, certificat fusionné avec
intro « CLÔTURE SUR REFUS », colonne Décision (Signée/Refusée) et
« Motif déclaré » ; versement dans le coffre (libellé inchangé, design
7b), partage portail, courriel à tous citant la possibilité d'un nouvel
envoi. Le champ `DATE` du déclinant **reste vierge** (aucune date
n'a été signée).

`resendEnvelope(actor, envelopeId)` (états DECLINED/CANCELLED/EXPIRED
uniquement) : **ré-résolution** des signataires (liens portail ACTIFS,
membres toujours en poste, nouveaux jetons externes — les anciens
meurent), re-mapping des zones par `sortOrder`, échéance fraîche
(durée source, défaut 14 j), lien `resentFromId` pour la
généalogie, audit `documents.signature.envelope.resent`, avis courriel.
Garde-fou hérité : refus si une enveloppe vit déjà sur la pièce ou si
la pièce est déjà signée.

## Décision 3 — Adoption façon DocuSign + vue « dans le document »

- **Registre de styles** (`pure.ts`, client-safe) : Classique
  (Helvetica-Oblique), **Sacramento**, **Great Vibes**, **Alex Brush**,
  **Parisienne** — TTF SIL OFL servis par `/fonts/signdoc/[style]`
  (allowlist) et embarqués au tampon via fontkit (Allura, trop dépendante
  de GPOS pour pdf-lib, a été **retirée** au profit de Sacramento après
  preuve visuelle).
- **`signature_style`** est gravé sur la ligne signataire (traçabilité
  du choix, certificat « Mode d'apposition : Nom tapé — style « X » »).
- **Tampon `sigstamp-2.0`** : cadre « Signé par : » + nom script +
  **`signatureStampId`** (12 hex majuscules, sha256
  `signdoc-stamp:enveloppe:signataire` — stable, façon ID DocuSign) ;
  bande date ; paraphes script ; marqueur refus.
- **`SigningViewer`** (UI) : rendu pdf.js des pages (720 px), zones du
  signataire en surbrillance cliquable (aperçu **réel** : nom/paraphes/
  date dans le cadre), zones des cosignataires teintées avec état —
  disponible sur les **3 canaux** (portail `/espace/enveloppe/[signerId]`,
  bureau `/signatures/[signerId]`, externe `/signature/[token]`).
- **`AdoptSignatureDialog`** : nom (+ initiales dérivées pour les
  paraphes), **grille de styles à aperçu vivant**, onglet « Tracée »
  (canvas PNG). Après clôture : **téléchargement** offert à tout
  signataire concerné (la copie close remplace le flux original).

## Décision 4 — Liens inter-clients certifiés (`client_links`)

Table `client_links` (paire ordonnée `a < b`, unicité tenant+a+b,
cascade sur clients, `created_by` RESTRICT) ; types CONJOINT / FAMILLE /
AFFAIRES / PROCURATION / AUTRE + note ≤ 300. **RLS : personnel
uniquement** — politiques select/insert/delete restreintes aux
`tenant_users` ACTIFS non-CLIENT du tenant (+ contexte système) ;
**aucune** exposition portail ni contexte public externe (pin
d'intégration dédié, paire ordonnée prouvée par CHECK). Création et
retrait audités (`crm.client_link.*`). Vue symétrique : la fiche A et
la fiche B affichent le même lien cliquable.

## Décision 5 — Bureau des signatures (`/signatures`)

`listSignatureDesk(actor)` : **À signer par moi** (mes lignes STAFF
PENDING **sur rondes vivantes uniquement** — correctif 7c : une ronde
close laisse ses lignes PENDING en base pour l'historique, elles ne
doivent pas reparaître), **Signatures en circulation**, **Historique**
(50 dernières rondes closes, téléchargement de la copie close et
« Nouvel envoi » intégrés). Entrée de nav « Signatures » (icône
FileSignature) après « Clients » ; le bloc de contre-signature des
pièces renvoie désormais vers ce bureau.

## Conséquences

- **Exportabilité** : Signdoc versionne ses artefacts
  (`signdoc-2.1`, `sigstamp-2.0`) et n'a aucune importation circulaire ;
  l'effort REST est borné aux adaptateurs, pas au domaine.
- **Migration 0019** : `client_links` (+RLS stricte),
  `signature_signers.signature_style`, `document_signatures.resent_from_id`,
  et durcissement `REVOKE UPDATE, DELETE ON audit_logs FROM coadvisor_app`
  (immuabilité du registre, Loi 25).
- **Coût accepté** : le viewer empaquette pdf.js par app (worker
  `public/pdf.worker.min.mjs`) ; les 3 apps transpilent
  `@coadvisor/signdoc` + `pdfjs-dist`.
- **Tests** : 29 unitaires Signdoc (tampon/refus/certificat/styles),
  pin RLS `client_links`, e2e complets (adoption → signature →
  téléchargement sur 3 canaux ; refus → copie constatante → nouvel envoi
  depuis le coffre ET le bureau ; navigation Jean ↔ Sophie).
