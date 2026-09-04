import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { StripePaymentProvider } from "../provider/stripe";

const SECRET = "whsec_test_signing_secret";

function sign(payload: string, secret = SECRET, timestamp?: number): string {
  const t = Math.floor((timestamp ?? Date.now()) / 1000);
  const v1 = createHmac("sha256", secret)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

const provider = new StripePaymentProvider("sk_test_x", SECRET, {
  pro: "price_pro",
});

describe("StripePaymentProvider — vérification HMAC des webhooks", () => {
  const payload = JSON.stringify({
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_123",
        customer: "cus_1",
        subscription: "sub_1",
        metadata: { tenant_id: "t-1", plan_code: "pro", seats_extra: "2" },
      },
    },
  });

  it("accepte une signature fraîche et traduit l'événement checkout", async () => {
    const events = await provider.constructEvent(payload, sign(payload));
    expect(events).toEqual([
      {
        type: "checkout.completed",
        tenantId: "t-1",
        planCode: "pro",
        seatsExtra: 2,
        providerCustomerId: "cus_1",
        providerSubscriptionId: "sub_1",
      },
    ]);
  });

  it("rejette un corps altéré, une signature d'un autre secret, un t vieux", async () => {
    await expect(
      provider.constructEvent(`${payload} `, sign(payload)),
    ).rejects.toThrowError(/signature/i);
    await expect(
      provider.constructEvent(payload, sign(payload, "whsec_autre")),
    ).rejects.toThrowError(/signature/i);
    await expect(
      provider.constructEvent(payload, sign(payload, SECRET, Date.now() - 10 * 60_000)),
    ).rejects.toThrowError(/signature/i);
    await expect(provider.constructEvent(payload, null)).rejects.toThrowError();
  });

  it("mappe annulation et retard de paiement, ignore le reste", async () => {
    const deleted = JSON.stringify({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_9" } },
    });
    expect(await provider.constructEvent(deleted, sign(deleted))).toEqual([
      { type: "subscription.canceled", providerSubscriptionId: "sub_9" },
    ]);
    const failed = JSON.stringify({
      type: "invoice.payment_failed",
      data: { object: { subscription: "sub_9" } },
    });
    expect(await provider.constructEvent(failed, sign(failed))).toEqual([
      { type: "subscription.past_due", providerSubscriptionId: "sub_9" },
    ]);
    const other = JSON.stringify({ type: "product.created", data: { object: {} } });
    expect(await provider.constructEvent(other, sign(other))).toEqual([]);
  });

  it("refuse un checkout sans métadonnées exploitables", async () => {
    const empty = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { metadata: {} } },
    });
    expect(await provider.constructEvent(empty, sign(empty))).toEqual([]);
  });
});
