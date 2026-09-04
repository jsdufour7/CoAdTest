# Sprint 6 — Marketplace

> **Objectif Playbook :** profils, recherche, matching, prise contact.
> **Critère de validation :** *connexion prospect-conseiller.*
> **Exigence PRD :** FR-MKT-001 (profils professionnels, recherche,
> matching).
> **Statut :** ✅ Livré (0.7.0) — validé unitaire + intégration RLS +
> e2e de bout en bout.

## Tickets

| # | Ticket | Livrable | Statut |
|---|--------|----------|--------|
| S6-T1 | Fondations modèle | Enum `MarketplaceSpecialty` (6 domaines miroirs FNAE), `advisor_public_profiles` (1-1 user), `marketplace_contact_requests`, `leads.assessment_id` devient nullable — migrations `0012_marketplace_foundation` (diff) + `0013_marketplace_rls` (politiques : public → `is_listed` seulement ; INSERT contact/lead public uniquement avec preuve GUC) | ✅ |
| S6-T2 | RBAC | `marketplace:read` / `marketplace:write` (ADMIN + ADVISOR écrivent, ASSISTANT + COMPLIANCE_OFFICER lisent) — la visibilité publique exige `marketplace:write` côté service et UI | ✅ |
| S6-T3 | Contexte public marketplace | `withMarketplacePublicContext(profileId, fn)` : `app.tenant_ctx='public'` + GUC `app.marketplace_profile` — preuve vérifiable en politique RLS (`EXISTS` profil listé du même tenant) | ✅ |
| S6-T4 | Notifications (`@coadvisor/notifications`) | Contrat `EmailSender` + `NotificationError` typée ; `LogEmailProvider` (défaut, boîte mémoire + console) ; `ResendEmailProvider` (REST fetch, zéro SDK, 10 s) ; `resolver` `EMAIL_PROVIDER=auto\|log\|resend` — pattern ADR-008 — réponse équipe **lead_email** | ✅ |
| S6-T5 | Moteur de matching | `mktmatch-1.0` : priorités **recalculées serveur** depuis `categoryScores` (trustless), poids explicites sur 100 (40/25/15 + région 12 + langue 8), raisons FR avec points, tri déterministe, score > 0, limite 3 ; filtres annuaire (mot-clé/spécialité/région/langue, insensibles accents et casse) — réponse équipe **both** | ✅ |
| S6-T6 | Profil public — opt-in | Brouillon privé (formulaire libre) ≠ visibilité ; interrupteur avec consentement Loi 25 horodaté ; audit `marketplace.profile.updated/listed/unlisted` — réponse équipe **optin** | ✅ |
| S6-T7 | Chaîne de contact trustless | `submitContactRequest` : preuve listing → recalcul match → `createMany` + UUID applicatifs (piège `INSERT…RETURNING`, récurrence ADR-006) → audit `marketplace.contact.requested` → e-mail best-effort + audit `notification.email.sent/failed` | ✅ |
| S6-T8 | UI conseiller « Mon profil public » | `/parametres/profil-public` : carte visibilité (badge + lien annonce), formulaire étendu (photo data URL ≤ 450 Ko, années d'expérience, certifications déclaratives) — réponse équipe **extended** ; sous-chemin client-sûr `@coadvisor/marketplace/labels` | ✅ |
| S6-T9 | Annuaire public | `/conseillers` (filtres GET, datalist régions, état vide, pied AMF) ; `/conseillers/[id]` (carte identité, avertissement ambre « déclaratif non vérifié — validez auprès de l'AMF », formulaire contact + consentement Loi 25) ; header public mutualisé + CTA annuaire sur l'accueil | ✅ |
| S6-T10 | Recommandations portrait | Portrait FNAE : section « Conseillers recommandés pour votre profil » après les 3 priorités — cartes adéquation X/100 + raisons, liens `?assessment=…&token=…` | ✅ |
| S6-T11 | Leads inbox enrichie | Badge source « Annuaire public » (liste + détail) ; détail : carte « Demande via l'annuaire public » (adéquation, message cité, raisons + `engineVersion`, téléphone) ; `Lead.assessmentId` nullable géré dans la lecture | ✅ |
| S6-T12 | Données démo | `karim.haddad@coadvisor.ca` (ADVISOR) ; profils listés Marie (retraite/épargne/objectifs, 12 ans) + Karim (protection/dettes/fonds d'urgence, 8 ans) — couverture des 6 spécialités → recommandations toujours non vides | ✅ |
| S6-T13 | Configuration documentée | `.env.example` : `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_RESEND_TIMEOUT_MS` | ✅ |

## Décisions appliquées

- **ADR-009** : annuaire opt-in, matching déterministe sans confiance,
  provider de notifications, requêtes publiques sans jointures.
- Réponses d'équipe (session planification Sprint 6) :
  - visibilité **opt-in explicite, horodatée** — jamais de publication
    implicite ;
  - entrées **annuaire filtrable + matching** (les deux portes) ;
  - contact = **lead CRM + notification e-mail** (le conseiller gère la
    relation dans son outil, l'e-mail l'avertit) ;
  - profil **étendu** (photo, expérience, certifications affichées « non
    vérifiées » — la vérification AMF reste humaine).
- Pièges RLS documentés : `INSERT…RETURNING` refusé sous contexte
  public (`createMany` + UUID applicatifs, comme Sprint 3) ; **aucune
  jointure** sous contexte public (`tenants`/`users` invisibles) —
  colonnes propres seulement + enrichissement système à `select` étroit.
- Tri « NULLS LAST » explicite (un profil sans années d'expérience ne
  coiffe jamais le palmarès).

## Validation

| Niveau | Résultat |
|--------|----------|
| Unitaires (vitest) | **6/6 `@coadvisor/notifications`** (routage auto/log/resend, garde `invalid_message`, lectures d'environnement) + **16/16 `@coadvisor/marketplace`** (matching : poids, raisons FR, tie-break déterministe, filtre score>0, accents/casse ; schémas : consentement `literal(true)`, photo data URL, bio 40-1200) — total monorepo **97 unitaires** |
| Typecheck / lint | 0 erreur, tous packages et apps |
| Build Next.js | 3/3 apps compilées |
| RLS intégration (vraie PostgreSQL) | **6/6** — bloc « marketplace » : annuaire public ne voit que le listé, rejet d'INSERT sans GUC de preuve, PII (courriel conseiller, tenant) invisibles au public, contact transversal au lead du cabinet |
| e2e (Playwright, 3 apps, navigateur réel) | **14/14** — dont 2 nouveaux : (1) annuaire → filtre Retraite → profil Marie → avertissement AMF → contact Nadia → confirmation → conseiller : badge « Annuaire public » + détail avec adéquation et message ; (2) questionnaire express → portrait → « Conseillers recommandés » + « Adéquation X/100 » + « votre priorité n° » → profil lié avec `assessment`+`token` |
| Captures | `s06-marketplace-annuaire.png`, `s06-marketplace-profil-conseiller.png`, `s06-portrait-recommandations.png`, `s06-advisor-profil-public.png`, `s06-advisor-leads-annuaire.png` (`node scripts/visual-qa-s06.mjs`) |

### Incident détecté et corrigé en validation

Le dernier test e2e bloquait sur `getByLabel("Prénom")` alors que le
formulaire s'affichait : le composant `TextField` n'associe son libellé
(`htmlFor`) **que si une prop `id` est fournie** — mes deux formulaires
Sprint 6 (contact public, profil conseiller) ne passaient que `name`.
Labels fonctionnels rétablis par `id` explicite sur tous les champs
(correction d'**accessibilité** réelle, lecteurs d'écran et
auto-remplissage inclus), convention déjà utilisée par les sprints
précédents. e2e repassé : **14/14**.

## Hors scope (confirmé)

- Stockage objet des photos (S3/local) et vignettes → **Sprint 7**
  (coffre documentaire) — champ `photo_data` isolé, migration prévue.
- Provider e-mail transactionnel en production (Resend ou interne) — le
  provider `log` reste le défaut de démo, activable sans changement de
  code.
- Recherche annuaire par trigrammes SQL (le filtrage en mémoire suffit
  au volume de lancement).
- Vérification automatisée des inscriptions AMF — la mention «
  déclaratif non vérifié » reste la garde (l'humain vérifie).
