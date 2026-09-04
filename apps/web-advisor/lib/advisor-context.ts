import { headers } from "next/headers";
import { redirect } from "next/navigation";

import type { CrmActor } from "@coadvisor/crm";
import { getUserTenants } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import type { RequestMeta } from "@coadvisor/types";

import { getSessionUserFromCookies } from "./session";

/**
 * Contexte serveur d'une page/action de l'espace conseiller :
 * session validée + appartenance tenant. Redirige sinon.
 */
export async function requireAdvisorContext() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const memberships = await getUserTenants(user.userId);
  const membership = memberships[0];
  if (!membership) {
    redirect("/signup");
  }

  const actor: CrmActor = {
    userId: user.userId,
    tenantId: membership.tenantId,
    role: membership.role,
  };

  return { user, membership, actor } as const;
}

/** Résumé du tenant (nom, plan) pour les coquilles de pages. */
export async function getTenantSummary(actor: CrmActor) {
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { name: true, slug: true, subscriptionPlan: true },
    }),
  );
}

/** Métadonnées de requête (audit) depuis les en-têtes entrantes. */
export async function getRequestMeta(): Promise<RequestMeta> {
  const requestHeaders = await headers();
  return {
    ipAddress: requestHeaders.get("x-forwarded-for") ?? undefined,
    userAgent: requestHeaders.get("user-agent") ?? undefined,
  };
}
