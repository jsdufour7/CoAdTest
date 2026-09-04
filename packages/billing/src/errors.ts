import { DomainError } from "@coadvisor/types";

import type { PlanCode } from "./plans";

export type QuotaKind =
  | "clients"
  | "vault_bytes"
  | "envelopes_month"
  | "seats"
  | "marketplace_listing"
  | "analytics";

/**
 * Dépassement de plafond de palier (ADR-013) : l'UI affiche le message
 * FR et le palier suggéré (CTA « Passer au palier X ») — jamais un 500.
 */
export class QuotaExceededError extends DomainError {
  readonly quota: QuotaKind;
  readonly limit: number | null;
  readonly used: number | null;
  readonly upgradeTo: PlanCode | null;

  constructor(input: {
    message: string;
    quota: QuotaKind;
    limit: number | null;
    used: number | null;
    upgradeTo: PlanCode | null;
  }) {
    super(input.message, "QUOTA_EXCEEDED");
    this.name = "QuotaExceededError";
    this.quota = input.quota;
    this.limit = input.limit;
    this.used = input.used;
    this.upgradeTo = input.upgradeTo;
  }
}
