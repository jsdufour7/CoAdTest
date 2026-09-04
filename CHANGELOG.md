# Changelog

Toutes les évolutions notables de CoAdvisor sont consignées ici.
Format inspiré de *Keep a Changelog*.

## [0.11.0] — Sprint 8 · Commercialisation SaaS (2026-08-02)

> Le produit devient vendable : paliers 0/59/119/199 CAD appliqués
> pour de vrai (quotas en transaction, CTA de montée de gamme),
> paiement simulateur↔Stripe isomorphe, factures TPS/TVQ en PDF,
> analytique 100 % first-party (Loi 25), sauvegarde du coffre
> vérifiable à l'octet, photo marketplace dans le coffre chiffré.
> ADR-013 · ADR-014 · ADR-015 — migrations 0020→0022.

### Ajouté

- **`@coadvisor/billing`** (nouveau paquetage) : catalogue 4 paliers
  (Découverte 0 $, Essentiel 59 $, Pro 119 $ recommandé, Cabinet 199 $
  + 29 $/siège additionnel), `QuotaExceededError` avec CTA calculé,
  compteurs d'usage vivants, facturation TPS 5 % + TVQ 9,975 %
  (numéros CA-YYYY-NNNN, rendu pdf-lib recalculé au centime, préservé
  WinAnsi-safe).
- **Puits de paiement double, un seul pipeline d'activation** :
  simulateur embarqué (checkout local, carte 4242 exigée, seul `last4`
  à l'audit) OU Stripe REST + webhook signé HMAC (`t.payload`,
  `timingSafeEqual`, 300 s) — bascule par `STRIPE_SECRET_KEY`, sans
  changement de parcours ni de code appelant.
- **Quotas en transaction** : création client, dépôt coffre (documents
  + photos), enveloppes du mois civil, siège avant invitation, vitrine
  Essentiel+, analytics par palier — chaque garde relit le compteur
  dans la tx RLS et propose la montée de palier minimale.
- **Page Abonnement** (`/abonnement`) : palier courant, jauges vivantes
  (clients/coffre/enveloppes/sièges), grille 4 paliers, équipe + sièges
  additionnels, factures PDF, annulation/reprise du renouvellement ;
  descente immédiate sans facture, montée avec preuve de paiement.
- **`@coadvisor/analytics`** (nouveau paquetage) : 16 événements
  catalogués émis aux points d'action (logins, CRM, coffre, pont
  signdoc, rapports, annuaire, facturation, backup) ; `product_events`
  append-only (REVOKE UPDATE/DELETE) ; sessions pseudonymisées SHA-256
  salé ; `app_portal_proof` SECURITY DEFINER pour l'INSERT portail.
- **Page Statistiques** (`/analytics`) : KPIs, sparkline SVG maison,
  entonnoir signature dédoublonné par enveloppe, événements fréquents,
  ventilation par membre (Cabinet), upsell honnête sous Pro ; **vue
  plateforme** fondateurs (tenant `PLATFORM_TENANT_SLUG` + ADMIN) :
  MRR, cabinets, abonnements, distribution, dernière sauvegarde.
- **Sauvegarde du coffre** (ADR-015) : client S3 SigV4 maison
  (`ca-central-1`, OVH BHS, MinIO — virtual-hosted/path-style),
  réplica locale atomique (`.part`+rename), manifeste JSON relu et
  **re-haché SHA-256** à l'issue, registre `backup_runs` append-only ;
  bouton opérateur `/parametres/sauvegardes` + CLI
  `pnpm --filter @coadvisor/documents backup:run` (VERIFIED : 170
  blobs, 802 360 o, 201 ms au bac à sable).
- **Photo marketplace dans le coffre** : upload chiffré
  `avatars/<tenant>/…` (≤ 5 Mo, 5 colonnes `photo_*`), purge de
  l'ancien blob, retrait explicite, service public
  `/conseillers/<id>/photo` (déchiffrement en mémoire, cache 1 h) —
  fin du data URL en base.
- Seeds : abonnement Essentiel actif + 2 factures historiques +
  ~165 événements sur 30 j (funnel 62 %/20 %) + photo dégradé
  semée au coffre (encodeur PNG pur zlib+CRC32).

### Corrigé

- Factures pdf-lib : glyphe « → » hors WinAnsi remplacé (« du … au … »)
  — test de fumée de rendu ajouté.
- Grille sièges 1/1/1 incohérente avec tout cabinet 2 membres →
  **1/2/3/5** (Essentiel 2, Pro 3) + tests recalés.
- Checkout simulateur : `id` manquants sur les `TextField` carte
  (labels non reliés — a11y).

## [0.10.0] — Sprint 7c · Signdoc autonome & signature façon DocuSign (2026-08-02)

