import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Lightbulb,
  ListChecks,
  Wallet,
} from "lucide-react";

import { hasPermission } from "@coadvisor/auth";
import { getClient } from "@coadvisor/crm";
import { FHI_CATEGORY_LABELS, getHealthDashboard, getPortalLinkForClient } from "@coadvisor/health-engine";
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";
import { advisorNavFor } from "../../../../lib/nav";
import { logoutAction } from "../../../dashboard/actions";
import { revokePortalAction } from "./actions";
import { PortalInviteButton } from "./portal-panel";
import { RecalculateButton } from "./recalculate-button";

export const metadata: Metadata = { title: "Santé financière" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

const CATEGORY_LABELS: Record<string, string> = FHI_CATEGORY_LABELS;
const CATEGORY_WEIGHTS: Record<string, number> = {
  LIQUIDITY: 10,
  BUDGET: 12,
  DEBT: 12,
  SAVINGS: 10,
  INVESTMENTS: 8,
  RETIREMENT: 15,
  TAX: 10,
  INSURANCE: 13,
  ESTATE: 3,
  GOALS: 7,
};
const CATEGORY_ORDER = [
  "LIQUIDITY",
  "BUDGET",
  "DEBT",
  "SAVINGS",
  "INVESTMENTS",
  "RETIREMENT",
  "TAX",
  "INSURANCE",
  "ESTATE",
  "GOALS",
] as const;

const INSIGHT_SECTIONS = [
  { type: "STRENGTH", title: "Points forts", icon: CircleCheck, badge: "success" as BadgeVariant, iconClass: "text-emerald-500" },
  { type: "RISK", title: "Risques à corriger", icon: CircleAlert, badge: "danger" as BadgeVariant, iconClass: "text-red-500" },
  { type: "OPPORTUNITY", title: "Opportunités", icon: Lightbulb, badge: "brand" as BadgeVariant, iconClass: "text-brand-500" },
  { type: "ACTION", title: "Actions recommandées", icon: ListChecks, badge: "warning" as BadgeVariant, iconClass: "text-amber-500" },
] as const;

const SEVERITY_LABELS: Record<string, string> = { HIGH: "Élevée", MEDIUM: "Moyenne", LOW: "Faible" };
const SEVERITY_BADGES: Record<string, BadgeVariant> = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" };

function scoreTone(score: number) {
  if (score >= 75) return { label: "Excellente", text: "text-emerald-600", stroke: "#059669", bar: "bg-emerald-500" };
  if (score >= 60) return { label: "Bonne", text: "text-brand-600", stroke: "#0f6cd6", bar: "bg-brand-500" };
  if (score >= 40) return { label: "Fragile", text: "text-amber-600", stroke: "#d97706", bar: "bg-amber-500" };
  return { label: "À risque", text: "text-red-600", stroke: "#dc2626", bar: "bg-red-500" };
}

/** Jauge circulaire SVG déterministe (aucun JS client requis). */
function FhiGauge({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score);
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={tone.stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tracking-tight ${tone.text}`}>{score}</span>
        <span className="text-xs font-medium text-slate-400">/ 100</span>
      </div>
    </div>
  );
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return "—";
  return delta >= 0 ? `+${delta} pts` : `${delta} pts`;
}

export default async function SantePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const client = await getClient(actor, id);
  if (!client) {
    notFound();
  }
  const [{ latest, history }, portalLink] = await Promise.all([
    getHealthDashboard(actor, id),
    getPortalLinkForClient(actor, id),
  ]);

  const canWrite = hasPermission(actor.role, "clients:write");
  const name = `${client.firstName} ${client.lastName}`;
  const categoryScores = (latest?.categoryScores ?? {}) as Record<string, number>;
  const tone = latest ? scoreTone(latest.score) : null;

  return (
    <AppShell
      currentPath="/clients"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: ROLE_LABELS[membership.role] ?? membership.role,
      }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Santé financière"
      subtitle={`Financial Health Index de ${name} — moteur déterministe, aucune IA`}
    >
      <div className="space-y-6">
        {/* Navigation dossier */}
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/clients/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Dossier 360°
            </Button>
          </Link>
          <Link href={`/clients/${id}/finances`}>
            <Button variant="secondary" size="sm">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Données financières
            </Button>
          </Link>
        </div>

        {latest === null ? (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                title="Aucun indice calculé"
                description="Saisissez d'abord le profil financier (au moins un revenu), puis calculez le premier Financial Health Index du client."
                action={
                  canWrite ? (
                    <RecalculateButton clientId={id} label="Calculer l'indice FHI" />
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Score global */}
            <Card>
              <CardContent className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:items-center sm:gap-10">
                <FhiGauge score={latest.score} />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                      Santé financière {tone?.label?.toLowerCase()}
                    </h2>
                    <Badge variant={latest.score >= 75 ? "success" : latest.score >= 60 ? "brand" : latest.score >= 40 ? "warning" : "danger"}>
                      FHI {latest.score}/100
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Calculé le {formatDateTime(latest.createdAt)} · moteur {latest.engineVersion} · 100 % déterministe (aiGenerated=false)
                  </p>
                  {latest.progress?.previousScore !== null && latest.progress?.previousScore !== undefined ? (
                    <p className="mt-1 text-sm text-slate-500">
                      Précédent : {latest.progress.previousScore}/100 ({formatDelta(latest.progress.delta)})
                    </p>
                  ) : null}
                </div>
                {canWrite ? (
                  <RecalculateButton clientId={id} label="Recalculer l'indice" />
                ) : null}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Catégories */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle>Les 10 catégories</CardTitle>
                  <CardDescription>Score 0-100 par catégorie — pondération v1 entre parenthèses</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {CATEGORY_ORDER.map((category) => {
                      const value = Math.round(categoryScores[category] ?? 0);
                      const categoryTone = scoreTone(value);
                      return (
                        <li key={category}>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-slate-700">
                              {CATEGORY_LABELS[category]}
                              <span className="ml-1.5 text-xs font-normal text-slate-400">
                                {CATEGORY_WEIGHTS[category]} %
                              </span>
                            </p>
                            <p className={`text-sm font-semibold ${categoryTone.text}`}>{value}</p>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${categoryTone.bar}`}
                              style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              {/* Explications FR-FHE-002 */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Comprendre le score</CardTitle>
                  <CardDescription>
                    Facteurs influents et pistes d&apos;amélioration — générés par le moteur explicable (FR-FHE-002)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {latest.insights.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucune observation pour ce snapshot.</p>
                  ) : (
                    INSIGHT_SECTIONS.map((section) => {
                      const items = latest.insights.filter((i) => i.type === section.type);
                      if (items.length === 0) return null;
                      const Icon = section.icon;
                      return (
                        <section key={section.type}>
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <Icon className={`h-4 w-4 ${section.iconClass}`} aria-hidden="true" />
                            {section.title}
                            <Badge variant={section.badge}>{items.length}</Badge>
                          </h3>
                          <ul className="mt-2 space-y-2">
                            {items.map((insight) => (
                              <li
                                key={insight.id}
                                className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium text-slate-800">{insight.message}</p>
                                  <div className="flex shrink-0 gap-1.5">
                                    {insight.category ? (
                                      <Badge variant="outline">{CATEGORY_LABELS[insight.category]}</Badge>
                                    ) : null}
                                    <Badge variant={SEVERITY_BADGES[insight.severity]}>
                                      {SEVERITY_LABELS[insight.severity]}
                                    </Badge>
                                  </div>
                                </div>
                                {insight.recommendation ? (
                                  <p className="mt-1.5 text-sm text-slate-600">
                                    <span className="font-medium text-slate-700">Piste : </span>
                                    {insight.recommendation}
                                  </p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </section>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Historique + Portail */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Historique de l&apos;indice</CardTitle>
                  <CardDescription>
                    Snapshots immuables — l&apos;évolution n&apos;est jamais écrasée (Règle 3)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                          <th className="pb-2 pr-4 font-medium">Date</th>
                          <th className="pb-2 pr-4 font-medium">Score</th>
                          <th className="pb-2 pr-4 font-medium">Variation</th>
                          <th className="pb-2 font-medium">Raison</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((entry) => (
                          <tr key={entry.id} className="border-b border-slate-50 last:border-0">
                            <td className="py-2.5 pr-4 text-slate-600">{formatDateTime(entry.createdAt)}</td>
                            <td className="py-2.5 pr-4 font-semibold text-slate-900">{entry.score}/100</td>
                            <td className={`py-2.5 pr-4 font-medium ${(entry.progress?.delta ?? 0) < 0 ? "text-red-600" : "text-emerald-600"}`}>
                              {formatDelta(entry.progress?.delta)}
                            </td>
                            <td className="py-2.5 text-slate-500">{entry.progress?.changeReason ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Portail particulier */}
              <Card>
                <CardHeader>
                  <CardTitle>Portail client</CardTitle>
                  <CardDescription>
                    Accès web-client (:3001) — code haché, consentement Loi 25 horodaté
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {portalLink ? (
                    <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
                      <p className="text-sm text-slate-600">Statut du lien</p>
                      <p className="mt-1">
                        {portalLink.status === "ACTIVE" ? (
                          <Badge variant="success">Accès actif</Badge>
                        ) : (
                          <Badge variant="warning">Invitation en attente</Badge>
                        )}
                      </p>
                      {portalLink.claimedAt ? (
                        <p className="mt-1.5 text-xs text-slate-500">
                          Lié le {formatDateTime(portalLink.claimedAt)} — consentement horodaté.
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-slate-500">
                          En attente que le client saisisse son code sur coadvisor.ca/lier.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Aucun accès portail pour le moment. Générez un code d&apos;invitation à remettre au client.
                    </p>
                  )}
                  {canWrite ? (
                    <div className="space-y-3">
                      <PortalInviteButton clientId={id} />
                      {portalLink ? (
                        <form action={revokePortalAction.bind(null, id)}>
                          <Button type="submit" variant="danger" size="sm">
                            Révoquer l&apos;accès portail
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
