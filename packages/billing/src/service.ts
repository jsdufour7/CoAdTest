import { trackEvent } from "@coadvisor/analytics";
import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import type { DbContext } from "@coadvisor/database";
import { DomainError } from "@coadvisor/types";
import type { RequestMeta, Role } from "@coadvisor/types";

import { computeInvoiceAmounts, nextInvoiceNumber, renderInvoicePdf } from "./invoices";
import type { InvoiceLineItem } from "./invoices";
import { BILLING_PLANS, getPlan, planRank } from "./plans";
import type { BillingPlan, PlanCode } from "./plans";
import { getBillingRoutingState, getPaymentProvider } from "./provider/resolver";
import { computeTenantUsage } from "./usage";
import type { TenantUsage } from "./usage";

export const BILLING_VERSION = "billing-1.0";

export interface BillingActor {
  tenantId: string;
  userId: string;
  role: Role;
}

/** Additionne des mois civils (28-31 : débordement natif JS, assumé). */
export function addMonths(date: Date, months: number): Date {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

// ──────────────── Pipeline d'activation (cœur mutualisé) ────────────────

export interface ActivationInput {
  tenantId: string;
  planCode: string;
  seatsExtra: number;
  provider: "SIMULATOR" | "STRIPE";
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  actorUserId: string | null;
  meta?: RequestMeta;
  /**
   * true → facture immédiate (upgrade, souscription Stripe) ;
   * false → effet différé sans facture (downgrade, prorata au cycle
   * suivant — v1 documentée, ADR-013).
   */
  issueInvoice: boolean;
  /** 4 derniers chiffres (simulation) — jamais le PAN complet. */
  cardLast4?: string | null;
}

/**
 * UNE SEULE façon de changer de palier, peu importe que le paiement
 * vienne du simulateur ou du webhook Stripe : abonnement + facture +
 * synchro tenants.subscription_plan (compat) + audit + événements —
 * le tout dans la MÊME transaction.
 */
export async function activateSubscriptionTx(
  tx: DbContext,
  input: ActivationInput,
): Promise<{ subscriptionId: string; invoiceNumber: string | null }> {
  const plan = getPlan(input.planCode);
  if (!plan) {
    throw new DomainError(`Palier inconnu : ${input.planCode}.`, "PLAN_UNKNOWN");
  }
  const existing = await tx.billingSubscription.findUnique({
    where: { tenantId: input.tenantId },
  });
  const fromCode = (existing?.planCode as PlanCode | undefined) ?? "decouverte";
  const now = new Date();
  const periodEnd =
    plan.priceCentsPerMonth === 0 ? addMonths(now, 120) : addMonths(now, 1);
  const data = {
    planCode: plan.code,
    status: "ACTIVE" as const,
    seatsExtra: input.seatsExtra,
    provider: input.provider,
    providerCustomerId:
      input.providerCustomerId ?? existing?.providerCustomerId ?? null,
    providerSubscriptionId:
      input.providerSubscriptionId ?? existing?.providerSubscriptionId ?? null,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    engineVersion: BILLING_VERSION,
  };
  const subscription = existing
    ? await tx.billingSubscription.update({
        where: { tenantId: input.tenantId },
        data,
        select: { id: true },
      })
    : await tx.billingSubscription.create({
        data: { tenantId: input.tenantId, ...data },
        select: { id: true },
      });
  // Compat : les lecteurs hérités (coquilles de pages) suivent le palier.
  await tx.tenant.update({
    where: { id: input.tenantId },
    data: { subscriptionPlan: plan.code },
  });

  let invoiceNumber: string | null = null;
  if (input.issueInvoice && plan.priceCentsPerMonth > 0) {
    const amounts = computeInvoiceAmounts(plan, input.seatsExtra);
    invoiceNumber = await nextInvoiceNumber(tx, now);
    await tx.billingInvoice.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: subscription.id,
        number: invoiceNumber,
        planCode: plan.code,
        seatsBilled: input.seatsExtra,
        amountCents: amounts.totalCents,
        status: "PAID",
        periodStart: now,
        periodEnd,
        paidAt: now,
        // On n'y stocke que les lignes produit : taxes recalculées au
        // rendu (taux versionnés par engineVersion).
        lines: JSON.parse(JSON.stringify(amounts.lines)),
        engineVersion: BILLING_VERSION,
      },
    });
  }

  await recordAudit(tx, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "billing.subscription.activated",
    entityType: "BillingSubscription",
    entityId: subscription.id,
    oldData: existing ? { planCode: fromCode } : undefined,
    newData: {
      planCode: plan.code,
      seatsExtra: input.seatsExtra,
      provider: input.provider,
      invoiceNumber,
      ...(input.cardLast4 ? { cardLast4: input.cardLast4 } : {}),
    },
    ipAddress: input.meta?.ipAddress,
    userAgent: input.meta?.userAgent,
  });
  await trackEvent(tx, {
    tenantId: input.tenantId,
    app: "web-advisor",
    actorKind: input.actorUserId ? "STAFF" : "SYSTEM",
    actorId: input.actorUserId,
    name: "billing.plan_changed",
    props: { from: fromCode, to: plan.code, provider: input.provider },
  });
  if (invoiceNumber) {
    await trackEvent(tx, {
      tenantId: input.tenantId,
      app: "web-advisor",
      actorKind: input.actorUserId ? "STAFF" : "SYSTEM",
      actorId: input.actorUserId,
      name: "billing.invoice_paid",
      props: { number: invoiceNumber, planCode: plan.code },
    });
  }
  return { subscriptionId: subscription.id, invoiceNumber };
}

