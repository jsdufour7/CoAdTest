import { recordAudit } from "@coadvisor/core-platform";
import { withSystemContext } from "@coadvisor/database";
import { DomainError } from "@coadvisor/types";
import type { RequestMeta } from "@coadvisor/types";

import { getPaymentProvider } from "./provider/resolver";
import { activateSubscriptionTx } from "./service";

/**
 * Point d'entrée unique des webhooks Stripe (POST /api/billing/webhook).
 * L'appelant n'est PAS une session utilisateur : la preuve est la
 * signature HMAC du provider (vérifiée dans constructEvent) — d'où le
 * contexte système, et le tenant vient des métadonnées signées.
 */
export async function handleStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  meta: RequestMeta = {},
): Promise<{ received: boolean; handled: string[] }> {
  const provider = getPaymentProvider();
  if (provider.kind !== "STRIPE") {
    throw new DomainError(
      "Le mode simulateur ne reçoit pas de webhooks Stripe.",
      "BILLING_PROVIDER_MISMATCH",
    );
  }
  const events = await provider.constructEvent(rawBody, signatureHeader);
  const handled: string[] = [];
  for (const event of events) {
    await withSystemContext(async (tx) => {
      if (event.type === "checkout.completed") {
        const tenant = await tx.tenant.findUnique({
          where: { id: event.tenantId },
          select: { id: true },
        });
        if (!tenant) return;
        await activateSubscriptionTx(tx, {
          tenantId: tenant.id,
          planCode: event.planCode,
          seatsExtra: event.seatsExtra,
          provider: "STRIPE",
          providerCustomerId: event.providerCustomerId ?? null,
          providerSubscriptionId: event.providerSubscriptionId ?? null,
          actorUserId: null,
          meta,
          issueInvoice: true,
        });
        handled.push("checkout.completed");
      }
      if (event.type === "subscription.canceled") {
        const sub = await tx.billingSubscription.findFirst({
          where: { providerSubscriptionId: event.providerSubscriptionId },
        });
        if (!sub) return;
        await tx.billingSubscription.update({
          where: { id: sub.id },
          data: { status: "CANCELED" },
        });
        await recordAudit(tx, {
          tenantId: sub.tenantId,
          actorUserId: null,
          action: "billing.subscription.canceled",
          entityType: "BillingSubscription",
          entityId: sub.id,
          newData: { status: "CANCELED", source: "stripe_webhook" },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        handled.push("subscription.canceled");
      }
      if (event.type === "subscription.past_due") {
        const sub = await tx.billingSubscription.findFirst({
          where: { providerSubscriptionId: event.providerSubscriptionId },
        });
        if (!sub) return;
        await tx.billingSubscription.update({
          where: { id: sub.id },
          data: { status: "PAST_DUE" },
        });
        await recordAudit(tx, {
          tenantId: sub.tenantId,
          actorUserId: null,
          action: "billing.subscription.past_due",
          entityType: "BillingSubscription",
          entityId: sub.id,
          newData: { status: "PAST_DUE", source: "stripe_webhook" },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        handled.push("subscription.past_due");
      }
    });
  }
  return { received: true, handled };
}
