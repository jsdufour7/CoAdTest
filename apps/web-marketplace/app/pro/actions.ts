"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { selfHostedAuthProvider } from "@coadvisor/auth";
import { SESSION_COOKIE_NAME } from "@coadvisor/types";

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await selfHostedAuthProvider.signOut(token);
  }
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
