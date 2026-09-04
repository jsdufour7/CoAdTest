import type { Metadata } from "next";
import Link from "next/link";

import { ArrowUpRight, BarChart3, Globe2, ShieldCheck } from "lucide-react";

import { BILLING_PLANS, getPlan } from "@coadvisor/billing";
import {
  getPlatformOverview,
  getTenantAnalyticsSummary,
  operatorTenantSlug,
} from "@coadvisor/analytics";
import { withTenantContext } from "@coadvisor/database";
import type { DailyPoint } from "@coadvisor/analytics/pure";
import { AppShell, Badge, Card, CardContent, CardHeader, CardTitle } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../lib/advisor-context";
import { advisorNavFor } from "../../lib/nav";
import { logoutAction } from "../dashboard/actions";

export const metadata: Metadata = { title: "Statistiques" };

/** Sparkline SVG (serveur, zéro dépendance) — aires lissées simples. */
function Sparkline({
  points,
  testId,
}: {
  points: DailyPoint[];
  testId: string;
}) {
  const width = 560;
  const height = 90;
  const pad = 4;
  const max = Math.max(1, ...points.map((point) => point.count));
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => {
    const x = pad + index * step;
    const y = height - pad - (point.count / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPath = `M${pad},${height - pad} L${coords.join(" L")} L${
    pad + (points.length - 1) * step
  },${height - pad} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Série quotidienne"
      data-testid={testId}
    >
      <path d={areaPath} fill="#dbeafe" opacity={0.7} />
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="#2563eb"
        strokeWidth={2}
      />
    </svg>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Adjoint",
};

export default async function AnalyticsPage() {
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);

  // Palier effectif + membres (noms pour la vue équipe), confinés RLS.
  const { plan, memberNames } = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const sub = await tx.billingSubscription.findUnique({
        where: { tenantId: actor.tenantId },
        select: { planCode: true },
      });
      const members = await tx.tenantUser.findMany({
        where: { tenantId: actor.tenantId, status: "ACTIVE" },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      });
      return {
        plan:
          (sub ? getPlan(sub.planCode) : null) ?? BILLING_PLANS.decouverte,
        memberNames: new Map(
          members.map((member) => [
            member.userId,
            `${member.user.firstName} ${member.user.lastName}`.trim() ||
              member.user.email,
          ]),
        ),
      };
    },
  );

  const level = plan.limits.analyticsLevel;
  const summary =
    level === "aucun" ? null : await getTenantAnalyticsSummary(actor, 30);
  const isCabinet = level === "equipe";
  const isOperator =
    tenant?.slug === operatorTenantSlug() && membership.role === "ADMIN";
  const platform = isOperator
    ? await getPlatformOverview(actor, tenant?.slug ?? "", (subs) =>
        subs.reduce((sum, sub) => {
          const candidate = getPlan(sub.planCode);
          if (!candidate) return sum;
          return (
            sum +
            candidate.priceCentsPerMonth +
            sub.seatsExtra * candidate.limits.extraSeatCentsPerMonth
          );
        }, 0),
      )
    : null;

  return (
    <AppShell
      currentPath="/analytics"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: ROLE_LABELS[membership.role] ?? membership.role,
      }}
      tenantName={tenant?.name}
      planLabel={`Palier ${plan.name}`}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Statistiques de pratique"
      subtitle="Mesure d'usage 100 % auto-hébergée (aucune donnée chez un tiers)"
    >
      <div className="space-y-8">
        {!summary ? (
          <Card data-testid="analytics-upsell">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-brand-600" />
                Les statistiques de pratique vous attendent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p>
                Entonnoir de signatures, activation des clients, fréquentation
                du portail : le palier <strong>Pro</strong> débloque la
                mesure de VOTRE pratique, hébergée chez nous et jamais chez
                un tiers (aligné Loi 25).
              </p>
              <Link
                href="/abonnement"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
                data-testid="upsell-cta"
              >
                Voir les paliers <ArrowUpRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi
                label="Événements (30 j)"
                value={summary.totalEvents.toLocaleString("fr-CA")}
                hint="toutes apps confondues"
              />
              <Kpi
                label="Sessions actives"
                value={summary.activeSessions.toLocaleString("fr-CA")}
                hint="pseudonymes non réversibles"
              />
              <Kpi
                label="Personnes actives"
                value={summary.activeActors.toLocaleString("fr-CA")}
                hint="conseillers + portails"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card data-testid="analytics-serie">
                <CardHeader>
                  <CardTitle className="text-base">
                    Activité quotidienne (30 jours)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Sparkline points={summary.dailySeries} testId="spark-activite" />
                  <SparklineLegend />
                </CardContent>
              </Card>

              <Card data-testid="analytics-entonnoir">
                <CardHeader>
                  <CardTitle className="text-base">
                    Entonnoir des signatures (30 jours)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <FunnelRow label="Enveloppes envoyées" value={summary.funnel.sent} max={summary.funnel.sent} />
                  <FunnelRow label="Signées" value={summary.funnel.signed} max={summary.funnel.sent} tone="good" />
                  <FunnelRow label="Refusées" value={summary.funnel.declined} max={summary.funnel.sent} tone="bad" />
                  <FunnelRow label="Nouveaux envois" value={summary.funnel.resent} max={summary.funnel.sent} />
                  <p className="pt-2 text-xs text-slate-500">
                    {summary.funnel.completionRate === null
                      ? "Aucune enveloppe close sur la période."
                      : `Taux de complétion ${(summary.funnel.completionRate * 100).toFixed(0)} % · taux de refus ${((summary.funnel.declineRate ?? 0) * 100).toFixed(0)} %`}
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card data-testid="analytics-top">
                <CardHeader>
                  <CardTitle className="text-base">Événements fréquents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-slate-100 text-sm">
                    {summary.top.map((entry) => (
                      <li key={entry.name} className="flex justify-between py-2">
                        <span className="text-slate-700">{entry.label}</span>
                        <span className="font-medium text-slate-900">
                          {entry.count.toLocaleString("fr-CA")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card data-testid="analytics-equipe">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    Activité par membre (30 jours)
                    {!isCabinet ? <Badge variant="outline">Palier Cabinet</Badge> : null}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isCabinet ? (
                    <ul className="divide-y divide-slate-100 text-sm">
                      {summary.perActor.map((entry) => (
                        <li key={entry.actorId} className="flex justify-between py-2">
                          <span className="text-slate-700">
                            {memberNames.get(entry.actorId) ?? "Membre"}
                          </span>
                          <span className="text-slate-500">
                            {entry.count.toLocaleString("fr-CA")} év. · dernière le{" "}
                            {entry.lastAt.toLocaleDateString("fr-CA")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">
                      La ventilation par membre d'équipe est propre au palier
                      Cabinet — elle devient visible dès la montée de palier.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {platform ? (
          <Card data-testid="analytics-plateforme">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe2 className="h-5 w-5 text-brand-600" />
                Vue plateforme (équipe fondatrice)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <Kpi
                  label="MRR"
                  value={`${(platform.mrrCents / 100).toLocaleString("fr-CA", { maximumFractionDigits: 0 })} $`}
                  hint="abonnements actifs"
                />
                <Kpi label="Cabinets" value={String(platform.tenantCount)} hint="actifs" />
                <Kpi
                  label="Abonnements"
                  value={String(platform.activeSubscriptions)}
                  hint="actifs + essais"
                />
                <Kpi
                  label="Événements (30 j)"
                  value={platform.eventsLast30d.toLocaleString("fr-CA")}
                  hint="tous cabinets"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {Object.entries(platform.planDistribution).map(([code, count]) => (
                  <Badge key={code} variant="brand">
                    {BILLING_PLANS[code as keyof typeof BILLING_PLANS]?.name ?? code} · {count}
                  </Badge>
                ))}
                <span className="text-xs text-slate-400">
                  Dernière sauvegarde :{" "}
                  {platform.lastBackupAt
                    ? `${platform.lastBackupAt.toLocaleString("fr-CA")} (${platform.lastBackupStatus})`
                    : "aucune"}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Mesure first-party « analytics-1.0 » — sessions pseudonymisées
          (SHA-256 salé), aucune collecte tierce, registre en lecture seule.
        </p>
      </div>
    </AppShell>
  );
}

function SparklineLegend() {
  return (
    <p className="mt-2 text-xs text-slate-400">
      Tous événements confondus, par jour civil.
    </p>
  );
}

function FunnelRow({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone?: "good" | "bad";
}) {
  const width = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  const color =
    tone === "good" ? "bg-emerald-500" : tone === "bad" ? "bg-red-400" : "bg-brand-500";
  return (
    <div>
      <div className="flex justify-between text-slate-600">
        <span>{label}</span>
        <span className="font-medium text-slate-900">{value}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
