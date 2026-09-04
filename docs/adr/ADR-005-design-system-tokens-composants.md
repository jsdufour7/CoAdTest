# ADR-005 — Design System : tokens Tailwind v4 + composants internes

- **Statut :** Accepté — Sprint 1.5
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Le principe produit n° 5 exige une UX exceptionnelle ; le Sprint 1 avait
livré des écrans fonctionnels mais minimaux. Il fallait un socle visuel
professionnel AVANT le CRM (Sprint 2), centralisé pour éviter toute
duplication entre les 3 apps (Development Rules).

## Décision

1. **Tokens dans le CSS** (Tailwind v4 `@theme` + `@utility`) :
   palettes `brand`/`accent`, ombres, motion — un seul fichier
   (`packages/ui/src/styles.css`), mode sombre préparable par recoloration
   des tokens sans toucher aux composants.
2. **Composants maison headless** (`@coadvisor/ui`) plutôt qu'une
   bibliothèque tierce lourde : Button, TextField, Alert, Badge, Avatar,
   Card, EmptyState, Skeleton, Spinner, Logo, AppShell, AuthLayout.
3. **Icônes : `lucide-react`** (licence ISC, traits cohérents, tree-shaken).
4. **Typographie : Inter** via `next/font` (auto-hébergée, zéro requête
   tierce au runtime — cohérent confidentialité).
5. **Agnostisme volontaire :** les composants structurels (`AppShell`)
   reçoivent le routeur par injection (`linkComponent`) afin que `ui`
   ne dépende pas de Next.js — réutilisable (ex. future app mobile).

## Conséquences

- Toute évolution visuelle se propage aux 3 apps en modifiant un seul
  package (pas de dérive visuelle).
- Pas de surcharge Radix/MUI au MVP ; si des primitives complexes
  deviennent nécessaires (Dialog, Combobox), elles s'ajouteront
  ponctuellement derrière les mêmes composants d'interface.
- Le mode sombre ne coûtera qu'un jeu de tokens (pas de refonte).

## Alternatives écartées

- shadcn/ui (copie de code par app : duplication interdite par nos règles
  en monorepo multi-apps ; nos composants centralisés jouent le même rôle
  sans copie).
- MUI/Chakra (couplage thème runtime lourd, éloigné de Tailwind v4).
