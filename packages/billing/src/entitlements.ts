import type { DbContext } from "@coadvisor/database";

import { QuotaExceededError } from "./errors";
import { formatBytesLimit, smallestPlanCovering } from "./plans";
import type { BillingPlan, PlanCode } from "./plans";
import { computeTenantUsage } from "./usage";
import type { TenantUsage } from "./usage";

/**
 * Droits & plafonds par palier (ADR-013). Deux couches :
 *  1. assertions PURES (plan, usage) — testées au carré ;
 *  2. enveloppes Tx qui chargent plan + usage en contexte RLS.
 * Les messages sont prêts à afficher (fr-CA, vouvoiement client).
 */

export function assertClientQuota(
  plan: BillingPlan,
  usage: TenantUsage,
): void {
  const max = plan.limits.clientsMax;
  if (max === null || usage.clientsActive < max) return;
  throw new QuotaExceededError({
    quota: "clients",
    limit: max,
    used: usage.clientsActive,
    upgradeTo: smallestPlanCovering(
      (l) => l.clientsMax,
      usage.clientsActive + 1,
      plan.code,
    ),
    message: `Votre palier ${plan.name} permet ${max} dossiers clients actifs. Passez au palier supérieur pour continuer à grandir.`,
  });
}

export function assertVaultQuota(
  plan: BillingPlan,
  usage: TenantUsage,
  incomingBytes: number,
): void {
  const max = plan.limits.vaultBytesMax;
  if (max === null || usage.vaultBytes + incomingBytes <= max) return;
  throw new QuotaExceededError({
    quota: "vault_bytes",
    limit: max,
    used: usage.vaultBytes,
    upgradeTo: smallestPlanCovering(
      (l) => l.vaultBytesMax,
      usage.vaultBytes + incomingBytes,
      plan.code,
    ),
    message: `Le coffre de votre palier ${plan.name} est plein (${formatBytesLimit(max)}). Passez au palier supérieur pour déposer d'autres pièces.`,
  });
}

export function assertEnvelopeQuota(
  plan: BillingPlan,
  usage: TenantUsage,
): void {
  const max = plan.limits.envelopesPerMonthMax;
  if (max === null || usage.envelopesThisMonth < max) return;
  throw new QuotaExceededError({
    quota: "envelopes_month",
    limit: max,
    used: usage.envelopesThisMonth,
    upgradeTo: smallestPlanCovering(
      (l) => l.envelopesPerMonthMax,
      usage.envelopesThisMonth + 1,
      plan.code,
    ),
    message: `Vous avez atteint ${max} enveloppes de signature ce mois-ci (palier ${plan.name}). Passez au palier supérieur — le palier Pro est illimité.`,
  });
}

export function assertSeatQuota(
  plan: BillingPlan,
  seatsUsed: number,
  seatsExtraPurchased: number,
): void {
  const cap = plan.limits.seatsIncluded + seatsExtraPurchased;
  if (seatsUsed < cap) return;
  const canBuyMore = plan.limits.extraSeatCentsPerMonth > 0;
  throw new QuotaExceededError({
    quota: "seats",
    limit: cap,
    used: seatsUsed,
    upgradeTo: canBuyMore
      ? null
      : smallestPlanCovering((l) => l.seatsIncluded, seatsUsed + 1, plan.code),
    message: canBuyMore
      ? `Vos ${cap} sièges sont occupés. Ajoutez un siège (29 $/mois) depuis la page Abonnement.`
      : `Votre palier ${plan.name} permet ${cap} siège${cap > 1 ? "s" : ""}. Passez au palier Cabinet pour constituer votre équipe.`,
  });
}

export function assertMarketplaceListing(plan: BillingPlan): void {
  if (plan.limits.marketplaceListing) return;
  throw new QuotaExceededError({
    quota: "marketplace_listing",
    limit: 0,
    used: null,
    upgradeTo: smallestPlanCovering((l) => (l.marketplaceListing ? 0 : 1), 0, plan.code),
    message: `La vitrine Annuaire est offerte à partir du palier Essentiel. Passez au palier supérieur pour y paraître.`,
  });
}

export function assertAnalyticsAccess(
  plan: BillingPlan,
  wanted: "cabinet" | "equipe",
): void {
  const level = plan.limits.analyticsLevel;
  const ok = wanted === "cabinet" ? level !== "aucun" : level === "equipe";
  if (ok) return;
  throw new QuotaExceededError({
    quota: "analytics",
    limit: null,
    used: null,
    upgradeTo: wanted === "cabinet" ? "pro" : "cabinet",
    message:
      wanted === "cabinet"
        ? `Les statistiques de pratique sont offertes à partir du palier Pro.`
        : `L'analytics d'équipe (par membre) est propre au palier Cabinet.`,
  });
}

// ──────────────── Enveloppes transactionnelles ────────────────

/** Résout le palier effectif du tenant (défaut Découverte si absent). */
export async function resolveEffectivePlan(
  tx: DbContext,
  tenantId: string,
  getPlanByCode: (code: string) => BillingPlan,
  fallback: BillingPlan,
): Promise<BillingPlan> {
  const sub = await tx.billingSubscription.findUnique({
    where: { tenantId },
    select: { planCode: true, status: true },
  });
  if (!sub || sub.status === "CANCELED") return fallback;
  try {
    return getPlanByCode(sub.planCode);
  } catch {
    return fallback;
  }
}

export interface PlanGate {
  assertClients: () => Promise<void>;
  assertVault: (incomingBytes: number) => Promise<void>;
  assertEnvelope: () => Promise<void>;
}

/**
 * Fabrique les gardes de quota d'une requête : plan + usage chargés
 * une fois (usage recalculé à l'appel pour rester juste en concurrence).
 */
export function planGate(
  tx: DbContext,
  tenantId: string,
  plan: BillingPlan,
): PlanGate {
  return {
    async assertClients() {
      assertClientQuota(plan, await computeTenantUsage(tx, tenantId));
    },
    async assertVault(incomingBytes: number) {
      assertVaultQuota(plan, await computeTenantUsage(tx, tenantId), incomingBytes);
    },
    async assertEnvelope() {
      assertEnvelopeQuota(plan, await computeTenantUsage(tx, tenantId));
    },
  };
}

export type { PlanCode };
