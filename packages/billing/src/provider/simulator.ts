import { randomUUID } from "node:crypto";

import type {
  BillingProviderEvent,
  CheckoutRequest,
  CheckoutSession,
  PaymentProvider,
} from "./port";

/**
 * Simulateur local (ADR-013) : actif tant que STRIPE_SECRET_KEY est
 * absent. La « session hébergée » est une page locale
 * (/abonnement/checkout) dont le formulaire de carte de test boucle
 * sur le MÊME pipeline d'activation que le webhook Stripe — zéro
 * duplication, zéro carte réelle, démo bout-en-bout reproductible.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  readonly kind = "SIMULATOR" as const;

  isConfigured(): boolean {
    return true;
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const id = `simcs_${randomUUID()}`;
    const params = new URLSearchParams({
      plan: request.plan.code,
      session: id,
    });
    if (request.seatsExtra > 0) params.set("sieges", String(request.seatsExtra));
    return { id, url: `${request.baseUrl}/abonnement/checkout?${params}` };
  }

  async cancelSubscription(): Promise<void> {
    // Rien à annuler côté simulateur : l'état vit dans nos tables.
  }

  async constructEvent(): Promise<BillingProviderEvent[]> {
    return [];
  }
}
