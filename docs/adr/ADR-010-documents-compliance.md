# ADR-010 — Coffre documentaire : stockage objet chiffré local, signature électronique en machine à états RLS, liens publics par capability, rapports PDF serveur

- **Statut :** Accepté — Sprint 7
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le Sprint 7 (Playbook — *Documents & Compliance*) livre le **coffre
documentaire**, la **signature électronique**, les **rapports PDF** et
la **conformité** (audit exportable, export client Loi 25). Décisions
d'équipe actées par question dédiée :

1. **stockage local chiffré maintenant, abstraction prête pour S3** —
   aucun blob hors du serveur tant que l'hébergement canadien n'est
   pas contractualisé ;
2. **signature interne horodatée + certificat de preuve PDF fusionné**
   (pas de provider externe à ce stade) ;
3. **trois rapports PDF** : Bilan FHI, Dossier client, Bilan Copilot ;
4. **page Conformité** : audit filtrable exportable CSV + export
   complet d'un client en 1 clic ;
5. **onglet Documents** dans la fiche 360 + page Conformité dédiée ;
6. **50 Mo maximum**, tout type sauf exécutables (analyse par *magic
   bytes*, pas par extension) ;
7. **partage portail + lien horodaté 7 jours révocable** ;
8. **nom tapé + consentement horodaté** dans un PDF unique.

Lignes rouges héritées : monolithe modulaire (1 feature = 1 module
propriétaire), audit transactionnel des actions sensibles, jamais
d'`UPDATE` sur les snapshots, RBAC à 3 étages (RLS + service + UI),
Loi 25, aucune duplication.

## Décision 1 — Module propriétaire `@coadvisor/documents`

Un seul module possède tout le domaine : `vault/` (dépôt, liste,
téléchargement, retrait logique), `storage/` (contrat + providers),
`sharing/` (portail + liens publics), `signatures/` (demande, dépôt de
preuves, certificat), `reports/` (rendu + gabarits), `export/` (Loi 25).
Les apps ne font qu'orchestrer : routes de téléchargement en continu,
actions de formulaire, pages.

Sous-chemin `./labels` **client-safe** (libellés FR, catégories, texte
de consentement, `formatBytes`) : les composants navigateur n'importent
jamais le barrel serveur.

## Décision 2 — Stockage objet : pattern ADR-008 appliqué aux blobs

Contrat `ObjectStorage` (`put`/`get`/`exists`/`remove`, erreurs typées
`StorageError`) résolu par `getObjectStorage()` — même motif que les
providers LLM (ADR-008) et e-mail (ADR-009). Un seul provider aujourd'hui
(**`local-encrypted`**, version `docsstore-1.0`) ; le futur provider S3
région Canada se branchera au résolveur sans toucher au vault.

### `local-encrypted` — AES-256-GCM en continu

- **IV de 12 octets aléatoires en tête de fichier**, chiffrement
  `createCipheriv` pipé sur le flux d'upload : la RAM ne contient jamais
  le fichier complet (le 50 Mo tient dans un stream) ;
- **tag GCM (16 o) renvoyé au vault et persisté en BDD** (`content_tag`),
  *séparé du blob* : l'intégrité est vérifiée au déchiffrement — un blob
  altéré sur disque fait échouer `readAll` (`StorageError("integrity")`) ;
- **SHA-256 du contenu EN CLAIR** calculé à la volée pendant l'upload :
  c'est l'empreinte publique affichable (page de partage, signature) —
  jamais celle du chiffré, qui changerait à chaque rotation d'IV ;
- **écriture atomique** : fichier `.part` puis renommage ; garde-fou
  anti-traversal sur la clé relative ; clé = `<tenantId>/<uuid>.enc`
  (cloisonnement disque = cloisonnement logique).

### Le piège du CWD — ancrage à la racine du monorepo

