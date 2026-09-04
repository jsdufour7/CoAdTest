import type { PaymentProvider } from "./port";
import { SimulatedPaymentProvider } from "./simulator";
import { StripePaymentProvider } from "./stripe";

/**
 * Résolution du provider (ADR-013) : Stripe dès que la clé secrète
 * est configurée, simulateur local sinon — même motif que
 * EMAIL_PROVIDER/COPILOT_PROVIDER, aucune clé requise en développement.
 */
let singleton: PaymentProvider | undefined;

function stripePriceIds(): Record<string, string | undefined> {
  return {
    essentiel: process.env.STRIPE_PRICE_ESSENTIEL,
    pro: process.env.STRIPE_PRICE_PRO,
    cabinet: process.env.STRIPE_PRICE_CABINET,
    seat: process.env.STRIPE_PRICE_SEAT,
  };
}

export function getPaymentProvider(): PaymentProvider {
  if (!singleton) {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
    singleton = secretKey
      ? new StripePaymentProvider(
          secretKey,
          process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
          stripePriceIds(),
        )
      : new SimulatedPaymentProvider();
  }
  return singleton;
}

/** État de routage pour l'UI (badge « SIMULATEUR ») et le healthcheck. */
export function getBillingRoutingState(): {
  provider: "SIMULATOR" | "STRIPE";
  stripeSecretConfigured: boolean;
  stripeWebhookConfigured: boolean;
  priceIdsConfigured: Record<string, boolean>;
} {
  const priceIds = stripePriceIds();
  const priceState: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(priceIds)) {
    priceState[key] = Boolean(value && value.trim());
  }
  return {
    provider: getPaymentProvider().kind,
    stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    priceIdsConfigured: priceState,
  };
}
