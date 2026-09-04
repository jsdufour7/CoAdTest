"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { credentialsSchema, selfHostedAuthProvider } from "@coadvisor/auth";
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
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }

  redirect("/pro");
}
