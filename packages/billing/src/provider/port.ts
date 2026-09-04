import type { BillingPlan } from "../plans";

/**
 * Port paiement (pattern ADR-008, comme les LLM et le courriel) :
 * Stripe en production, simulateur déterministe en développement.
 * Le PIPELINE d'activation est commun — seul le transport des
 * événements diffère (page simulée vs webhook Stripe signé).
 */
export interface CheckoutRequest {
  tenantId: string;
  tenantName: string;
  customerEmail: string;
  plan: BillingPlan;
  seatsExtra: number;
  /** Origine publique de l'app (ex. http://localhost:3000). */
  baseUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export type BillingProviderEvent =
  | {
      type: "checkout.completed";
      tenantId: string;
      planCode: string;
      seatsExtra: number;
      providerCustomerId?: string | undefined;
      providerSubscriptionId?: string | undefined;
    }
  | { type: "subscription.canceled"; providerSubscriptionId: string }
  | { type: "subscription.past_due"; providerSubscriptionId: string };

export interface PaymentProvider {
  readonly kind: "SIMULATOR" | "STRIPE";
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  /**
   * Vérifie la signature du webhook et traduit l'événement métier.
   * Le simulateur n'a pas de webhook entrant : renvoie [].
   */
  constructEvent(
    rawBody: string,
    signatureHeader: string | null,
  ): Promise<BillingProviderEvent[]>;
}