`DOCUMENTS_STORAGE_DIR` relatif (`./var/documents` par défaut) est résolu
en remontant depuis `INIT_CWD`/`process.cwd()` jusqu'au
`pnpm-workspace.yaml`. Sans cela, chaque app Next (CWD = `apps/<nom>`)
créait **son propre coffre** : la pièce déposée par le conseiller aurait
été invisible du portail et du lien public. Détecté en revue de code
avant livraison, documenté dans `.env.example`, couvert par les tests de
fumée (3 apps lisent le même blob).

### Clé maîtresse

`DOCUMENTS_MASTER_KEY` = 32 octets base64 (`openssl rand -base64 32`).
Absente/invalide → le coffre affiche une bannière d'avertissement
(`getStorageRoutingState()` alimente le diagnostic) plutôt qu'un
plantage opaque. En dev, une clé est générée au premier `pnpm install`
documenté ; jamais commitée (`.env` ignoré, `.env.example` documente).

## Décision 3 — Garde-fou d'upload : magic bytes, 50 Mo, métadonnées zod

`sniffMagic` lit les 512 premiers octets (tampon séparé du flux via
`splitHeader`) : exécutables et scripts bloqués (PE `MZ`, ELF, Mach-O,
`#!/`), même avec une extension `.pdf`. Le type MIME retenu est celui
**reniflé**, pas celui déclaré. Zod valide libellé (3-120) et catégorie
(7 valeurs). La compensation est explicite : échec BDD après écriture du
blob → purge du blob, et inversement.

## Décision 4 — Signature interne : nom tapé + consentement, machine à états gravée dans la RLS

Fondement juridique : art. 2827 C.c.Q. (la signature s'attache à
l'intention et au lien signataire-document) et Loi concernant le cadre
juridique des TI (LCCJTI) — nomination du conseiller, horodatage,
intégrité vérifiable. La ligne `document_signatures` consigne : nom
tapé, **texte de consentement exact affiché** (`SIGNATURE_CONSENT_TEXT`,
constante unique), horodatage, IP, agent, **SHA-256 du PDF final**,
copie signée.

### Machine à états en base — la leçon du OU logique des WITH CHECK

La transition `REQUESTED → SIGNED` est écrite dans la politique RLS
`document_signatures_portal_sign` : `USING` exige la demande encore
REQUESTED **à son nom** ; `WITH CHECK` exige le dépôt de preuves complet
(statut SIGNED + nom ≥ 2 + consentement + horodatage + haché + copie).

**Écueil détecté par la suite d'intégration (migration 0016)** : pour un
`UPDATE`, PostgreSQL combine les `WITH CHECK` de *toutes* les politiques
permissives par **OU logique**. La politique staff (WITH CHECK limité au
`tenant_id`) « absorbait » silencieusement les tentatives d'annulation
du signataire. Correctif : les politiques `*_staff_update` exigent
l'appartenance ACTIVE (`EXISTS tenant_users`) dans `USING` **et**
`WITH CHECK` — le non-staff ne relève plus que de `portal_sign`. La
suite prouve désormais : autre utilisateur → 0 ligne ; annulation
portail → 42501 ; SIGNED sans preuves → 42501 ; signature complète → 1
ligne ; ligne SIGNED non retouchable par le signataire ; cycle de vie
staff (annulation) préservé.

### Certificat de preuve fusionné (1 seul PDF)

`buildSignedPdf` (pdf-lib, version `signdoc-1.0`) ajoute une page
certificat au document d'origine : identité du document (libellé, id,
SHA-256 original), identité du signataire (nom tapé, date-heure, IP/UA,
canal portail/cabinet), texte de consentement verbatim, nom du cabinet.
WinAnsi suffit pour le français. La copie signée est une **nouvelle
pièce** du coffre (`label — signé`), partagée automatiquement au
portail — l'original reste immuable.

### Délimitation des privilèges

