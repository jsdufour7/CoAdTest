# Sprint 7b — Signature électronique avancée (niveau DocuSign)

**Décision d'équipe (2026-08-01)** : livré AVANT le Sprint 8 (SaaS).
Objectif : système d'enveloppes multi-signataires complet, comparable à
DocuSign, sur les fondations `signdoc-1.x` du Sprint 7.

## Portée arrêtée

1. **Correctif statut** — le statut de signature est un badge dérivé
   (`En attente` / `Partiellement signée` / `Signée` / `Refusée` /
   `Expirée` / `Annulée`), jamais un suffixe du libellé. La copie
   signée reprend le libellé original (suffixe « — à signer » hérité
   du seed nettoyé).
2. **Enveloppe multi-signataires** — 1 demande = N signataires :
   - **PORTAL_USER** : client et **conjoint** (2 liens portail ACTIVE —
     relaxation ADR-011 : `createPortalInvite` ne révoque plus que les
     invitations non consommées, pas les liens ACTIVE d'autrui ; un
     utilisateur garde toutefois un seul lien ACTIVE — règle inchangée
     côté revendication) ;
   - **STAFF** : contre-signature du conseiller dans l'app conseiller ;
   - **EXTERNAL** : signataire sans compte, lien sécurisé par courriel
     (capability token haché — motif ADR-009/010, GUC
     `app.signature_token`).
3. **Champs positionnés** façon DocuSign : `SignatureField` (page,
   x/y/l/h normalisés), types **SIGNATURE / PARAPHE / DATE**, posés par
   le conseiller sur aperçu PDF (pdfjs) et **estampillés** à leur place
   exacte dans le PDF final (pdf-lib), plus page certificat fusionnée
   **multi-signataires** (nom, rôle, horodatage, IP/UA, consentement).
4. **Workflow** : ordre **séquentiel ou parallèle**, **refus avec
   motif** (consigné + notification au cabinet), **expiration**
   (échéance en jours, règle paresseuse à la lecture), **relances**
   automatiques (balayage au chargement du coffre conseiller, cadence
   72 h) + bouton relance manuelle, **gabarits** de champs
   réutilisables, **signature tracée** (canvas → PNG estampillé) en
   option du nom tapé.

## Données (migration 0017 + RLS 0018, ADR-011)

- `document_signatures` devient l'**enveloppe** : + `signing_mode`,
  `message`, `expires_at`, `last_reminder_at`, `reminder_count`,
  `declined_at` ; statuts ajoutés `PARTIALLY_SIGNED`, `DECLINED`,
  `EXPIRED`. Colonnes signataire héritées migrées vers les lignes
  signataires puis **supprimées**.
- `signature_signers` : kind (`PORTAL_USER|STAFF|EXTERNAL`), userId?,
  email, fullName, sortOrder, tokenHash? (EXTERNAL), statut
  `PENDING|SIGNED|DECLINED`, preuves (nom tapé, consentement,
  horodatage, IP/UA, motif de refus, PNG tracé, initiales).
- `signature_fields` : position normalisée + kind.
- `signature_templates` : gabarits de champs (JSON) réutilisables.
- RLS : la machine à états du signataire migre sur `signature_signers`
  — politiques `portal_sign` (sa ligne, son tour, preuves complètes en
  WITH CHECK) et `external_sign` (jeton haché en GUC, preuves idem) ;
  politiques staff durcies (EXISTS tenant_users USING **et** WITH
  CHECK, motif 0016). Lecture publique de la pièce + champs de
  l'enveloppe limitée au jeton. Aucun accès externe aux autres clients.
- Audit granulaire en transaction : `documents.signature.*`
  (`envelope.requested|signed|declined|expired|cancelled|reminded`).

## Validation

- Unitaires (estampillage, états, schémas) ; intégration RLS (7/7 →
  nouvelle batterie enveloppes) ; e2e (multi-signataires
  portail+conseiller, lien externe signé puis refusé) ; builds 3/3 ;
  lint/typecheck 0 ; captures `s07b-*`.

## Démarrage

```bash
pnpm db:migrate && pnpm db:seed:demo
```

Le seed : compte conjointe `sophie.bouchard@exemple.ca`, 2 liens
portail ACTIVE (couple), enveloppe séquentielle Jean → Sophie → Marie
(contre-signature) sur le mandat, gabarit « Mandat à deux signataires ».
