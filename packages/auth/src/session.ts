import { createHash, randomBytes } from "node:crypto";

import { withSystemContext } from "@coadvisor/database";
import type { DbContext } from "@coadvisor/database";
import type { RequestMeta } from "@coadvisor/types";

export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? "7") || 7;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 86_400_000;

/** Seul le haché SHA-256 du jeton est persisté (jamais le jeton en clair). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedSession {
  token: string;
  maxAge: number; // secondes — pour le cookie HttpOnly
}

export async function createSession(
  userId: string,
  meta: RequestMeta = {},
  tx?: DbContext,
): Promise<CreatedSession> {
  const token = randomBytes(32).toString("base64url");
  const data = {
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent ?? null,
  };
  if (tx) {
    await tx.session.create({ data });
  } else {
    await withSystemContext((inner) => inner.session.create({ data }));
  }
  return { token, maxAge: SESSION_TTL_DAYS * 86_400 };
}
