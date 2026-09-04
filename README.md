# CoAdvisor

**Financial Intelligence Operating System** — écosystème TwoDots.ca.

> Le copilote financier intelligent qui accompagne les individus dans leurs
> décisions financières et aide les professionnels à mieux conseiller.

Dépôt monorepo (Turborepo + pnpm). Décisions structurantes :
[ADR-001](docs/adr/ADR-001-monorepo-modular-monolith.md) ·
[ADR-002](docs/adr/ADR-002-authentification-auto-hebergee.md) ·
[ADR-003](docs/adr/ADR-003-isolation-multitenant-rls.md) ·
[ADR-004](docs/adr/ADR-004-audit-transactionnel-immuable.md) ·
[Vue d'ensemble](docs/architecture.md)

---

## Structure

```
apps/
  web-advisor/        # Conseillers & cabinets        → :3000
  web-client/         # Particuliers                  → :3001
  web-marketplace/    # Site public + espace pro      → :3002
packages/
  database/    Prisma · PostgreSQL 16 · RLS multi-tenant · audit immuable
  auth/        AuthProvider (auto-hébergé : sessions + Argon2id) · RBAC
  core-platform/  Tenants · Users · Rôles · Audit
  crm/         Clients · Familles · Timeline (Financial Life OS) · Notes · Tâches
  fnae/        Analyse publique · portrait financier (moteur fnae-1.0) · leads
  health-engine/  Financial Health Index (moteur fhe-1.0) · profil granulaire · portail
  ai/          Copilot conseiller (providers : codex-bridge + secours local) · LLM Gateway
  marketplace/ Annuaire opt-in · matching mktmatch-1.0 · contact prospect-conseiller
  notifications/  Courriel transactionnel (providers : log + resend — contrat notify-1.0)
  documents/   Coffre chiffré (AES-256-GCM) · partage (portail + lien 7 j) · rapports · export Loi 25 · sauvegarde vérifiable (réplica + S3 SigV4, ADR-015) · adaptateur de composition Signdoc
  signdoc/     Moteur de signature AUTONOME (ADR-012) : enveloppes multi-signataires · adoption façon DocuSign · vue « dans le document » · refus probant + nouvel envoi · bureau des signatures (exportable par API)
  billing/     Paliers 0/59/119/199 CAD · quotas en transaction · paiement simulateur↔Stripe (même pipeline) · factures TPS/TVQ pdf-lib (ADR-013)
  analytics/   Mesure first-party (ADR-014) : 16 événements catalogués · sessions pseudonymisées · registre append-only · agrégats 30 j
  ui/          Design system (tokens + composants + logo officiel + visionneuse de signature pdf.js)
  types/       Contrats partagés · erreurs de domaine
  config/      tsconfig · ESLint partagés
docs/          ADR · architecture · sprints
e2e/           Tests Playwright (critères de succès Sprints 1 à 8)
tools/codex-bridge/  Passerelle locale (compatible OpenAI → Codex CLI / ChatGPT Plus)
```

> **Règle d'import (Playbook Règle 1)** : une fonctionnalité = un module
> propriétaire ; consommation via l'`index.ts` public du package uniquement.

## Démarrage rapide

Prérequis : **Node ≥ 20**, **pnpm 9** (`npm install -g pnpm@9`), **Docker**.

```bash
# 1. Dépendances (génère aussi le client Prisma via postinstall)
pnpm install

# 2. Environnement — UN SEUL fichier, à la racine (source unique de vérité :
#    chargé automatiquement par les 3 apps ET par les scripts Prisma)
cp .env.example .env          # Windows : copy .env.example .env

# 3. PostgreSQL 16 (+ pgvector, rôle applicatif NOBYPASSRLS)
pnpm db:up                    # Docker doit tourner (docker ps)

# 4. Migrations (schéma + RLS)
pnpm db:migrate

# 5. Données démo (cabinet + admin)
pnpm db:seed
#    demo@coadvisor.ca / Demo#2026coadvisor   (DEV uniquement)

# 5b. Démo Sprint 7/7b (coffre + couple portail + enveloppe multi-signataires)
#     Prérequis : DOCUMENTS_MASTER_KEY dans .env (openssl rand -base64 32)
pnpm db:seed:demo
#    jean.bouchard@exemple.ca / Demo#2026coadvisor    (portail :3001)
#    sophie.bouchard@exemple.ca / Demo#2026coadvisor  (conjointe, :3001)
#    + lien de signature EXTERNE imprimé en console (notaire démo)

# 6. Lancer les apps (chacune son port) — terminaux séparés :
pnpm dev:advisor        # http://localhost:3000
pnpm dev:client         # http://localhost:3001
pnpm dev:marketplace    # http://localhost:3002
```

**Parcours de validation Sprint 1** : sur `:3000`, « Créer mon espace » →
formulaire cabinet → tableau de bord (membres, invitation, audit).

**Parcours de validation Sprint 2** (compte démo après `pnpm db:seed`) :
connexion → « Clients » → dossier **Jean Bouchard** pré-rempli (famille,
timeline, note, tâche) → « Nouveau client » → fiche 360 : ajouter une note
de rencontre, une tâche, un membre de l'entourage.

**Parcours de validation Sprint 3** (acquisition publique) : sur `:3002`,
« Faire mon analyse gratuite » → questionnaire 5 étapes → **portrait
financier** (score /100, dimensions, priorités) → laisser ses coordonnées
avec consentement → côté `:3000`, ouvrir « Leads » : le lead apparaît
(si le questionnaire est lancé avec `?cabinet=cabinet-demo`) → fiche
portrait → « Convertir en client ».

**Parcours de validation Sprint 4** (Financial Health Engine — compte
démo) : sur `:3000`, dossier **Jean Bouchard** → « Données financières »
(profil granulaire seedé : revenus, dépenses, actifs, dettes, assurances,
objectifs, retraite, fiscalité — ajoutez/retirez des lignes) → « Santé
financière » → « **Calculer l'indice FHI** » : jauge /100, 10 catégories
pondérées, explications (points forts, risques, opportunités avec pistes),
historique ; recalculez pour voir la variation préservée. Puis « Générer
un code d'invitation » → sur `:3001`, « Créer mon compte » → saisir le
code + **consentement coché** → le client voit **sa** santé financière,
expliquée simplement (jauge, 10 aspects, progression).

**Parcours de validation Sprint 5** (Advisor Intelligence — compte démo) :
sur `:3000`, dossier **Jean Bouchard** → « **Copilot** » (ou la carte en
haut de la fiche 360°) → « Tester la passerelle » (diagnostic
`/health`) → **Générer** : le résumé, la préparation de rencontre
(→ « Sauvegarder au journal »), les suggestions (→ « Créer une tâche »)
et le bilan client (→ « Ouvrir la version imprimable » — imprimable en
PDF via le navigateur). Le badge indique le moteur actif :
`codex-bridge` ou `composer local (secours)`.
**Activer le vrai LLM (optionnel, poste local uniquement)** :
`codex login` (Codex CLI installé, compte ChatGPT Plus), puis
`node tools/codex-bridge/server.mjs`, puis dans `.env` :
`COPILOT_PROVIDER=codex-bridge`, `LLM_BASE_URL=http://127.0.0.1:8787/v1`,
`LLM_API_KEY=coadvisor-demo-secret` et redémarrer `pnpm dev:advisor`.
Sans la passerelle, le secours local déterministe répond
automatiquement — aucune clé OpenAI requise, aucun appel IA depuis le
navigateur (détail : [ADR-008](docs/adr/ADR-008-copilot-codex-bridge-providers.md)).

**Parcours de validation Sprint 6** (Marketplace — *connexion
prospect-conseiller*) : sur `:3002`, « **Trouver un conseiller** » →
annuaire des profils **listés volontairement** (Marie, Karim) → filtrez
par spécialité/région/langue → ouvrez un profil (avertissement «
déclaratif non vérifié — AMF ») → **envoyez une demande** avec
consentement coché → confirmation. Côté `:3000` → « **Leads** » : la
demande apparaît avec le badge « Annuaire public » → détail : carte avec
**adéquation /100**, raisons du matching et message. Autre porte : sur
`:3002`, « Faire mon analyse gratuite » → portrait → section «
Conseillers recommandés pour votre profil » (raisons expliquées avec
points). L'e-mail de notification au conseiller est visible dans la
console du serveur (provider `log` par défaut ; configurez
`EMAIL_PROVIDER=resend` + `RESEND_API_KEY` pour le réel). Côté
conseiller : « Cabinet → Profil public » pour éditer la vitrine et
**retirer/réactiver la visibilité** (consentement horodaté, audité).

**Parcours de validation Sprint 7** (Documents & Compliance — après
`pnpm db:seed:demo`) : sur `:3000` → « Clients » → Jean Bouchard →
« **Coffre documentaire** » : les pièces démo sont listées (relevé,
mandat, entente, bilan FHI) avec badges de statut ; **déposez** un
fichier (drag-drop ou parcourir, 50 Mo) — succès avec empreinte SHA-256 ;
**générez** un « Dossier client — synthèse (PDF) ». Sur une pièce :
panneau « Partager » → « **Créer un lien public (7 jours)** » → l'URL
n'apparaît qu'**une fois** — ouvrez-la en navigation privée : page
publique **vérifiée** (empreinte, échéance 7 j) → téléchargez le PDF
déchiffré. Sur `:3001`, connectez `jean.bouchard@exemple.ca` → «
**Mon espace** » : « Documents partagés avec vous » (ouvrez le relevé —
texte lisible, déchiffré serveur). Enfin : menu Cabinet → «
**Conformité** » → filtrez `documents`, **exportez le CSV** du journal
et le **JSON Loi 25** de Jean Bouchard (le JSON référence pièces,
partages et enveloppes de signature).

**Parcours de validation Sprint 7c** (Signdoc — le seed crée :
l'enveloppe séquentielle **Jean → Sophie → Marie → Me Karine Legal**
sur une entente de 3 pages avec **paraphes** et imprime le **lien
externe** ; un mandat **refusé** par Jean + son **« nouvel envoi »** ;
le lien certifié **CONJOINT Jean ↔ Sophie**) :

1. **Portail (`:3001`, Jean)** — « Signatures en attente » → **« Ouvrir
   et signer »** : la pièce s'affiche **en temps réel** (pdf.js) ;
   cliquez une zone en surbrillance → boîte **« Adoptez votre
   signature »** (5 styles script à aperçu vivant, initiales pour les
   paraphes, onglet « Tracée ») → l'aperçu apparaît **sur le document
   tel qu'il sera estampillé** → « Signer le document » → téléchargez ;
   c'est ensuite au tour de **Sophie** (Great Vibes…).
2. **Bureau (`:3000`, Marie)** — entrée de nav **« Signatures »** :
   « À signer par moi » (l'entente, à son tour) → signature **dans le
   document** identique ; « En circulation » suit Jean/Sophie/Karine ;
   « Historique » montre déjà le **mandat refusé**.
3. **Externe (`:3002`)** — ouvrez le lien imprimé : page vérifiée,
   même signature dans le document (Parisienne) → **ronde close** :
   copie 5 pages (4 vignettes + certificat 2 p.) au coffre, **partagée
   au couple**, téléchargeable par toutes les parties.
4. **Refus, preuve et « nouvel envoi »** — sur le mandat du coffre :
   badge « Refusée » + motif + lien **« PDF constatant le refus +
   certificat »** (tampon rouge « Refusé — Jean Bouchard » sur la pièce,
   motif au certificat) ; bouton **« Nouvel envoi »** — aucune
   reconfiguration (jetons régénérés, zones reprises). La pièce finale
   reste téléchargeable par le signataire **même sur refus**.
5. **Liens certifiés** — fiche **Jean** : puce « Lié à **Sophie
   Bouchard** » cliquable dans l'en-tête + carte « Liens certifiés »
   (ajout/retrait audités) ; la fiche de Sophie montre le lien
   **réciproque** — parfait pour le « système d'ID unique » du groupe.
6. **Assistant** (inchangé, 7b) — « Signature » → « Nouvelle
   enveloppe… » : signataires, ordre, échéance , zones au clic sur le
   PDF ou gabarit démo, relances, gabarits réutilisables.

**Parcours de validation Sprint 8** (SaaS — après `pnpm db:seed:demo`,
abonnement **Essentiel** actif + 2 factures historiques + 30 j
d'événements semés) :

1. **Abonnement (`:3000`, Marie)** — nav « Abonnement » : jauges
   vivantes (sièges « 2 / 2 » rouges), grille **0/59/119/199**,
   factures 67,84 $ (TPS/TVQ) téléchargeables en PDF ; « Statistiques »
   → **upsell** (mesure verrouillée au palier) MAIS vue plateforme
   fondateurs visible (MRR 59 $).
2. **Montée Pro** — « Passer à Pro » → **simulateur Stripe** : une
   carte 5555… est **refusée**, la carte de test **4242 4242 4242
   4242 · 12/30 · CVC 123** passe → facture **136,82 $** (119 + TPS +
   TVQ), jauges ∞, sièges 2/3. (Dès que `STRIPE_SECRET_KEY` est
   renseignée, le même geste redirige vers le vrai Checkout Stripe.)
3. **Statistiques débloquées** — 30 j d'activité : sparkline,
   entonnoir des signatures (complétion/refus), top événements ;
   ventilation par membre = privilège « Palier Cabinet » ; vue
   plateforme MRR 119 $ + badge « Pro · 1 ».
4. **Sauvegardes** — nav « Sauvegardes » : routage réplica locale +
   S3 région Canada (« Prêt à câbler »), « Lancer une sauvegarde
   maintenant » → ligne **VERIFIED** + manifeste sha256 ; planifiée :
   `pnpm --filter @coadvisor/documents backup:run`.
5. **Photo annuaire** — la photo de Marie (:3002) est servie depuis le
   **coffre chiffré** (`/conseillers/<id>/photo`), plus un data URL.
6. **Descente Essentiel** — « Revenir à Essentiel » : immédiat, sans
   facture ; les statistiques se **reverrouillent** (la porte des
   paliers est prouvée dans les deux sens).

## Dépannage

| Symptôme | Cause probable | Correctif |
| --- | --- | --- |
| **Windows : mettre à jour un drop en 1 double-clic** | — | Double-cliquer **`maj-coadvisor.cmd`** (db docker + `pnpm install` + `db:migrate` + `dev`) ; à la main : `pnpm install; pnpm db:migrate; pnpm dev` |
| `pnpm : command not found` | pnpm absent | `npm install -g pnpm@9` (pas besoin de Corepack) |
| Corepack « Cannot find matching keyid » | Corepack Node 20 daté | `npm install -g corepack@latest` **ou** solution précédente |
| `Environment variable not found` (Prisma) | `.env` absent de la racine | `cp .env.example .env` **à la racine**, jamais ailleurs |
| Auth DB `credentials not valid` à l'exécution | `.env` modifié sans redémarrer, doublon `.env` ailleurs | Redémarrer `pnpm dev:*`; ne garder QUE le `.env` racine |
| Vérifier réellement le mot de passe DB | `docker exec psql` = socket local `trust` (faux positif) | `psql "postgresql://coadvisor_app:coadvisor_app_dev_password@localhost:5432/coadvisor" -c "SELECT 1;"` depuis l'hôte |
| Port 5432 occupé | PostgreSQL local déjà installé | `docker compose ps`; arrêter l'autre serveur ou changer le port |
| Seed « Unique constraint failed » | Déjà seedé | Normal — ou `docker compose down -v` puis `db:up` pour repartir à zéro |
| `42501 violates row-level security policy` sur `assessments` au questionnaire | Code/DB avant le correctif 0.4.1 | Mettre le code à jour puis `pnpm db:migrate` (applique `0007`) — le token doit être présenté avant l'insert (détail : ADR-006 addendum) |

**Règles d'or environnement (monorepo)** :

1. Un seul `.env`, à la **racine** — ne pas créer de `.env` dans
   `packages/database/` ni dans `apps/*/`.
2. **Redémarrer le serveur dev** après toute modification de `.env`
   (Next.js le charge au démarrage).
3. Ne jamais définir `DATABASE_URL`/`DIRECT_URL` en variables système
   (elles prévaudraient sur le `.env` : vérifier avec
   `echo $env:DATABASE_URL` sous PowerShell).
4. Sous Windows : de préférence WSL2 ou Git Bash ; éviter Notepad pour
   éditer `.env` (risque BOM / `.env.txt`).

## Scripts

| Commande | Effet |
| --- | --- |
| `pnpm dev` / `dev:*` | Dev servers (tous / par app) |
| `pnpm build` | Build des 3 apps (Turbo) |
| `pnpm test` | Tests unitaires (Vitest) |
| `pnpm test:db` | + tests d'intégration RLS (DB requise) |
| `pnpm test:e2e` | Playwright (DB + dev requis) |
| `pnpm typecheck` / `pnpm lint` | Qualité |
| `pnpm db:up` / `db:down` | PostgreSQL Docker |
| `pnpm db:migrate` / `db:migrate:dev` | `migrate deploy` / `migrate dev` |
| `pnpm db:seed` | Seed démo |
| `node scripts/visual-qa.mjs` | Captures d'écran de contrôle visuel (serveurs démarrés ; voir `docs/screenshots/`) |

## Sécurité — points clés

- **Multi-tenant** : défense en profondeur — RBAC applicatif (matrice
  `ROLE_PERMISSIONS`) + **RLS PostgreSQL avec FORCE** (défaut = refus) via
  `withTenantContext` / `withSystemContext`. Un bug applicatif ne peut pas
  fuiter : la base refuse (voir `database/src/__tests__/rls.integration.test.ts`).
- **Auth** : mots de passe Argon2id ; jetons de session hachés SHA-256 en
  base ; cookie `HttpOnly; SameSite=Lax; Secure(prod)` ; MFA-ready.
- **Audit** : `recordAudit(tx, …)` dans la même transaction que la mutation ;
  `REVOKE UPDATE, DELETE ON audit_logs` — journal immuable (Loi 25/LPRPDE).
- **Secrets** : jamais dans le dépôt — `.env` ignoré par git.

## Qualité & processus (Playbook)

Definition of Done : TS strict ✓ · architecture modulaire ✓ · pas de
duplication ✓ · permissions validées ✓ · audit si sensible ✓ · migrations ✓ ·
tests ✓ · docs (ADR) ✓. CI complète : `.github/workflows/ci.yml`.

## Conformité & IA

- Cadre prévu : **AMF Québec, Loi 25, LPRPDE** (consentement, journalisation,
  traçabilité dès le socle).
- **IA assistive uniquement** : le Copilot (`@coadvisor/ai`, ADR-008) est le
  seul point d'entrée IA — exécution serveur, provenance documentée à
  chaque artefact, suggestions toujours validées par le conseiller ; un
  provider « région Canada » pourra remplacer la passerelle locale sans
  toucher l'interface. Aucun conseil financier réglementé automatisé.

## Statut

✅ **Sprint 1 — Core Platform Foundation** ([détail](docs/sprints/sprint-01-core-platform.md))
✅ **Sprint 1.5 — Design System & UX** ([détail](docs/sprints/sprint-15-design-ux.md)) :
interface de niveau FinTech professionnel (AppShell, composants v2, marque
officielle).
✅ **Sprint 2 — CRM Financial Foundation** ([détail](docs/sprints/sprint-02-crm-financial.md)) :
un conseiller peut gérer un dossier client (fiche 360 : notes, tâches,
famille, timeline — RBAC + RLS + audit).
✅ **Sprint 3 — Financial Needs Assessment Engine** ([détail](docs/sprints/sprint-03-fnae.md)) :
outil d'acquisition public — questionnaire anonyme → portrait financier
(score, 6 dimensions, priorités) → lead consenti (Loi 25) → conversion
client en 1 clic.
✅ **Sprint 4 — Financial Health Engine** ([détail](docs/sprints/sprint-04-fhe.md)) :
profil financier granulaire → **indice FHI déterministe** (10 catégories,
explications, historique immuable) affiché au conseiller et au **portail
particulier** (code d'invitation + consentement Loi 25).
✅ **Sprint 5 — Advisor Intelligence** ([détail](docs/sprints/sprint-05-advisor-intelligence.md)) :
**Copilot conseiller** — résumé, préparation de rencontre (→ note au
journal), suggestions (→ tâches), bilan imprimable ; providers
`codex-bridge` (Codex CLI / ChatGPT Plus local) + secours déterministe,
provenance et audit à chaque génération.
✅ **Sprint 6 — Marketplace** ([détail](docs/sprints/sprint-06-marketplace.md)) :
**annuaire opt-in** (consentement horodaté, audité) + **recommandations
de matching** explicables (`mktmatch-1.0`, raisons avec points, recalcul
serveur) → demande de contact consentie → **lead conseiller + e-mail** ;
RLS publique étanche, aucune PII exposée.
✅ **Sprint 7 — Documents & Compliance** ([détail](docs/sprints/sprint-07-documents-compliance.md)) :
**coffre chiffré** AES-256-GCM en continu (onglet Documents, magic bytes),
**partage** portail + lien public 7 jours révocable vérifié, **signature**
nom tapé + consentement avec **certificat de preuve** fusionné (machine à
états gravée dans la RLS), **3 rapports PDF** serveur, **page Conformité**
(audit filtrable → CSV, export client Loi 25 en 1 clic).
✅ **Sprint 7b — Signature électronique avancée** ([détail](docs/sprints/sprint-07b-signature-avancee.md),
[ADR-011](docs/adr/ADR-011-enveloppes-signature-multi-signataires.md)) :
**enveloppes multi-signataires** (couple portail, contre-signature cabinet,
externe sans compte par capability token) avec **zones positionnées** sur
le PDF (signature, **paraphes**, dates — éditeur pdf.js + estampillage
`sigstamp-1.0`), **séquentiel/parallèle**, **refus motivé**, **échéance**,
**relances 72 h**, **gabarits**, **signature tracée**, certificat
multi-signataires `signdoc-2.0` — statut par **badges dérivés** (jamais
dans le libellé), tours et preuves **gravés dans la RLS**.
✅ **Sprint 7c — Signdoc autonome & signature façon DocuSign** ([détail](docs/sprints/sprint-07c-signdoc-et-liens.md),
[ADR-012](docs/adr/ADR-012-signdoc-autonome.md)) :
**`@coadvisor/signdoc`** (moteur autonome, ports/adaptateurs — prêt pour
une API commerciale), **adoption façon DocuSign** (grille de styles script
OFL + **ID d'apposition** + cadres `sigstamp-2.0`), **signature dans le
document** en temps réel sur les **3 canaux**, **refus = ronde close avec
copie constatante + « nouvel envoi »**, **bureau des signatures**
(`/signatures`), **liens inter-clients certifiés** (couple ↔ fiches
navigables, RLS personnel), registre d'audit scellé
(`REVOKE UPDATE, DELETE`).
✅ **Sprint 8 — Commercialisation SaaS** ([détail](docs/sprints/sprint-08-saas.md),
[ADR-013](docs/adr/ADR-013-monetisation-saas.md),
[ADR-014](docs/adr/ADR-014-analytics-first-party.md),
[ADR-015](docs/adr/ADR-015-sauvegarde-coffre.md)) :
**`@coadvisor/billing`** (paliers **0/59/119/199 CAD**, quotas en
transaction avec CTA de montée, **simulateur↔Stripe** sur le même
pipeline d'activation, factures **TPS 5 % + TVQ 9,975 %** en pdf-lib,
jauges d'usage vivantes), **`@coadvisor/analytics`** (16 événements
catalogués, registre append-only, sessions pseudonymisées SHA-256 salé,
preuve portail SECURITY DEFINER, déblocage par palier + **vue
plateforme MRR** fondateurs), **sauvegarde du coffre vérifiable**
(réplica atomique + **S3 SigV4 Canada**, manifeste re-haché SHA-256,
registre VERIFIED, CLI planifiable), **photo marketplace servie depuis
le coffre chiffré** (fin du data URL), migrations 0020→0022,
**e2e 30/30**.

Prochain : Sprint 9 — à définir avec le fondateur (i18n EN,
renouvellement planifié + relances d'impayés, portail client
enrichi, PWA/notifications push…).

---

© TwoDots.ca Ecosystem — usage interne. Futur : CoAdvisor Technologies Inc.