La création de la copie signée est une écriture privilégiée (le
signataire n'est pas staff) : RBAC applicatif complet **avant** (lien
portail ACTIVE + demande à son nom, en contexte système), puis copie en
contexte système, et **seule la transition d'état** passe en contexte
tenant sous l'identité du signataire — c'est elle que la RLS muselle.

## Décision 5 — Liens publics : capability token, GUC dédiée, zéro jointure publique

- jeton URL 128 bits affiché **une seule fois** (`/partage/<token>`,
  web-marketplace) ; seul son SHA-256 est persisté (`token_hash`,
  unique) ; échéance 7 jours, révocation instantanée ;
- contexte RLS `withDocumentShareContext(tokenHash)` (GUC
  `app.document_share`, motif ADR-009) : le public ne `SELECT` que le
  partage actif correspondant et sa pièce — **aucune écriture**
  (compteurs d'accès relevés en contexte système, horodatage du dernier
  accès) ;
- la page publique affiche l'empreinte SHA-256 du contenu
  (vérification d'intégrité offerte au destinataire) et le nom du
  cabinet — résolu en contexte système *après* validation (jamais de
  jointure publique) ;
- téléchargement en continu via routes dédiées
  (`telecharger`/`telechargement`) : déchiffrement serveur pipé vers la
  réponse, en-tête `X-Content-SHA256`, audit `documents.file.downloaded`
  / `documents.share.public_downloaded`.

## Décision 6 — Rapports PDF serveur (`pdfrender-1.0`)

`renderPdf` compose des blocs typés (h2, paragraphe, kv, puces, tableau,
espacement) avec en-tête de marque (#1e38af + logo) et pied paginé.
Gabarits : Bilan FHI (catégories triées fragile→solide, constantes du
moteur — jamais dupliquées), Dossier client (synthèse CRM + finances),
Bilan Copilot (Markdown → blocs, exige un artefact `CLIENT_REPORT`
existant, avertissement réglementaire repris). Le PDF est **déposé au
coffre** (catégorie Rapport) : il hérite de chiffrement, intégrité,
partages et audit — aucun fichier temporaire.

## Décision 7 — Conformité : audit filtrable exportable + export client 1 clic

- `listAuditLogs` étendu (action *contient* insensible, entité, période)
  ; `exportAuditCsv` (RFC 4180, BOM `\ufeff` pour Excel, 2 000 lignes
  bornées) — l'export lui-même est audité
  (`compliance.audit.exported`) ;
- `exportClientData` (version `ciaexport-1.0`, permission
  `compliance:read`) : JSON complet — profil, finances granulaires,
  notes/tâches/chronologie, historique FHI, artefacts Copilot,
  métadonnées du coffre (pas les blobs), partages et signatures ;
  audité + entrée de chronologie COMPLIANCE (traçabilité bilatérale
  Loi 25 : le client *et* le cabinet savent que l'export a eu lieu).

## Conséquences

- Le coffre fonctionne entièrement hors-ligne et hors cloud ; la
  migration vers S3 Canada se limite à un nouveau provider + routage.
- Aucun provider de signature externe à intégrer ; si un jour
  requis (ex. : contre-signature notariée), le contrat
  `document_signatures` reste — seul `completeSignature` changerait.
- La suite d'intégration RLS grandit : chaque nouvelle politique exige
  désormais mentalement la revue du « OU logique » des `WITH CHECK`.
- Coût : les blobs locaux ne sont pas répliqués — la sauvegarde du
  répertoire `var/documents` devient une exigence d'exploitation (Sprint
  8 SaaS).

## Fichiers livrés

- `packages/documents/**` (module complet), migrations `0014`, `0015`,
  `0016` (durcissement), `apps/*/…` (coffre, conformité, espace,
  partage), `packages/documents/scripts/seed-demo-documents.ts` (démo
  par les vrais flux),
  `scripts/visual-qa-s07.mjs`, e2e ×3, docs sprint + captures.
