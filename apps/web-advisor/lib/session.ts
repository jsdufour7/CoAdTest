import { cookies } from "next/headers";

import { selfHostedAuthProvider } from "@coadvisor/auth";
import { SESSION_COOKIE_NAME } from "@coadvisor/types";
import type { SessionUser } from "@coadvisor/types";

/** Valide la session courante (couche serveur, runtime Node). */
export async function getSessionUserFromCookies(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  return selfHostedAuthProvider.getSessionUser(token);
}
