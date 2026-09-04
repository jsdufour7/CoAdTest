# Sprint 7c — Signdoc autonome, signature « dans le document » façon DocuSign, refus probant + nouvel envoi, liens inter-clients certifiés, bureau des signatures

- **Objectif :** la suite du retour « J'adore ! » de l'équipe — 5
  correctifs ordonnés de signature + une orientation produit : le moteur
  de signature devient une **entité commercialisable autonome**
  (ADR-012), réutilisable par les autres entreprises du fondateur via
  API à terme, tout en restant **importé** par CoAdvisor aujourd'hui.
- **Statut :** ✅ Livré (2026-08-02) — typecheck ✓ (17 projets), lint ✓,
  157 tests unitaires ✓ (dont 29 Signdoc + pin RLS `client_links`),
  intégration RLS 8/8 ✓, build 3/3 ✓, **e2e 24/24 ✓**.

## Commande de l'équipe (ordre suivi)

1. **Refus = ronde terminée avec preuve** — le refus clôt la ronde ;
   la copie (pièce marquée « Refusé — {nom} » + certificat « CLÔTURE SUR
   REFUS » / « Motif déclaré ») est téléchargeable par toutes les
   parties ; **« Nouvel envoi »** en un geste (mêmes signataires et
   zones, jetons externes régénérés) après discussion.
2. **Look DocuSign** — vignette « Signé par : » + **style script au
   choix** (Classique, Sacramento, Great Vibes, Alex Brush, Parisienne —
   SIL OFL, preuve visuelle d'embarquage PDF) + **ID d'apposition** 12
   hex (sha256 déterministe) ; paraphes et dates encadrés aussi.
3. **Signature DANS le document** — la pièce s'affiche **en temps
   réel** (pdf.js), zones cliquables en surbrillance avec aperçu vivant
   (nom, paraphes, date) ; adoption façon « Adopt Your Signature » ;
   téléchargement offert à la fin — et à la clôture le flux « document »
   sert automatiquement la **copie close**.
4. **Liens inter-clients certifiés** — le conseiller (et lui seul)
   certifie les liens (couple, famille, associés, procuration) ; fiches
   navigables d'un clic, des deux côtés ; création/retrait audités ;
   RLS stricte : personnel uniquement, jamais le portail ni l'externe.
5. **Bureau des signatures** (`/signatures`) — « À signer par moi »,
   « Signatures en circulation », « Historique des rondes closes »
   (téléchargement + nouvel envoi intégrés) ; la contre-signature se
   fait **dans le document** comme pour les clients.
6. **Signdoc autonome** — extraction `@coadvisor/signdoc` : zéro
   dépendance coffre, **ports/adaptateurs** (audit, timeline, mailer,
   puits, rendu certificat, versement, URL externes) câblés par
   composition dans `@coadvisor/documents` ; surface complète exportée ;
   polices OFL licites à redistribuer ; feuille de route REST + clés
   d'API documentée dans l'ADR-012.

## Migration 0019

`client_links` (paire ordonnée, CHECK + unicité tenant, RLS personnel),
`signature_signers.signature_style`, `document_signatures.resent_from_id`
(généalogie des envois), `REVOKE UPDATE, DELETE ON audit_logs FROM
coadvisor_app` (registre scellé — Loi 25).

## Corrections de finition (preuve visuelle)

| Détecté (revue PNG) | Correction |
| --- | --- |
| Police **Allura** rendue en glyphes brisés via pdf-lib (GPOS) | Remplacée par **Sacramento** (OFL) — test de rendu comparatif archivé |
| Cadre de vignette `drawSvgPath` invisible (bordure ignorée) | `drawRectangle` systématique — cadre navy garanti |
| Marqueur de refus dupliqué sur les champs DATE | Champs DATE vierges sur refus (aucune date signée) |
| Zones du seed entente décalées d'un cran sous les libellés | Page 3 redessinée à libellés explicites + zones recalées |
| Ronde close fuyait dans « À signer par moi » du bureau | Filtre « ronde vivante » dans `listSignatureDesk` |
| Seed non idempotent après versement de copies closes | Repérage du seed exclut les copies (« enveloppe-*.pdf ») |

## Validation

- Unitaires : 157 (signdoc 29, documents 23, crm, health, ai…).
- Intégration DB (rôle applicatif NOBYPASSRLS) : 8/8 — isolation
  multi-tenant + `client_links` (personnel ok / portail refusé /
  externe refusé / paire ordonnée).
- E2E : 24/24 — adoption → signature → téléchargement sur **3 canaux** ;
  refus → copie constatante → nouvel envoi (coffre ET bureau) ;
  bureau 3 sections + contre-signature en direct ; liens Jean ↔ Sophie
  (navigation croisée, révocation auditée, re-certification).
- Captures : `docs/screenshots/s07c-*.png` + PDF
  (`s07c-entente-signee-complete.pdf` 4 signataires + certificat 2 p.,
  `s07c-copie-constatant-refus.pdf`).

## Déroulé démo (jeu semé)

Coffre de Jean — « Entente de services-conseils » : **Jean** (Sacramento)
→ **Sophie** (Great Vibes) → **Marie** via `/signatures` (Alex Brush) →
**lien externe Me Karine Legal** (Parisienne) → copie 5 pages au coffre,
partagée au couple. Coffre — « Mandat… » : ronde **refusée** par Jean
(copie constatante) + **nouvel envoi** en cours. Fiches **Jean ↔ Sophie** :
lien CONJOINT cliquable. Licences OFL : voir
`packages/signdoc/assets/fonts/LICENSE-OFL.txt`.
