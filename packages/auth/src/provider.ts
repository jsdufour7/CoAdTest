import { z } from "zod";

import type { RequestMeta, SessionUser } from "@coadvisor/types";

/**
 * Abstraction AuthProvider (ADR-002) — zéro lock-in fournisseur.
 * Implémentation initiale : SelfHostedAuthProvider.
 * Alternatives futures (Clerk, Supabase Auth, Auth0…) derrière cette interface.
 */
export interface AuthProvider {
  readonly name: string;
  authenticate(
    credentials: AuthCredentials,
    meta?: RequestMeta,
  ): Promise<AuthResult>;
  getSessionUser(token: string): Promise<SessionUser | null>;
  signOut(token: string): Promise<void>;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  maxAge: number;
  user: SessionUser;
}

export const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Courriel invalide.")
    .max(160),
  password: z.string().min(1, "Mot de passe requis."),
});
