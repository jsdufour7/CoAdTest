# Sprint 7 — Documents & Compliance

> **Objectif Playbook :** coffre, signature, conformité, rapports.
> **Critère de validation :** un conseiller dépose une pièce chiffrée,
> la partage (portail ou lien 7 jours), le client la signe en nom tapé,
> et la preuve complète (audit + certificat) est exportable.
> **Exigences PRD :** FR-DOC-001 (coffre chiffré, partage, signature),
> conformité Loi 25 (export des données, journal inviolable).
> **Statut :** ✅ Livré (0.8.0) — validé unitaire + intégration RLS +
> e2e de bout en bout.

## Tickets

| # | Ticket | Livrable | Statut |
|---|--------|----------|--------|
| S7-T1 | Fondations modèle | Enums `DocumentCategory` (7), `DocumentStatus`, `DocumentShareChannel`, `DocumentSignatureStatus` ; `documents` (SHA-256 du clair, tag GCM séparé, clé relative, retrait logique), `document_shares` (haché unique, échéance, révocation, compteurs), `document_signatures` (côté, signataire résolu, preuves – nom/consentement/IP/UA/haché/copie) — migrations `0014` (diff) + `0015` (12 politiques : isolation tenant, lien public par GUC, machine à états de signature, staff-only en écriture, **aucun DELETE**) | ✅ |
| S7-T2 | RBAC | `documents:read` / `documents:write` : ADMIN + ADVISOR tout, ASSISTANT + COMPLIANCE_OFFICER lecture, CLIENT aucune (son canal = portail/lien public) | ✅ |
| S7-T3 | Stockage objet chiffré | Contrat `ObjectStorage` (pattern ADR-008) + provider `local-encrypted` `docsstore-1.0` : AES-256-GCM **en continu** (IV 12 o en tête, tag en BDD, SHA-256 du clair mesuré au fil de l'upload, écriture atomique `.part`, garde anti-traversal) ; résolution de `DOCUMENTS_STORAGE_DIR` **ancrée à la racine du monorepo** (piège CWD des 3 apps) — réponse équipe **local_enc** | ✅ |
| S7-T4 | Garde-fou upload | `sniffMagic` (512 premiers octets, tampon séparé) : exécutables bloqués (PE/ELF/Mach-O/script) même en `.pdf`, MIME retenu = reniflé, 50 Mo max, messages FR — réponse équipe **50mb** | ✅ |
| S7-T5 | Coffre (vault) | `uploadDocument` (4 étapes + compensation blob), `listClientDocuments` (signatures+partages par pièce), `prepareDocumentDownload` (audit `documents.file.downloaded`), `softDeleteDocument` (retrait logique + purge physique du blob, audit) — onglet **Documents** de la fiche 360 (`/clients/[id]/documents`, drag-drop, accents OK) | ✅ |
| S7-T6 | Partage | Portail (garde lien ACTIVE) + **lien public 7 jours** (jeton 128 bits affiché une fois, SHA-256 persisté, courriel optionnel best-effort, révocation immédiate) ; contexte `withDocumentShareContext(hash)` — SELECT public limité au partage+pièce, **zéro écriture publique** ; page `/partage/[token]` vérifiée (empreinte SHA-256 affichée, état « invalide » unique, cabinet via contexte système à `select` étroit) — réponses **link_client_portal** | ✅ |
| S7-T7 | Signature interne | `requestSignature` (signataire CLIENT résolu au lien ACTIVE + courriel d'avis), `signAsClient` (validation système → copie signée privilégiée → transition sous RLS signataire + partage auto de la copie), `signAsAdvisor` (présentiel), annulation staff ; **machine à états gravée dans la RLS** ; certificat de preuve **fusionné** au PDF (page `signdoc-1.0` : identités, horodatage, IP/UA, consentement verbatim art. 2827 C.c.Q.) — réponses **internal** + **typed_sign** | ✅ |
| S7-T8 | Rapports PDF serveur | Moteur `pdfrender-1.0` (pdf-lib, blocs typés, en-tête marque, pied paginé) ; **Bilan FHI** (exige un calcul FHI, catégories fragile→solide via les constantes du moteur), **Dossier client** (synthèse CRM+finances), **Bilan Copilot** (exige artefact CLIENT_REPORT, Markdown→blocs, avertissement réglementaire) — déposés au coffre (catégorie Rapport) — réponse équipe **three_reports** | ✅ |
| S7-T9 | Conformité | Page `/parametres/conformite` : journal filtrable (action *contient* insensible, entité, période), **export CSV** (RFC 4180 + BOM Excel, 2 000 lignes, audité), **export client Loi 25** (JSON complet `ciaexport-1.0`, permission `compliance:read`, audit + chronologie COMPLIANCE) — réponse équipe **audit_export** | ✅ |
| S7-T10 | Téléchargements en continu | Routes dédiées (`…/telecharger` ×3 apps) : déchiffrement pipé vers la réponse, `X-Content-SHA256`, audits distincts (cabinet/portail/public) | ✅ |
| S7-T11 | Données démo | Script `packages/documents/scripts/seed-demo-documents.ts` (`pnpm db:seed:demo`) **rejouant les vrais flux** : calcul FHI, inscription portail Jean, invitation+claim, dépôt relevé + mandat PDF (généré), demande de signature, partages, bilan FHI — idempotent | ✅ |
| S7-T12 | Durcissement RLS (dette détectée en validation) | Migration `0016` : `WITH CHECK` staff exige l'appartenance ACTIVE (`USING` **et** `WITH CHECK`) — le OU logique des `WITH CHECK` PostgreSQL laissait le signataire annuler sa demande ; `REVOKE UPDATE, DELETE` sur `audit_logs` réaffirmé (robustesse aux GRANT globaux) | ✅ |
| S7-T13 | Configuration documentée | `.env.example` : `DOCUMENTS_STORAGE_DIR`, `DOCUMENTS_MASTER_KEY` (cmd de génération) ; `.gitignore` `var/` | ✅ |

## Décisions appliquées

- **ADR-010** : stockage objet chiffré (pattern providers), signature en
  machine à états RLS avec certificat fusionné, liens par capability,
  rapports serveur, exports audités.
- Réponses d'équipe (session planification Sprint 7) : **local_enc**,
  **internal**, **three_reports**, **audit_export**, **tab_doc**,
  **50mb**, **link_client_portal**, **typed_sign**.
- Leçons consignées :
  - **OU logique des `WITH CHECK`** (PostgreSQL, UPDATE) : toute
    politique permissive nouvelle exige la revue croisée avec les
    politiques sœurs (S7-T12) ;
  - **CWD par app** : tout chemin relatif de plateforme s'ancre au
    `pnpm-workspace.yaml` ;
  - React 19 + `revalidatePath` : l'état d'un composant démonté est
    perdu — les retours d'action doivent être rendus **avant** que la
    donnée serveur ne change (panneaux de partage/signature), et la
    preuve utilisateur prime sur le toast (e2e) ;
  - grille CSS + `min-width:auto` : débordement horizontal d'un
    `<select>` natif hors de sa cellule → clics interceptés par la
    cellule voisine (corrigé `min-w-0`, détecté par e2e).

## Validation

| Niveau | Résultat |
|--------|----------|
| Unitaires (10 packages) | **120 verts** dont documents **23/23** (mime, stockage GCM stream, rendu PDF, certificat) |
| Intégration RLS (RUN_DB_TESTS=1) | **7/7** — incluse la nouvelle batterie documents : cloisonnement coffre, injection cross-tenant, non-staff refusé, DELETE impossible, lien public par capability (bon haché/mauvais/révoqué), machine à états (imposteur/annulation/preuves manquantes/signature complète/non-retouche/cycle staff)— **2 défauts réels trouvés et corrigés** (S7-T12) |
| Typecheck + lint | 16 paquets verts (séquentiels — discipline RAM) |
| Build | web-advisor `TtxeB41KOFPRSNfypov1t`, web-client `acKkfYLuO0kO5D9Hw_nWL`, web-marketplace `q9SduejImn4-_tjkeYXsO` |
| E2E (Playwright, workers=1) | **18/18** dont Sprint 7 : coffre+dépôt+rapport+partage → demande signature ; conformité filtres+CSV vérifié au contenu+JSON client ; portail liaison→partages→signature nom tapé→copie certifiée ; lien public création→déchiffrement vérifié `%PDF`→révocation immédiate |
| Fumée de boucle signature | Demande → signature portail → preuve relue → copie déchiffrée `%PDF-` (script jetable, preuve intégrée aux e2e) |
| Captures | `docs/screenshots/s07-*` ×4 (coffre, conformité, partage public, espace) via `scripts/visual-qa-s07.mjs` |

## Parcours de validation manuelle (démo)

1. `pnpm db:migrate && pnpm db:seed && pnpm db:seed:demo`
2. Conseiller (`demo@coadvisor.ca`) → Clients → Jean Bouchard →
   **Coffre documentaire** : 3+ pièces, badges statut/partage, dépôt
   drag-drop, boutons des 3 rapports.
3. Mandat → panneau Signature : « En attente… » ; panneau Partager →
   lien 7 jours (affiché une fois) → ouvrir en navigation privée :
   page vérifiée + téléchargement.
4. Portail (`jean.bouchard@exemple.ca` / `Demo#2026coadvisor`) →
   **Mon espace** : « Documents partagés avec vous », « Signatures en
   attente » → taper le nom → Signer → la copie « … — signé » apparaît
   partagée (côté conseiller : badge Signé + lien « PDF signé +
   certificat »).
5. **Conformité** (menu Cabinet) : filtrer `documents`, exporter le
   CSV, exporter le JSON de Jean Bouchard (Loi 25).

## Dette / suites

- **Sprint 8 (SaaS)** : sauvegarde/réplication des blobs locaux,
  provider S3 région Canada derrière `getObjectStorage()` (contrat
  prêt), rotation de la clé maîtresse (ré-encryptage paresseux
  envisageable : l'IV est par fichier).
- Photo des profils marketplace : migrer `photo_data` vers le coffre.
- Signature externe (contre-signature notariée, cachet d'entreprise) :
  provider branchable sur `completeSignature` uniquement.
- Nuance d'intégrité connue et assumée : le SHA-256 affiché est celui
  du **clair** — le destinataire d'un lien public peut le revérifier
  sur le fichier téléchargé (c'est le but) ; un atteste différent serait
  requis pour prouver l'antériorité (horodatage qualifié — hors
  périmètre).
