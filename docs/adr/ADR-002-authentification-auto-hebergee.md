# ADR-002 — Authentification auto-hébergée derrière abstraction AuthProvider

- **Statut :** Accepté — Sprint 1
- **Décideurs :** Équipe fondatrice CoAdvisor (Arena.ai)

## Contexte

Exigences : MFA readiness, audit, zéro lock-in fournisseur, maîtrise des
coûts d'un SaaS naissant. Les flux sensibles (login, invitations) doivent
rester sous notre contrôle pour l'audit FinTech.

## Décision

Interface `AuthProvider` (`packages/auth/src/provider.ts`) :

```ts
authenticate(credentials, meta) → { token, maxAge, user }
getSessionUser(token) → SessionUser | null
signOut(token) → void
```

Implémentation initiale `selfHostedAuthProvider` :

- Mots de passe hachés **Argon2id** ; politique : 12+ caractères, majuscule,
  minuscule, chiffre.
- Sessions en table `sessions` : seul le **haché SHA-256** du jeton est
  stocké ; cookie `HttpOnly; SameSite=Lax; Secure(prod)` ; TTL 7 jours
  (configurable `SESSION_TTL_DAYS`) ; révocation en base.
- **MFA-ready** : colonnes `mfa_enabled`, `mfa_secret` présentes dès le
  schéma (activation : sprint ultérieur).
- Message d'erreur générique anti-énumération ; `last_login_at`, IP et
  user-agent tracés.

## Conséquences

- Contrôle total, zéro coût par utilisateur, audit complet.
- Effort assumé : rotation/révocation MFA et réinitialisation de mot de
  passe restent à construire (voir backlog).
- Migration vers un provider managé possible sans toucher aux apps
  (adaptateur derrière la même interface).

## Alternatives écartées

- Clerk/Auth0/Supabase Auth dès maintenant : lock-in + résidence des
  données à valider (Loi 25) ; réévalué si besoin SSO/B2B.