/** Abonnement créé paresseusement : tout cabinet naît au palier Découverte. */
async function ensureSubscription(
  tx: DbContext,
  actor: BillingActor,
): Promise<{ id: string }> {
  const existing = await tx.billingSubscription.findUnique({
    where: { tenantId: actor.tenantId },
    select: { id: true },
  });
  if (existing) return existing;
  const now = new Date();
  const created = await tx.billingSubscription.create({
    data: {
      tenantId: actor.tenantId,
      planCode: "decouverte",
      status: "ACTIVE",
      provider: "SIMULATOR",
      currentPeriodStart: now,
      currentPeriodEnd: addMonths(now, 120),
      engineVersion: BILLING_VERSION,
    },
    select: { id: true },
  });
  await tx.tenant.update({
    where: { id: actor.tenantId },
    data: { subscriptionPlan: "decouverte" },
  });
  await recordAudit(tx, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "billing.subscription.defaulted",
    entityType: "BillingSubscription",
    entityId: created.id,
    newData: { planCode: "decouverte", provider: "SIMULATOR" },
  });
  return created;
}

// ──────────────── Lecture : page Abonnement ────────────────

export interface BillingInvoiceSummary {
  id: string;
  number: string;
  amountCents: number;
  status: "OPEN" | "PAID" | "VOID";
  planCode: string;
  seatsBilled: number;
  periodStart: string;
  periodEnd: string;
  issuedAt: string;
}

export interface SeatMember {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  since: string;
}

export interface BillingOverview {
  tenantName: string;
  plan: BillingPlan;
  status: string;
  periodEnd: string;
  cancelAtPeriodEnd: boolean;
  seatsExtra: number;
  usage: TenantUsage;
  invoices: BillingInvoiceSummary[];
  members: SeatMember[];
  routing: ReturnType<typeof getBillingRoutingState>;
  engineVersion: string;
}

