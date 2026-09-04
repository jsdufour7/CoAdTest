import { withSystemContext, withTenantContext } from "@coadvisor/database";
import { AuthorizationError } from "@coadvisor/types";

import {
  activityByActor,
  buildDailySeries,
  countActiveActors,
  countActiveSessions,
  signatureFunnel,
  topEvents,
} from "./aggregate";
import type {
  ActorActivity,
  DailyPoint,
  ProductEventRow,
  SignatureFunnel,
  TopEvent,
} from "./aggregate";
import { PRODUCT_EVENT_LABELS } from "./events";
import type { ProductEventName } from "./events";

export const ANALYTICS_VERSION = "analytics-1.0";

export interface AnalyticsActor {
  tenantId: string;
  userId: string;
  role: string;
}

/** Résolution du tenant opérateur (propriétaire de la plateforme SaaS). */
export function operatorTenantSlug(): string {
  return process.env.PLATFORM_TENANT_SLUG?.trim() || "twodots";
}

export interface TenantAnalyticsSummary {
  days: number;
  totalEvents: number;
  activeSessions: number;
  activeActors: number;
  dailySeries: DailyPoint[];
  signatureSeries: DailyPoint[];
  funnel: SignatureFunnel;
  top: (TopEvent & { label: string })[];
  perActor: ActorActivity[];
  engineVersion: string;
}

/**
 * Tableau de bord analytics d'UN cabinet — RLS native (le personnel ne
 * voit que son tenant ; les portails sont exclus par la politique).
 */
export async function getTenantAnalyticsSummary(
  actor: AnalyticsActor,
  days = 30,
): Promise<TenantAnalyticsSummary> {
  if (actor.role === "CLIENT") {
    throw new AuthorizationError(
      "Les statistiques d'usage sont réservées au personnel du cabinet.",
    );
  }
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows: ProductEventRow[] = await tx.productEvent.findMany({
      where: { tenantId: actor.tenantId, occurredAt: { gte: since } },
      select: {
        occurredAt: true,
        name: true,
        actorKind: true,
        actorId: true,
        sessionHash: true,
        props: true,
      },
      orderBy: { occurredAt: "asc" },
    });
    return {
      days,
      totalEvents: rows.length,
      activeSessions: countActiveSessions(rows),
      activeActors: countActiveActors(rows),
      dailySeries: buildDailySeries(rows, days),
      signatureSeries: buildDailySeries(rows, days, new Date(), (row) =>
        row.name.startsWith("signature."),
      ),
      funnel: signatureFunnel(rows),
      top: topEvents(rows).map((entry) => ({
        ...entry,
        label:
          PRODUCT_EVENT_LABELS[entry.name as ProductEventName] ?? entry.name,
      })),
      perActor: activityByActor(rows),
      engineVersion: ANALYTICS_VERSION,
    };
  });
}

export interface PlatformSubscriptionRow {
  planCode: string;
  status: string;
  seatsExtra: number;
}

export interface PlatformOverview {
  tenantCount: number;
  activeSubscriptions: number;
  planDistribution: Record<string, number>;
  mrrCents: number;
  eventsLast30d: number;
  lastBackupAt: Date | null;
  lastBackupStatus: string | null;
  engineVersion: string;
}

/**
 * Vue plateforme (MRR, distribution des paliers, dernière sauvegarde) —
 * réservée au tenant OPÉRATEUR. Lecture inter-tenants justifiée : ce
 * sont NOS métriques de monétisation, pas des données clients ; le
 * contrôle d'autorisation (rôle ADMIN + slug opérateur) précède le
 * contexte système.
 */
export async function getPlatformOverview(
  actor: AnalyticsActor,
  tenantSlug: string,
  mrrResolver: (subs: PlatformSubscriptionRow[]) => number,
): Promise<PlatformOverview> {
  if (tenantSlug !== operatorTenantSlug() || actor.role !== "ADMIN") {
    throw new AuthorizationError(
      "La vue plateforme est réservée à l'équipe fondatrice.",
    );
  }
  return withSystemContext(async (tx) => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [tenantCount, subscriptions, eventsLast30d, lastBackup] =
      await Promise.all([
        tx.tenant.count({ where: { status: "ACTIVE" } }),
        tx.billingSubscription.findMany({
          select: { planCode: true, status: true, seatsExtra: true },
        }),
        tx.productEvent.count({ where: { occurredAt: { gte: since } } }),
        tx.backupRun.findFirst({
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, status: true },
        }),
      ]);
    const distribution: Record<string, number> = {};
    let active = 0;
    const billable: PlatformSubscriptionRow[] = [];
    for (const sub of subscriptions) {
      distribution[sub.planCode] = (distribution[sub.planCode] ?? 0) + 1;
      if (sub.status === "ACTIVE" || sub.status === "TRIALING") {
        active += 1;
        billable.push(sub);
      }
    }
    return {
      tenantCount,
      activeSubscriptions: active,
      planDistribution: distribution,
      mrrCents: mrrResolver(billable),
      eventsLast30d,
      lastBackupAt: lastBackup?.createdAt ?? null,
      lastBackupStatus: lastBackup?.status ?? null,
      engineVersion: ANALYTICS_VERSION,
    };
  });
}
