"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { selfHostedAuthProvider } from "@coadvisor/auth";
import { bootstrapCabinet } from "@coadvisor/core-platform";
import { DomainError, SESSION_COOKIE_NAME } from "@coadvisor/types";
import type { AuthFormState } from "@coadvisor/types";

/**
 * Parcours « Un cabinet crée son environnement sécurisé » :
 * bootstrap atomique (tenant + admin + audit) → session → dashboard.
 */
export async function signupAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const requestHeaders = await headers();
  const meta = {
    ipAddress: requestHeaders.get("x-forwarded-for") ?? undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };

  const rawInput = Object.fromEntries(formData);

  let credentials: { email: string; password: string };
  try {
    const { admin } = await bootstrapCabinet(rawInput, meta);
    credentials = {
      email: admin.email,
      password: String(rawInput.password ?? ""),
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  const session = await selfHostedAuthProvider.authenticate(credentials, meta);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: session.maxAge,
  });

  redirect("/dashboard");
}