export async function getBillingOverview(
  actor: BillingActor,
): Promise<BillingOverview> {
  requirePermission(actor.role, "billing:manage");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await ensureSubscription(tx, actor);
    const [subscription, tenant, usage, invoices, members] = await Promise.all([
      tx.billingSubscription.findUniqueOrThrow({
        where: { tenantId: actor.tenantId },
      }),
      tx.tenant.findUniqueOrThrow({
        where: { id: actor.tenantId },
        select: { name: true },
      }),
      computeTenantUsage(tx, actor.tenantId),
      tx.billingInvoice.findMany({
        where: { tenantId: actor.tenantId },
        orderBy: { issuedAt: "desc" },
        take: 24,
      }),
      tx.tenantUser.findMany({
        where: { tenantId: actor.tenantId, status: "ACTIVE", role: { not: "CLIENT" } },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const plan = getPlan(subscription.planCode) ?? BILLING_PLANS.decouverte;
    return {
      tenantName: tenant.name,
      plan,
      status: subscription.status,
      periodEnd: subscription.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      seatsExtra: subscription.seatsExtra,
      usage,
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        amountCents: invoice.amountCents,
        status: invoice.status,
        planCode: invoice.planCode,
        seatsBilled: invoice.seatsBilled,
        periodStart: invoice.periodStart.toISOString(),
        periodEnd: invoice.periodEnd.toISOString(),
        issuedAt: invoice.issuedAt.toISOString(),
      })),
      members: members.map((member) => ({
        membershipId: member.id,
        userId: member.userId,
        email: member.user.email,
        fullName: `${member.user.firstName} ${member.user.lastName}`.trim(),
        role: member.role,
        since: member.createdAt.toISOString(),
      })),
      routing: getBillingRoutingState(),
      engineVersion: BILLING_VERSION,
    };
  });
}

// ──────────────── Changement de palier ────────────────

async function loadCurrentPlan(
  tx: DbContext,
  tenantId: string,
): Promise<{ plan: BillingPlan; subscriptionId: string | null }> {
  const sub = await tx.billingSubscription.findUnique({
    where: { tenantId },
    select: { id: true, planCode: true },
  });
  if (!sub) return { plan: BILLING_PLANS.decouverte, subscriptionId: null };
  return {
    plan: getPlan(sub.planCode) ?? BILLING_PLANS.decouverte,
    subscriptionId: sub.id,
  };
}

/**
 * Démarre un changement de palier : upgrade → session de paiement
 * (Stripe hébergée ou page simulateur) ; downgrade → effet immédiat
 * sans facture (la mensualisation s'aligne au prochain cycle, v1).
 */
export async function startPlanChange(
  actor: BillingActor,
  planCode: string,
  baseUrl: string,
  customerEmail: string,
  tenantName: string,
  meta: RequestMeta = {},
): Promise<{ url: string }> {
  requirePermission(actor.role, "billing:manage");
  const target = getPlan(planCode);
  if (!target) {
    throw new DomainError(`Palier inconnu : ${planCode}.`, "PLAN_UNKNOWN");
  }
  const provider = getPaymentProvider();
  const downgraded = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const current = await loadCurrentPlan(tx, actor.tenantId);
      if (planRank(target.code) === planRank(current.plan.code)) {
        throw new DomainError(
          `Le palier ${target.name} est déjà actif pour votre cabinet.`,
          "PLAN_SAME",
        );
      }
      if (planRank(target.code) < planRank(current.plan.code)) {
        // Baisse de palier : effet immédiat, aucune facture (la
        // mensualisation s'aligne au prochain cycle — v1, ADR-013).
        await activateSubscriptionTx(tx, {
          tenantId: actor.tenantId,
          planCode: target.code,
          seatsExtra: 0,
          provider: provider.kind,
          actorUserId: actor.userId,
          meta,
          issueInvoice: false,
        });
        return true;
      }
      return false;
    },
  );
  if (downgraded) {
    return { url: `${baseUrl}/abonnement?plan_change=${target.code}` };
  }
  const session = await provider.createCheckout({
    tenantId: actor.tenantId,
    tenantName,
    customerEmail,
    plan: target,
    seatsExtra: 0,
    baseUrl,
  });
  return { url: session.url };
}

