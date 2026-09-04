# Sprint 1.5 — Design System & UX

- **Objectif :** élever l'expérience utilisateur au niveau du principe
  produit n° 5 (« Expérience utilisateur exceptionnelle ») avant le
  développement métier du Sprint 2 — aucun nouvel écran « coquille ».
- **Statut :** ✅ Livré et validé (2026-07-30) — typecheck ✓, lint ✓,
  19 tests ✓, build 3/3 ✓. Revue visuelle utilisateur en cours.

## Direction artistique « Confiance calme »

Palette encre bleutée (`brand`) + émeraude (`accent`, santé financière) ;
typographie **Inter** (next/font, auto-hébergée) ; ombres douces ;
micro-transitions 150 ms ; icônes `lucide-react` ; pattern `bg-dots`
pour les panneaux de marque ; `prefers-reduced-motion` respecté.

## Réalisations

| # | Élément | Détail |
|---|---------|--------|
| D15-01 | Tokens v2 | Échelle `accent`, `shadow-card/popover`, motion, utilitaire `bg-dots`, préparation mode sombre |
| D15-02 | Marque | Composant `Logo` (deux points reliés — clin d'œil TwoDots.ca), variantes couleur/inversée |
| D15-03 | Composants v2 | `Button` (tailles + loading/spinner), `TextField` (icône, erreur aria, hint), `Alert` (4 variantes), `Badge`, `Avatar` (initiales, palette déterministe), `EmptyState`, `Skeleton`, `Card` (interactive) |
| D15-04 | `AppShell` | Sidebar (sections, badges « Sprint N », carte cabinet + plan, bloc utilisateur + déconnexion), topbar collante, responsive mobile (menu + voile), injection `linkComponent` (ui reste agnostique Next) |
| D15-05 | `AuthLayout` | Split-screen : panneau de marque (arguments produit propres à chaque app) + formulaire centré ; mobile : logo compact |
| D15-06 | web-advisor | Login/signup refondus ; **tableau de bord** : 4 KPI, table équipe (avatars + badges rôle/statut), invitation, journal d'audit enrichi |
| D15-07 | web-client | En-tête (logo, utilisateur, déconnexion), accueil personnalisé, `EmptyState` FHI Sprint 4 |
| D15-08 | web-marketplace | En-tête public, héros (badge, CTA, chips de confiance Loi 25/Canada/IA), 3 cartes de valeur, pied de page |

## Hors scope (planifié)

Mode sombre (tokens prêts, interrupteur à venir), système de toasts
(v2.1), illustrations sur mesure, onboarding guidé, visualisations de
données (Sprint 4 avec le Financial Health Engine).

## Critère de succès

Un utilisateur qui ouvre CoAdvisor perçoit immédiatement une plateforme
FinTech **crédible et soignée** — condition de confiance pour confier
des données financières.