> Les 5 correctifs de l'équipe après adoption de la 7b, et une
> orientation produit majeure : le moteur de signature devient
> **`@coadvisor/signdoc`**, entité **autonome et commercialisable**
> (ports/adaptateurs — ADR-012), importée par CoAdvisor aujourd'hui,
> exposable par API demain pour les autres entreprises du groupe.

### Ajouté

- **Refus = ronde close avec preuve** : la ronde refusée produit la
  copie finale (tampon rouge « Refusé — {nom} » + trait diagonal sur les
  zones, certificat « CLÔTURE SUR REFUS » avec Décision/Motif déclaré) —
  téléchargeable par **toutes** les parties (`depositSignedCopy` +
  partage portail auto, y compris copies de refus).
- **« Nouvel envoi »** (`resendEnvelope`) : depuis le coffre **ou** le
  bureau, une ronde DECLINED/CANCELLED/EXPIRED repart avec mêmes
  signataires/zones après discussion — signataires ré-résolus, jetons
  externes régénérés, lien `resentFromId`, audit dédié.
- **Adoption façon DocuSign** : grille de styles à aperçu vivant
  (Classique + 4 scripts SIL OFL : Sacramento, Great Vibes, Alex Brush,
  Parisienne), initiales dérivées, onglet « Tracée » ; tampon
  `sigstamp-2.0` « Signé par : » + **ID d'apposition** + bandes
  date/paraphes ; le style choisi est **gravé** (`signature_style`) et
  cité au certificat.
- **Signature dans le document** (3 canaux) : visionneuse pdf.js en
  temps réel — portail `/espace/enveloppe/[signerId]`, bureau
  `/signatures/[signerId]`, externe `/signature/[token]` — avec zones
  cliquables, cosignataires étiquetés, téléchargement de la copie close
  à la fin.
- **Bureau des signatures** (`/signatures`) : « À signer par moi »
  (rondes vivantes), « En circulation », « Historique » (copie close +
  nouvel envoi).
