"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { selfHostedAuthProvider } from "@coadvisor/auth";
import {
  assertSeatQuota,
  BILLING_PLANS,
  computeTenantUsage,
  getPlan,
  resolveEffectivePlan,
} from "@coadvisor/billing";
import { getUserTenants, inviteUser } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import { DomainError, SESSION_COOKIE_NAME } from "@coadvisor/types";
import type { AuthFormState } from "@coadvisor/types";

import { getSessionUserFromCookies } from "../../lib/session";

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await selfHostedAuthProvider.signOut(token);
  }
  store.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export interface InviteFormState extends AuthFormState {
  success?: boolean;
  invitedEmail?: string;
  temporaryPassword?: string;
}

export async function inviteMemberAction(
  _prevState: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const memberships = await getUserTenants(user.userId);
  const membership = memberships[0];
  if (!membership) {
    redirect("/signup");
  }

  const requestHeaders = await headers();

  try {
    // Plafond de sièges du palier (Sprint 8 — ADR-013) avant l'invitation.
    await withTenantContext(membership.tenantId, user.userId, async (tx) => {
      const plan = await resolveEffectivePlan(
        tx,
        membership.tenantId,
        (code) => getPlan(code) ?? BILLING_PLANS.decouverte,
        BILLING_PLANS.decouverte,
      );
      const usage = await computeTenantUsage(tx, membership.tenantId);
      const sub = await tx.billingSubscription.findUnique({
        where: { tenantId: membership.tenantId },
        select: { seatsExtra: true },
      });
      assertSeatQuota(plan, usage.seatsUsed, sub?.seatsExtra ?? 0);
    });

    const result = await inviteUser(
      Object.fromEntries(formData),
      {
        userId: user.userId,
        tenantId: membership.tenantId,
        role: membership.role,
      },
      {
        ipAddress: requestHeaders.get("x-forwarded-for") ?? undefined,
        userAgent: requestHeaders.get("user-agent") ?? undefined,
      },
    );
    return {
      success: true,
      invitedEmail: result.email,
      temporaryPassword: result.temporaryPassword,
    };
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
}