/** Carte de test du simulateur : jamais de PAN loggé/persisté. */
export function validateSimulatedCard(raw: {
  name?: string | undefined;
  number?: string | undefined;
  expiry?: string | undefined;
  cvc?: string | undefined;
}): { ok: true; last4: string } | { ok: false; message: string } {
  const name = (raw.name ?? "").trim();
  if (name.length < 2) {
    return { ok: false, message: "Le nom sur la carte est requis." };
  }
  const number = (raw.number ?? "").replace(/[^0-9]/g, "");
  if (!/^[0-9]{16}$/.test(number)) {
    return { ok: false, message: "Le numéro de carte doit compter 16 chiffres." };
  }
  if (!number.startsWith("4242")) {
    return {
      ok: false,
      message:
        "Le simulateur accepte uniquement les cartes de test débutant par 4242 (aucune vraie carte n'est débitée).",
    };
  }
  const match = /^([0-9]{2})\s*\/\s*([0-9]{2})$/.exec((raw.expiry ?? "").trim());
  if (!match) {
    return { ok: false, message: "L'expiration doit être au format MM/AA." };
  }
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) {
    return { ok: false, message: "Le mois d'expiration est invalide." };
  }
  const now = new Date();
  const expiryEnd = new Date(year, month, 1);
  if (expiryEnd <= now) {
    return { ok: false, message: "Cette carte de test est expirée — choisissez une date future." };
  }
  if (!/^[0-9]{3,4}$/.test((raw.cvc ?? "").trim())) {
    return { ok: false, message: "Le CVC doit compter 3 ou 4 chiffres." };
  }
  return { ok: true, last4: number.slice(-4) };
}

/**
 * Complète le paiement SIMULÉ (page /abonnement/checkout) : même
 * pipeline d'activation que le webhook Stripe. Refusé si Stripe est
 * configuré (la prod n'accepte pas de carte simulée).
 */
export async function completeSimulatedCheckout(
  actor: BillingActor,
  input: { planCode: string; seatsExtra?: number },
  card: { name?: string; number?: string; expiry?: string; cvc?: string },
  meta: RequestMeta = {},
): Promise<{ planCode: PlanCode; invoiceNumber: string | null }> {
  requirePermission(actor.role, "billing:manage");
  if (getPaymentProvider().kind !== "SIMULATOR") {
    throw new DomainError(
      "Stripe est configuré : les paiements passent par le portail Stripe, pas par le simulateur.",
      "BILLING_PROVIDER_MISMATCH",
    );
  }
  const target = getPlan(input.planCode);
  if (!target) {
    throw new DomainError(`Palier inconnu : ${input.planCode}.`, "PLAN_UNKNOWN");
  }
  const valid = validateSimulatedCard(card);
  if (!valid.ok) {
    throw new DomainError(valid.message, "CARD_INVALID");
  }
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const current = await loadCurrentPlan(tx, actor.tenantId);
    if (planRank(target.code) <= planRank(current.plan.code)) {
      throw new DomainError(
        "Le paiement simulé ne sert qu'aux montées de palier (les baisses sont immédiates, sans facture).",
        "PLAN_SAME",
      );
    }
    const result = await activateSubscriptionTx(tx, {
      tenantId: actor.tenantId,
      planCode: target.code,
      seatsExtra: input.seatsExtra ?? 0,
      provider: "SIMULATOR",
      actorUserId: actor.userId,
      meta,
      issueInvoice: true,
      cardLast4: valid.last4,
    });
    return { planCode: target.code, invoiceNumber: result.invoiceNumber };
  });
}