- **Liens inter-clients certifiés** : `client_links` (CONJOINT, FAMILLE,
  AFFAIRES, PROCURATION, AUTRE + note), navigation croisée cliquable
  entre fiches, audit création/retrait, **RLS réservée au personnel**
  (pin d'intégration : portail/externe exclus, paire ordonnée CHECK).

### Modifié

- **Extraction Signdoc** : toute la logique d'enveloppes quitte
  `@coadvisor/documents` pour `@coadvisor/signdoc` (29 tests dédiés) ;
  documents conserve le coffre/partage/rapports + **adaptateur de
  composition** (`signdoc-vault.ts` : puits chiffré, rendu certificat,
  versement + partage auto, audit, timeline, mailer).
- Immuabilité renforcée : `REVOKE UPDATE, DELETE ON audit_logs` pour le
  rôle applicatif (registre scellé).
- Copie close servie par les flux « document »/« télécharger » dès la
  clôture (plus besoin de chercher l'original).

### Corrigé

- Police Allura (glyphes brisés via pdf-lib) → **Sacramento** ; cadre de
  vignette garanti (`drawRectangle`) ; champs DATE vierges sur refus ;
  zones du seed entente recalées sous leurs libellés ; bureau : les
  rondes closes ne réapparaissent plus dans « À signer par moi » ;
  idempotence du seed face aux copies closes.

## [0.9.0] — Sprint 7b · Signature électronique avancée (2026-08-01)

> Suite au retour d'équipe « tout fonctionne, et voici nos idées » :
> système de signature **niveau DocuSign** — enveloppes
> **multi-signataires** (couple, cabinet, externe sans compte),
> **zones positionnées sur le document** (signature, paraphes, dates),
> **séquentiel/parallèle**, **refus motivé**, **échéance**,
> **relances automatiques 72 h**, **gabarits réutilisables** et
> **signature tracée** — avec le tour et les preuves gravés dans la
> **RLS PostgreSQL** (ADR-011).

### Ajouté

- **Enveloppe multi-signataires** (`DocumentSignature` + `SignatureSigner`
  + `SignatureField` + `SignatureTemplate`) : jusqu'à 6 signataires,
  3 canaux — **PORTAL_USER** (couple : 2 liens `ACTIVE` possibles sur le
  même dossier, ADR-011), **STAFF** (contre-signature dans l'app avec
  bloc dédié sur la pièce), **EXTERNAL** (lien sécurisé par courriel,
  capability token haché, page `/signature/[token]` vérifiée).
- **Assistant d'enveloppe** (web-advisor) : composition des signataires
  avec réordonnancement, mode séquentiel (chacun son tour, avis courriel
  au tour courant) ou parallèle, échéance 1–90 j, mot aux signataires,
  gabarit applicable + « enregistrer comme gabarit ».
- **Éditeur de zones pdf.js** : rendu du PDF dans le navigateur, dépôt
  au clic, glisser-repositionner, suppression au ✕, type Signature /
  **Paraphe (usage québécois)** / Date, préréglages déterministes ;
  ≥ 1 zone signature par signataire (comme DocuSign), coordonnées
  normalisées revalidées serveur.
- **Estampillage `sigstamp-1.0`** (pdf-lib) : vignettes teintées par
  signataire (nom italique ou image tracée + date-heure), initiales
  dérivées (particules ignorées, prénoms composés), dates — apposées à
  la complétion seulement, pagination d'origine intacte.
- **Certificat `signdoc-2.0`** multi-signataires : table de synthèse +
  bloc de preuve par signataire (nom tapé, canal vérifié, horodatage,
  IP, agent, consentement, mode d'apposition) fusionné à la copie
  certifiée (empreinte SHA-256 rejouable), **compatibilité v1** pour les
  demandes historiques (migration 0017 de conversion).
- **Tours gravés dans la RLS** : fonctions `SECURITY DEFINER`
  (`signature_turn_open`, `signature_envelope_active` — `search_path`
  épinglé), politiques `portal_sign`/`external_sign` exigeant ligne
  propre + `PENDING` + tour ouvert + **dépôt de preuves complet**
  (SIGNED : nom + consentement + horodatage ; DECLINED : motif + date) ;
  lecture externe bornée au jeton (sa ligne, son enveloppe, ses champs,
  sa pièce) ; **agrégation interdite** aux signataires.
- **Cycle de vie complet** : refus motivé (courriel au conseiller),
  annulation, expiration paresseuse + échéance, **relances 72 h
  automatiques** (balayage au chargement des listes) + relance manuelle
  cadencée 4 h, compteur de relances visible.
- **Signature tracée** : `SignaturePad` (canvas haute résolution) sur
  les trois surfaces ; sans tracé, le nom tapé est apposé en italique.
- **Badges dérivés partout** : `En attente`, `Partiellement signée`,
  `Signée`, `Refusée`, `Expirée`, `Annulée`, plus **« Copie certifiée »**
  (marquage par `signedDocumentId`, pas par libellé) et puces
  individuelles par signataire (canal, état, date, motif).
- **Courriels transactionnels** (Sprint 6) : avis d'enveloppe, avis de
  tour, refus (avec motif), complétion (toutes les parties), relances.

### Corrigé

- **Le statut n'habite plus jamais dans le libellé** : le suffixe
  hérité « — à signer » est nettoyé à la dépose de la copie certifiée
  (et les demandes v1 converties ne l'incrustent plus) — fini
  « Mandat … — à signer — signé ».
- **Ré-invitation portail d'un client déjà lié** : succès idempotent
  (l'invitation excédentaire est consommée, audit
  `portal.claim_redundant`) au lieu d'une erreur « déjà lié » ; inviter
  la conjointe ne révoque plus le lien du client.
- **`web-client`/`web-marketplace` : plus de confirmation perdue** — le
  flash de réussite survit au rafraîchissement RSC (pas de
  `revalidatePath` destructeur après signature/refus).
- **Lint monorepo** : `eslint.config.mjs` ajoutée aux packages
  `notifications` et `marketplace` (scripts présents, config absente) ;
  BOM CSV du journal d'audit en séquence d'échappement.

### Sécurité

- 2 migrations (0017 enveloppes, 0018 RLS signature) — **21+ politiques**
  dont 9 pour les nouvelles tables ; batterie d'intégration RLS étendue
  (ligne d'autrui intouchable, tour forcé même avec jeton, preuves
  exigées par `WITH CHECK`, lecture externe minimale, gabarits invisibles
  publiquement, aucun `DELETE` de ligne, suppression de gabarit staff
  seule).
- Le flux PDF externe passe par `documents_public_signature` (pièce
  `ACTIVE` d'une enveloppe **ouverte** portant CE jeton), accès
  journalisé en contexte système.

## [0.8.0] — Sprint 7 · Documents & Compliance (2026-07-31)

> Critère du sprint atteint : **une pièce déposée chiffrée, partagée
> (portail ou lien public 7 jours révocable), signée en nom tapé avec
> certificat de preuve, et toute la traçabilité (audit filtrable
> exportable, export client Loi 25 en 1 clic).**

### Ajouté

- **Module `@coadvisor/documents`** (propriétaire du domaine, ADR-010) :
  coffre + stockage + partage + signature + rapports + export.
- **Coffre documentaire chiffré** (onglet Documents de la fiche 360,
  `/clients/[id]/documents`) : dépôt drag-drop 50 Mo, **analyse magic
  bytes** (exécutables bloqués même déguisés), 7 catégories, empreinte
  SHA-256 du contenu affichée, retrait logique audité avec purge du blob.
- **Stockage objet `local-encrypted` `docsstore-1.0`** : AES-256-GCM
  **en continu** (IV aléatoire en tête de fichier, tag d'authentification
  séparé en BDD, écriture atomique), contrat `ObjectStorage` prêt pour
  un provider S3 Canada ; chemin relatif **ancré à la racine du
  monorepo** (les 3 apps partagent le même coffre).
- **Partage à deux canaux** : portail particulier (garde du lien
  ACTIVE) et **lien public horodaté 7 jours révocable** — jeton 128 bits
  affiché une seule fois, SHA-256 persisté, page publique vérifiée
  (`/partage/[token]`, web-marketplace) avec empreinte d'intégrité
  affichée, téléchargement en continu, compteurs d'accès relevés en
  contexte privilégié, **zéro écriture publique** (GUC
  `app.document_share`, motif ADR-009).
- **Signature électronique interne** (`signdoc-1.0`) : demande par
  courriel, **nom tapé + consentement horodaté** (texte exact consigné,
  art. 2827 C.c.Q.), **certificat de preuve fusionné** au PDF (identités
  document/signataire, IP/agent, haché final), copie « — signé »
  partagée automatiquement des deux côtés, annulation par le staff —
  **machine à états REQUESTED → SIGNED gravée dans les politiques RLS**.
- **Trois rapports PDF serveur** (moteur `pdfrender-1.0`) déposés au
  coffre : Bilan santé financière (catégories fragile→solide), Dossier
  client — synthèse, Bilan Copilot validé (avertissement réglementaire).
- **Page Conformité** (`/parametres/conformite`) : journal d'audit
  **filtrable** (action contient, entité, période) et **exportable CSV**
  (RFC 4180, BOM Excel, borné, l'export s'auditant lui-même) ;
  **export complet des données d'un client** en JSON 1 clic
  (Loi 25, `ciaexport-1.0`, audité + chronologie COMPLIANCE bilatérale).
- **Démo rejouant les vrais flux** : `pnpm db:seed:demo` (script
  `packages/documents/scripts/seed-demo-documents.ts`, idempotent) —
  compte portail `jean.bouchard@exemple.ca` / `Demo#2026coadvisor`,
  lien activé, relevé + mandat au coffre, demande de signature en
  attente, **parcours démontrable de bout en bout en 5 minutes**.
- Base de données : migrations `0014_documents_compliance` (modèle) et
  `0015_documents_rls` (12 politiques — aucun `DELETE` nulle part).
- Docs : **ADR-010**, `docs/sprints/sprint-07-documents-compliance.md`,
  captures `s07-*` (`scripts/visual-qa-s07.mjs`), 3 scénarios e2e.

### Modifié

- Nav conseiller : entrée **Conformité** (Paramètres) opérationnelle ;
  bouton « Coffre documentaire » sur la fiche 360.
- `listAuditLogs` : filtres étendus (action *contient* insensible,
  entité, bornes de date) partagés par page + export CSV.
- `@coadvisor/documents/labels` : `formatBytes` centralisé (règle
  anti-duplication — page et timeline partagent désormais la même
  source) ; sous-chemin client-safe pour les navigateurs.
- RBAC : `documents:read` / `documents:write` (ADMIN, ADVISOR tout ;
  ASSISTANT, COMPLIANCE_OFFICER lecture ; CLIENT via portail uniquement).
- `.env.example` : bloc Documents (`DOCUMENTS_STORAGE_DIR`,
  `DOCUMENTS_MASTER_KEY`, commande de génération) ; `.gitignore` couvre
  `var/`.

### Corrigé

- **RLS (migration 0016, trouvé par la suite d'intégration)** : le OU
  logique des `WITH CHECK` PostgreSQL permettait au signataire portail
  d'annuler sa propre demande via la politique staff — les politiques
  `*_staff_update` exigent désormais l'appartenance ACTIVE dans `USING`
  **et** `WITH CHECK` ; immuabilité d'`audit_logs` réaffirmée
  (`REVOKE` robuste aux GRANT globaux de reprovisionnement).
- **UI coffre (trouvé par e2e)** : le formulaire de signature
  débordait horizontalement de sa cellule de grille (`<select>` natif ≥
  son min-content) — les clics sur « Demander » étaient interceptés par
  la cellule voisine ; `min-w-0` appliqué aux items flex/grille
  concernés.
- **UI partage/signature (trouvé par e2e)** : les résultats des actions
  (`createLinkShareAction`, `requestSignatureAction`) étaient reçus mais
  jamais rendus (`void state`) — l'URL de lien et la confirmation de
  demande sont maintenant affichées dans le panneau concerné.
- Labels `TextField` associés aux champs fléchés du coffre (a11y).

## [0.7.0] — Sprint 6 · Marketplace (2026-07-31)

> Critère du sprint atteint : **connexion prospect-conseiller** — un
> visiteur trouve un professionnel (annuaire filtrable ou
> recommandations depuis son portrait), le contacte en un formulaire
> consenti, et le conseiller reçoit la demande (lead CRM + e-mail)
> avec adéquation expliquée.

### Ajouté

- **Annuaire public opt-in** (`/conseillers`, web-marketplace) : seuls
  les profils dont la visibilité a été **activée avec consentement
  horodaté** apparaissent ; filtres mot-clé / spécialité / région /
  langue (insensibles aux accents), tri transparent, avertissement AMF.
- **Profils publics déclaratifs** (`/conseillers/[id]`) : photo, années
  d'expérience, régions, langues, spécialités, titre et présentation ;
  certifications affichées avec la mention « informations déclaratives
  **non vérifiées** par CoAdvisor — validez l'inscription auprès de
  l'AMF ».
- **Moteur de matching `mktmatch-1.0`** (`@coadvisor/marketplace`) :
  priorités recalculées côté serveur depuis le portrait FNAE (jamais
  depuis l'URL), poids explicites sur 100 (priorités 40/25/15, région
  12, langue 8), **raisons FR avec points**, tri déterministe — section
  « Conseillers recommandés pour votre profil » sur le portrait.
- **Prise de contact consentie** : formulaire avec consentement Loi 25
  horodaté, écriture sous contexte RLS public dédié (preuve GUC),
  création du **lead** (`source = "annuaire"`) + trace de demande avec
  score/raisons/version du moteur, **notification e-mail best-effort**
  au conseiller.
- **`@coadvisor/notifications`** — contrat de providers (ADR-008
  appliqué à l'e-mail) : `LogEmailProvider` (défaut, zéro dépendance)
  et `ResendEmailProvider` (REST, activable par variables
  d'environnement), erreurs typées, routage `EMAIL_PROVIDER`.
- **Espace conseiller « Mon profil public »**
  (`/parametres/profil-public`) : brouillon privé, interrupteur de
  visibilité avec consentement, statut « Visible depuis le… »,
  prévisualisation de l'annonce ; audit de chaque changement.
- **Leads enrichis** : badge « Annuaire public » et, au détail, carte
  avec score d'adéquation, raisons du matching, message cité et
  coordonnées — aucune PII conseiller exposée côté public.
- **Données démo** : Karim Haddad (ADVISOR) rejoint Marie Tremblay ;
  deux profils listés couvrant les 6 spécialités (recommandations
  toujours non vides).
- Docs : **ADR-009** (opt-in, matching trustless, notifications,
  requêtes publiques sans jointures), `docs/sprints/sprint-06-marketplace.md`,
  captures `s06-*` (`scripts/visual-qa-s06.mjs`).

### Modifié

- `leads.assessment_id` devient **nullable** (migration 0012) : un lead
  peut naître de l'annuaire sans portrait joint.
- RBAC : nouvelles permissions `marketplace:read` /
  `marketplace:write` (ADMIN + ADVISOR écrivent).
- Base de données : GUC `app.marketplace_profile` + politiques RLS
  publiques (0013) — le visiteur anonyme ne lit que les profils listés
  et n'écrit que des demandes de contact prouvées.
- Accueil marketplace : CTA secondaire « Trouver un conseiller ».

### Corrigé

- `TextField` : labels désormais associés (`id` explicite) sur les
  formulaires Sprint 6 — **accessibilité** rétablie (détecté par e2e).
- Tri « années d'expérience » : `NULLS LAST` explicite (PostgreSQL
  plaçait les NULL en tête du palmarès).

## [0.6.0] — Sprint 5 · Advisor Intelligence / Copilot (2026-07-31)

> Critère du sprint atteint : **le conseiller économise du temps** —
> résumé de dossier, préparation de rencontre, suggestions actionnables
> et bilan client générés en un clic, avec provenance et audit.

### Ajouté

- **Copilot conseiller** (`@coadvisor/ai`, module `copilot/`) — 4
  artefacts : résumé de dossier, préparation de rencontre, suggestions
  structurées (titre, justification, catégorie), bilan client.
  Architecture à **contrat de providers** (ADR-008) :
  `CodexBridgeProvider` (API locale compatible OpenAI via
  `LLM_BASE_URL`, clé Bearer, modèle configurable, délai 60 s, sonde
  `/health`) et `LocalComposerProvider` (gabarits FR déterministes),
  avec **secours automatique** documenté (`fellBack` + provenance
  `attemptedProvider`) — jamais d'appel IA depuis le navigateur.
- **Page Copilot** (`/clients/[id]/copilot`) : bandeau IA assistive,
  badge moteur actif (`codex-bridge` / `composer local (secours)`),
  bouton « Tester la passerelle » (sonde `/health`), consigne
  additionnelle par artefact, historique immuable des générations
  (provider, modèle, latence) ; carte « Copilot — résumé du dossier »
  sur la fiche 360°.
- **Bilan client imprimable** (`/clients/[id]/copilot/bilan`) — mise en
  page pour impression/navigateur avec mention réglementaire ; le PDF
  dédié reste au Sprint 7.
- **Actions 1 clic** : la préparation devient une **note de rencontre**
  au journal (contrôle anti-péremption, erreur en ligne) ; une
  suggestion devient une **tâche** du dossier — le conseiller décide,
  l'IA propose (lignes rouges respectées).
- **Passerelle locale** `tools/codex-bridge/server.mjs` (Node ≥ 20,
  zéro dépendance) : `POST /v1/chat/completions` → `codex exec
  --skip-git-repo-check --json`, extraction JSONL
  `item.completed/agent_message`, `GET /health` ; relaie le compte
  ChatGPT Plus local (`codex login`).
- **Persistance** : table `copilot_artifacts` (immuables, Règle 3) —
  migrations `0010`/`0011` (RLS incluse) ; audit
  `ai.copilot.generated` en métadonnées seulement (minimisation Loi 25).
- **Configuration** : `.env.example` documente `COPILOT_PROVIDER`,
  `LLM_BASE_URL`, `LLM_API_KEY` (clé de la passerelle, **pas** une clé
  OpenAI), `LLM_MODEL`, `LLM_TIMEOUT_MS`.
- **Tests** : 19 unitaires `ai` (dont 12 pour le bridge contre une
  fausse API OpenAI `node:http`), probe RLS cross-tenant sur les
  artefacts, scénario e2e Sprint 5 complet (12/12 total suite),
  captures `s05-*.png` (`scripts/visual-qa-s05.mjs`).

### Corrigé

- **Race critique** « Sauvegarder au journal » : après une
  régénération, la soumission d'un artefact périmé (`STALE_ARTIFACT`)
  faisait échouer la page entière ; l'action est désormais un
  formulaire à état (`SavePrepButton`) avec erreur affichée en ligne,
  et le test e2e utilise des ancres d'attente déterministes (avis
  « Artefact généré avec »).

## [0.5.0] — Sprint 4 · Financial Health Engine (2026-07-30)

> Critère du sprint atteint : **le client comprend sa santé financière** —
> score FHI explicable côté conseiller ET côté portail particulier.

### Ajouté

- **`@coadvisor/health-engine`** — Financial Health Engine v1 (`fhe-1.0`) :
  `computeFhi` fonction pure 100 % déterministe (`aiGenerated=false`),
  score 0-100 sur 10 catégories pondérées (Retraite 15 %, Assurance 13 %,
  Budget/Dette 12 %, Liquidités/Épargne/Fiscalité 10 %, Investissements
  8 %, Objectifs 7 %, Succession 3 % — FR-FHE-001) et insights explicables
  typés + sévérité + pistes d'amélioration (FR-FHE-002).
- **Modèle financier granulaire** (Data Architecture §5/§6 — migrations
  `0008`/`0009`, RLS incluse) : `assets` (avec indicateur `registered`
  REER/CELI), `liabilities`, `incomes`, `expenses`, `insurance_policies`,
  `financial_goals`, `retirement_plans`, `financial_contexts`.
- **Snapshots immuables** : `health_assessments` + `health_insights` +
  `health_progress` (jamais d'UPDATE — Règle 3), événement timeline et
  audit `fhi.calculated` à chaque calcul ; toute mutation du profil est
  auditée (`finance.*.added/.removed`, valeurs archivées au journal).
- **web-advisor** : page *Données financières* (`/clients/[id]/finances`,
  8 sections + synthèse) et page *Santé financière*
  (`/clients/[id]/sante` : jauge SVG, barres pondérées, insights groupés,
  historique des variations, panneau portail) + badge FHI et liens sur la
  fiche 360°.
- **Portail particulier (web-client)** : inscription libre (`/inscription`
  — `signupIndividual` core-platform, compte sans tenant), liaison au
  dossier par **code d'invitation haché** (`/lier`, consentement Loi 25
  obligatoire et horodaté, code affiché une seule fois côté conseiller),
  tableau de bord FHI en lecture seule (`/espace` : jauge, 10 aspects,
  explications vulgarisées, objectifs, progression).
- **Seed démo** : profil financier complet de Jean Bouchard (revenus,
  dépenses dont épargne REER/CELI, actifs, hypothèque, assurances,
  objectifs, plan retraite, contexte fiscal) — le FHI se calcule via le
  produit pour rester un snapshot authentique du moteur.
- **Tests** : 11 unitaires moteur (déterminisme, pondération, signaux) ;
  intégration RLS des 12 tables FHE ; 3 e2e supplémentaires (parcours
  conseiller FHI, boucle portail complète, état vide portail) — suite
  totale 11/11 ; serveur web-client ajouté à la config Playwright.
- **ADR-007** (moteur déterministe, Decimal/Number, lien portail par code
  haché) et doc `docs/sprints/sprint-04-fhe.md` + captures d'écran.

### Corrigé

- ESLint base : la convention `_prefixe` (paramètres de server actions
  React 19 intentionnellement inutilisés) ne déclenche plus
  `@typescript-eslint/no-unused-vars`.
- README/architecture : structure monorepo à jour (health-engine), nouveau
  parcours de validation Sprint 4.

## [0.4.1] — Correctif RLS insertion publique (2026-07-30)

### Corrigé

- **Soumission du questionnaire en échec (42501 RLS)** : Prisma `create`
  émet `INSERT … RETURNING`, et le RETURNING exige que la ligne passe
  aussi la politique SELECT — impossible sans connaître le token avant
  l'insertion. Le capability token est désormais généré par l'application
  et présenté via le GUC avant l'insert (`submitAssessment`).
- **Détection « déjà contacté » sur la page portrait** : l'`include`
  Prisma sur les leads était silencieusement filtré à vide par la RLS en
  contexte public — remplacé par un comptage système (`hasLead`), sans
  exposition de PII.
- **Politiques FNAE clarifiées** (migration `0007`) : éclatées par
  commande (`FOR SELECT` / `FOR INSERT` / gestion `FOR ALL` système),
  branche « dépôt public de lead » inutilisable retirée (piège RETURNING
  + dépôt déjà couvert par le contexte système applicatif). ADR-006
  amendé avec la règle durable.

### Validé (environnement de test réel)

- Suite d'intégration RLS exécutée sur PostgreSQL : **4/4** ✓
  (isolation tenant multitable, capability token, anti-énumération,
  PII jamais publique, INSERT sans token rejeté).
- Suite e2e Playwright complète contre la base réelle : **8/8** ✓
  (Sprints 1, 2, 3 — dont questionnaire → portrait → lead consenti).

## [0.4.0] — Sprint 3 · Financial Needs Assessment Engine (2026-07-30)

### Ajouté

- **Module `@coadvisor/fnae`** : questionnaire public, moteur de calcul
  déterministe `fnae-1.0` (6 dimensions — fonds d'urgence, dettes,
  épargne, retraite, protection, objectifs — score /100, insights
  forces/risques/opportunités, 3 priorités d'action), génération de leads.
- **Questionnaire public** multi-étapes (5 étapes, ~3 minutes) sur
  web-marketplace `/analyse` — anonyme, validation par étape, aucune
  coordonnée avant le résultat (minimisation Loi 25).
- **Page Portrait financier** (`/portrait/[id]?k=token`) : score, 6
  dimensions avec barres, ratios clés, priorités, observations — `noindex`,
  accessible uniquement par capability token (ADR-006).
- **Capture de lead consentie** : consentement explicite horodaté
  (`consent_at`), déduplication par analyse, attribution optionnelle au
  cabinet référent via `?cabinet=slug` (résolu côté serveur).
- **Boîte de réception conseiller** `/leads` : liste avec filtre par
  statut, fiche détaillée avec portrait financier complet et situation
  déclarée, transitions (pris en charge / écarté) auditées.
- **Conversion lead → client CRM en 1 clic** : dossier pré-rempli (audit
  + timeline CRM) et traçabilité de conversion — composition orchestrée
  par l'app, modules découplés.
- **Sécurité (ADR-006)** : entités à portée plateforme sous RLS — 3e
  contexte DB `withPublicContext`, `read_token` non devinable, PII des
  leads jamais lisible publiquement, leads `tenant_id` NULLABLE (NULL =
  boîte plateforme, matching futur), défaut = refus.
- **RBAC** : permissions `leads:read` / `leads:write` (matrice 5 rôles).
- **Tableau de bord** : KPI « Leads entrants » + item de nav « Leads » ;
  CTA « Faire mon analyse gratuite » activé sur la page publique.
- **Tests** : 17 tests unitaires FNAE (moteur + questionnaire), cas RLS
  plateforme (token, anti-énumération, cross-tenant), e2e Playwright du
  parcours d'acquisition complet.

## [0.3.0] — Sprint 2 · CRM Financial Foundation (2026-07-30)

### Ajouté

- **Module `@coadvisor/crm`** (frontière dédiée, index public) : clients,
  familles, timeline Financial Life OS, notes, tâches — pattern acteur
  (`CrmActor`), RBAC `requirePermission`, contexte RLS et audit
  transactionnel systématiques.
- **Schéma CRM** : modèles `Client`, `FamilyMember`, `TimelineEvent`,
  `Note`, `Task` (8 enums) — migrations `0003_crm_foundation` (DDL) et
  `0004_crm_rls` (RLS + FORCE sur les 5 tables, défaut refus).
- **Fiche client 360°** (FR-CRM-001/002) : en-tête dossier, journal de
  notes auditées (MEETING → timeline), tâches avec bascule À faire ↔
  Complétée, entourage financier, chronologie préservée (jamais supprimée).
- **Liste clients** : recherche (nom, courriel) + filtre statut via GET,
  compteurs tâches/notes, états vides soignés.
- **Navigation partagée** `ADVISOR_NAV` (item « Clients » actif) et KPI
  « Clients suivis » branché sur la donnée réelle au tableau de bord.
- **Sécurité** : middleware étendu aux routes `/clients/*` ; test
  d'intégration RLS prouvant le cloisonnement cross-tenant des clients et
  de toutes les tables liées (notes, tâches, famille, timeline).
- **Seed démo enrichi** : dossier Jean Bouchard (conjointe Sophie, 2
  événements timeline, note de rencontre, tâche prioritaire) — seed
  toujours idempotent.
- **Tests** : 9 tests unitaires des schémas zod CRM ; scénarios e2e
  « gérer un dossier client » (création → note → tâche → famille → liste)
  et « recherche ».

## [0.2.1] — Logo officiel & correctifs (2026-07-30)

### Modifié

- **Logo officiel intégré** : le composant `Logo` rend désormais les
  actifs PNG officiels (lockup complet, marque seule, icône d'app ;
  variantes clair/inversé) — le logo « deux points » maison est retiré.
  Favicons des 3 apps alignés sur l'icône officielle.

### Corrigé

- **Seed idempotent** : plus d'erreur P2002 à la ré-exécution — chaque
  élément (tenant, utilisateur, appartenance) n'est créé que s'il manque,
  audit consigné uniquement lors d'une création réelle.

## [0.2.0] — Sprint 1.5 · Design System & UX (2026-07-30)

### Ajouté

- **Direction artistique « Confiance calme »** : tokens v2 (palette
  `accent` émeraude, ombres FinTech, motion, utilitaire pattern
  `bg-dots`), typographie Inter auto-hébergée, respect
  `prefers-reduced-motion`, préparation mode sombre.
- **Marque** : composant `Logo` (deux points reliés — TwoDots.ca),
  variantes couleur/inversée.
- **Composants `@coadvisor/ui` v2** : `Button` (tailles, loading),
  `TextField` (icônes, erreurs aria, hints), `Alert` (4 variantes),
  `Badge`, `Avatar`, `EmptyState`, `Skeleton`, `Spinner`, `Card`
  interactive — icônes `lucide-react` (ADR-005).
- **`AppShell`** : sidebar complète (sections, badges de sprints,
  carte cabinet, bloc utilisateur, déconnexion), topbar collante,
  responsive mobile.
- **`AuthLayout`** : split-screen avec panneau de marque par app.
- **web-advisor** : tableau de bord refondu (KPI, table équipe avec
  avatars/badges, invitation, journal d'audit enrichi).
- **web-marketplace** : page publique complète (héros, chips de
  confiance Loi 25 / Canada / IA assistive, 3 cartes de valeur,
  pied de page).
- **web-client** : en-tête de marque, accueil personnalisé, état vide
  FHI soigné.

## [0.1.1] — Correctifs DX environnement (2026-07-30)

### Corrigé

- Chargement d'environnement monorepo : les 3 apps Next.js chargent
  désormais le **`.env` racine** dans `next.config.ts` (`dotenv`,
  `override: false`) — supprime les erreurs « DATABASE_URL invalid »
  et « env not found » au runtime (Next ne lit pas le `.env` racine par défaut).
- Scripts `generate` / `migrate` / `migrate:dev` / `seed` : chargement du
  `.env` racine via `dotenv-cli` — plus besoin d'un `.env` dupliqué dans
  `packages/database/`.
- README : section **Dépannage** (pnpm/Corepack, ports, faux positif
  `docker exec psql`, redémarrage serveur dev, Windows).

## [0.1.0] — Sprint 1 · Core Platform Foundation (2026-07-29)

### Ajouté

- Monorepo Turborepo + pnpm (3 apps Next.js 15, 7 packages, TypeScript strict).
- PostgreSQL 16 : schéma Core (Tenant, User, TenantUser, Session, AuditLog),
  migrations `0001_init` + `0002_rls_multitenancy` (RLS + FORCE, défaut refus).
- Rôle applicatif `NOBYPASSRLS` distinct du rôle de migrations.
- Auth auto-hébergée derrière abstraction `AuthProvider` : Argon2id,
  sessions hachées en base, cookie HttpOnly/SameSite=Lax, MFA-ready.
- RBAC : 5 rôles, matrice `ROLE_PERMISSIONS`, guards service + tests.
- Audit transactionnel immuable (`recordAudit`, `REVOKE UPDATE/DELETE`).
- Parcours « créer mon espace » (bootstrap atomique cabinet + admin + audit),
  connexion, invitation de membres, journal d'audit consultable.
- Design system partagé (tokens + composants), LLM Gateway (mock, région CA).
- CI GitHub Actions : migrations, tests (incl. RLS), typecheck, lint, build.
- ADR-001 à ADR-004, plan de sprint, tests unitaires + intégration + e2e.
