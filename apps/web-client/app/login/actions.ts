"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { trackSafely } from "@coadvisor/analytics";
import { credentialsSchema, selfHostedAuthProvider } from "@coadvisor/auth";
import { getUserTenants } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import { DomainError, SESSION_COOKIE_NAME } from "@coadvisor/types";
import type { AuthFormState } from "@coadvisor/types";

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Courriel ou mot de passe invalide." };
  }

  const requestHeaders = await headers();

  try {
    const result = await selfHostedAuthProvider.authenticate(
      { email: parsed.data.email, password: parsed.data.password },
      {
        ipAddress: requestHeaders.get("x-forwarded-for") ?? undefined,
        userAgent: requestHeaders.get("user-agent") ?? undefined,
      },
    );

    const store = await cookies();
    store.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: result.maxAge,
    });

    // Mesure produit first-party (Sprint 8 — jamais bloquante).
    try {
      const membership = (await getUserTenants(result.user.userId))[0];
      if (membership) {
        await withTenantContext(membership.tenantId, result.user.userId, async (tx) => {
          await trackSafely(tx, {
            tenantId: membership.tenantId,
            app: "web-client",
            actorKind: "PORTAL",
            actorId: result.user.userId,
            sessionId: result.token,
            name: "portal.login",
          });
        });
      }
    } catch (cause) {
      console.warn("[analytics] connexion portail :", cause);
    }
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect("/espace");
}
