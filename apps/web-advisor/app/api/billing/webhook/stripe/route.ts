import { NextResponse } from "next/server";

import { handleStripeWebhook } from "@coadvisor/billing";
import { DomainError } from "@coadvisor/types";

/**
 * Webhook Stripe (ADR-013) — NON authentifié par session : la preuve
 * est la signature HMAC « Stripe-Signature » du corps brut (vérifiée
 * dans le provider). Le pipeline est partagé avec le simulateur.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  try {
    const result = await handleStripeWebhook(rawBody, signature, {
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DomainError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[billing] webhook :", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
