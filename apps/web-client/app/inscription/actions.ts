"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { selfHostedAuthProvider } from "@coadvisor/auth";
import { signupIndividual } from "@coadvisor/core-platform";
import { DomainError, SESSION_COOKIE_NAME } from "@coadvisor/types";
import type { AuthFormState } from "@coadvisor/types";

/**
 * Inscription d'un particulier (portail :3001) :
 * création du compte (sans tenant) puis ouverture de session immédiate
 * — l'étape suivante naturelle est la liaison au dossier (/lier).
 */
export async function signupAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData);
  const email = String(raw.email ?? "").trim().toLowerCase();
  const password = String(raw.password ?? "");

  try {
    await signupIndividual(raw);

    const requestHeaders = await headers();
    const result = await selfHostedAuthProvider.authenticate(
      { email, password },
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
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect("/lier");
}
