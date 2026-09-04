import { createHmac, timingSafeEqual } from "node:crypto";

import { DomainError } from "@coadvisor/types";

import type {
  BillingProviderEvent,
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
} from "./port";

const API_BASE = "https://api.stripe.com/v1";
const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Provider Stripe réel (ADR-013) — activé dès que STRIPE_SECRET_KEY
 * est défini. Aucune dépendance au SDK : API REST + vérification de
 * signature HMAC-SHA256 maison (surface d'audit réduite).
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly kind = "STRIPE" as const;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string | undefined,
    private readonly priceIds: Record<string, string | undefined>,
  ) {}

  isConfigured(): boolean {
    return this.secretKey.trim().length > 0;
  }

  private priceIdFor(planCode: string): string {
    const priceId = this.priceIds[planCode];
    if (!priceId) {
      throw new DomainError(
        `Tarif Stripe manquant pour le palier « ${planCode} » (variable STRIPE_PRICE_${planCode.toUpperCase()}).`,
        "BILLING_PRICE_NOT_CONFIGURED",
      );
    }
    return priceId;
  }

  private async api<T>(path: string, params: URLSearchParams): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        typeof payload.error === "object" && payload.error !== null
          ? String((payload.error as Record<string, unknown>).message)
          : `HTTP ${response.status}`;
      throw new DomainError(
        `Stripe a refusé la demande : ${message}`,
        "BILLING_PROVIDER_ERROR",
      );
    }
    return payload as T;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set(
      "success_url",
      `${request.baseUrl}/abonnement?checkout=succes`,
    );
    params.set("cancel_url", `${request.baseUrl}/abonnement?checkout=annule`);
    params.set("customer_email", request.customerEmail);
    params.set("line_items[0][price]", this.priceIdFor(request.plan.code));
    params.set("line_items[0][quantity]", "1");
    if (request.seatsExtra > 0) {
      const seatPrice = this.priceIdFor("seat");
      params.set("line_items[1][price]", seatPrice);
      params.set("line_items[1][quantity]", String(request.seatsExtra));
    }
    params.set("metadata[tenant_id]", request.tenantId);
    params.set("metadata[plan_code]", request.plan.code);
    params.set("metadata[seats_extra]", String(request.seatsExtra));
    params.set("subscription_data[metadata][tenant_id]", request.tenantId);
    params.set("subscription_data[metadata][plan_code]", request.plan.code);
    params.set(
      "subscription_data[metadata][seats_extra]",
      String(request.seatsExtra),
    );
    params.set("client_reference_id", request.tenantId);
    const session = await this.api<{ id: string; url: string }>(
      "/checkout/sessions",
      params,
    );
    return { id: session.id, url: session.url };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    const params = new URLSearchParams();
    params.set("cancel_at_period_end", "true");
    await this.api(`/subscriptions/${providerSubscriptionId}`, params);
  }

  /** Vérification « Stripe-Signature » : t=…,v1=… (HMAC du corps brut). */
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookSecret) return false;
    const parts = new Map<string, string[]>();
    for (const item of signatureHeader.split(",")) {
      const eq = item.indexOf("=");
      if (eq < 0) continue;
      const key = item.slice(0, eq);
      const value = item.slice(eq + 1);
      parts.set(key, [...(parts.get(key) ?? []), value]);
    }
    const timestamp = parts.get("t")?.[0];
    const signatures = parts.get("v1") ?? [];
    if (!timestamp || signatures.length === 0) return false;
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) return false;
    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest();
    return signatures.some((sig) => {
      const given = Buffer.from(sig, "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
  }

  async constructEvent(
    rawBody: string,
    signatureHeader: string | null,
  ): Promise<BillingProviderEvent[]> {
    if (!signatureHeader || !this.verifyWebhookSignature(rawBody, signatureHeader)) {
      throw new DomainError(
        "Signature de webhook Stripe invalide — événement rejeté.",
        "BILLING_WEBHOOK_SIGNATURE",
      );
    }
    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: Record<string, unknown> };
    };
    const object = event.data?.object ?? {};
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;

    if (event.type === "checkout.session.completed") {
      const tenantId = String(metadata.tenant_id ?? object.client_reference_id ?? "");
      const planCode = String(metadata.plan_code ?? "");
      if (!tenantId || !planCode) return [];
      return [
        {
          type: "checkout.completed",
          tenantId,
          planCode,
          seatsExtra: Number(metadata.seats_extra ?? 0) || 0,
          providerCustomerId:
            typeof object.customer === "string" ? object.customer : undefined,
          providerSubscriptionId:
            typeof object.subscription === "string"
              ? object.subscription
              : undefined,
        },
      ];
    }
    if (event.type === "customer.subscription.deleted") {
      return [
        {
          type: "subscription.canceled",
          providerSubscriptionId: String(object.id ?? ""),
        },
      ];
    }
    if (event.type === "invoice.payment_failed") {
      return [
        {
          type: "subscription.past_due",
          providerSubscriptionId: String(object.subscription ?? ""),
        },
      ];
    }
    return [];
  }
}