/** Annule le renouvellement (fin de période), Stripe ou simulateur. */
export async function cancelRenewal(
  actor: BillingActor,
  meta: RequestMeta = {},
): Promise<void> {
  requirePermission(actor.role, "billing:manage");
  const provider = getPaymentProvider();
  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const sub = await tx.billingSubscription.findUnique({
      where: { tenantId: actor.tenantId },
    });
    if (!sub || sub.status !== "ACTIVE") {
      throw new DomainError("Aucun abonnement actif à annuler.", "SUBSCRIPTION_INACTIVE");
    }
    if (provider.kind === "STRIPE" && sub.providerSubscriptionId) {
      await provider.cancelSubscription(sub.providerSubscriptionId);
    }
    await tx.billingSubscription.update({
      where: { tenantId: actor.tenantId },
      data: { cancelAtPeriodEnd: true },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "billing.subscription.cancellation_scheduled",
      entityType: "BillingSubscription",
      entityId: sub.id,
      newData: { cancelAtPeriodEnd: true },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
}

/** Reprend le renouvellement automatique. */
export async function resumeRenewal(
  actor: BillingActor,
  meta: RequestMeta = {},
): Promise<void> {
  requirePermission(actor.role, "billing:manage");
  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const sub = await tx.billingSubscription.findUnique({
      where: { tenantId: actor.tenantId },
    });
    if (!sub) {
      throw new DomainError("Aucun abonnement à reprendre.", "SUBSCRIPTION_INACTIVE");
    }
    await tx.billingSubscription.update({
      where: { tenantId: actor.tenantId },
      data: { cancelAtPeriodEnd: false },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "billing.subscription.resumed",
      entityType: "BillingSubscription",
      entityId: sub.id,
      newData: { cancelAtPeriodEnd: false },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
}

/** Ajuste les sièges additionnels facturés (palier Cabinet). */
export async function setSeatsExtra(
  actor: BillingActor,
  wanted: number,
  meta: RequestMeta = {},
): Promise<void> {
  requirePermission(actor.role, "billing:manage");
  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const current = await loadCurrentPlan(tx, actor.tenantId);
    if (current.plan.limits.extraSeatCentsPerMonth <= 0) {
      throw new DomainError(
        "Les sièges additionnels sont propres au palier Cabinet.",
        "SEATS_NOT_AVAILABLE",
      );
    }
    const sub = await tx.billingSubscription.findUniqueOrThrow({
      where: { tenantId: actor.tenantId },
    });
    const usage = await computeTenantUsage(tx, actor.tenantId);
    const floorValue = Math.max(0, usage.seatsUsed - current.plan.limits.seatsIncluded);
    if (!Number.isInteger(wanted) || wanted < floorValue || wanted > 50) {
      throw new DomainError(
        wanted < floorValue
          ? `Vos ${usage.seatsUsed} membres actifs occupent déjà ${floorValue} siège(s) additionnel(s).`
          : "Le nombre de sièges additionnels doit être entre 0 et 50.",
        "SEATS_INVALID",
      );
    }
    await tx.billingSubscription.update({
      where: { tenantId: actor.tenantId },
      data: { seatsExtra: wanted },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "billing.seats_adjusted",
      entityType: "BillingSubscription",
      entityId: sub.id,
      oldData: { seatsExtra: sub.seatsExtra },
      newData: { seatsExtra: wanted },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
}

/** PDF d'une facture du tenant (RLS confinée). */
export async function getInvoicePdf(
  actor: BillingActor,
  invoiceId: string,
): Promise<Uint8Array> {
  requirePermission(actor.role, "billing:manage");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const invoice = await tx.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { tenant: { select: { name: true } } },
    });
    if (!invoice) {
      throw new DomainError("Facture introuvable.", "INVOICE_NOT_FOUND");
    }
    const plan = getPlan(invoice.planCode) ?? BILLING_PLANS.decouverte;
    const amounts = computeInvoiceAmounts(plan, invoice.seatsBilled);
    return renderInvoicePdf({
      number: invoice.number,
      tenantName: invoice.tenant.name,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      issuedAt: invoice.issuedAt,
      status: invoice.status,
      amounts: {
        ...amounts,
        lines: Array.isArray(invoice.lines)
          ? (invoice.lines as unknown as InvoiceLineItem[])
          : amounts.lines,
      },
      currency: invoice.currency,
      engineVersion: BILLING_VERSION,
    });
  });
}

export { getBillingRoutingState, getPaymentProvider };
export type { InvoiceLineItem };
