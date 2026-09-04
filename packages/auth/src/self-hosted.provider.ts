import { withSystemContext } from "@coadvisor/database";
import type { User } from "@coadvisor/database";
import { AuthenticationError } from "@coadvisor/types";
import type { RequestMeta, SessionUser } from "@coadvisor/types";

import { verifyPassword } from "./password";
import type { AuthCredentials, AuthProvider, AuthResult } from "./provider";
import { createSession, hashSessionToken } from "./session";

function toSessionUser(user: User): SessionUser {
  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    mfaEnabled: user.mfaEnabled,
  };
}

/**
 * Implémentation auto-hébergée (ADR-002) :
 * identifiants Argon2id dans notre base, sessions en table (hachées),
 * MFA-ready (champs présents, activation dans un sprint ultérieur).
 */
export const selfHostedAuthProvider: AuthProvider = {
  name: "self-hosted",

  async authenticate(
    credentials: AuthCredentials,
    meta: RequestMeta = {},
  ): Promise<AuthResult> {
    const email = credentials.email.trim().toLowerCase();

    // Message générique volontairement : pas d'énumération de comptes.
    const invalid = () =>
      new AuthenticationError("Courriel ou mot de passe invalide.");

    const user = await withSystemContext((tx) =>
      tx.user.findUnique({ where: { email } }),
    );
    if (!user || !user.passwordHash || user.status === "SUSPENDED") {
      throw invalid();
    }

    const ok = await verifyPassword(user.passwordHash, credentials.password);
    if (!ok) {
      throw invalid();
    }

    const session = await withSystemContext(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      return createSession(user.id, meta, tx);
    });

    return { ...session, user: toSessionUser(user) };
  },

  async getSessionUser(token: string): Promise<SessionUser | null> {
    const session = await withSystemContext(async (tx) => {
      const found = await tx.session.findUnique({
        where: { tokenHash: hashSessionToken(token) },
        include: { user: true },
      });
      if (!found || found.revokedAt || found.expiresAt <= new Date()) {
        return null;
      }
      await tx.session.update({
        where: { id: found.id },
        data: { lastUsedAt: new Date() },
      });
      return found;
    });

    if (!session || session.user.status === "SUSPENDED") {
      return null;
    }
    return toSessionUser(session.user);
  },

  async signOut(token: string): Promise<void> {
    await withSystemContext((tx) =>
      tx.session.updateMany({
        where: { tokenHash: hashSessionToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
  },
};
