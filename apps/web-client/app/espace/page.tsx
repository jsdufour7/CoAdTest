import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import {
  CircleAlert,
  CircleCheck,
  Download,
  FileText,
  HeartPulse,
  Lightbulb,
  ListChecks,
  PenLine,
  Target,
} from "lucide-react";

import {
  FHI_CATEGORIES,
  FHI_CATEGORY_LABELS,
  getPortalDashboard,
} from "@coadvisor/health-engine";
import {
  listPendingPortalSignatures,
  listPortalSharedDocuments,
} from "@coadvisor/documents";
import { DOCUMENT_CATEGORY_LABELS } from "@coadvisor/documents/labels";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@coadvisor/ui";

import { getSessionUserFromCookies } from "../../lib/session";
import { PortalHeader } from "../../components/portal-header";
import { PortalEnvelopeCard } from "./portal-documents";

export const metadata: Metadata = { title: "Mon espace" };

const CATEGORY_LABELS: Record<string, string> = FHI_CATEGORY_LABELS;
const CATEGORY_ORDER = FHI_CATEGORIES;

const money = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function scoreTone(score: number) {
  if (score >= 75) return { label: "excellente", text: "text-emerald-600", stroke: "#059669", bar: "bg-emerald-500" };
  if (score >= 60) return { label: "bonne", text: "text-brand-600", stroke: "#0f6cd6", bar: "bg-brand-500" };
  if (score >= 40) return { label: "fragile", text: "text-amber-600", stroke: "#d97706", bar: "bg-amber-500" };
  return { label: "à risque", text: "text-red-600", stroke: "#dc2626", bar: "bg-red-500" };
}

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

function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined) return "";
  return delta >= 0 ? `+${delta} pts` : `${delta} pts`;
}

const INSIGHT_GROUPS = [
  { type: "STRENGTH", title: "Ce qui va bien", icon: CircleCheck, iconClass: "text-emerald-500" },
  { type: "RISK", title: "Ce qu'on surveille", icon: CircleAlert, iconClass: "text-red-500" },
  { type: "OPPORTUNITY", title: "Des occasions à saisir", icon: Lightbulb, iconClass: "text-brand-500" },
  { type: "ACTION", title: "Vos prochaines étapes", icon: ListChecks, iconClass: "text-amber-500" },
] as const;

export default async function EspacePage() {
  const user = await getSessionUserFromCookies();
  if (!user) {
    redirect("/login");
  }

  const fullName = `${user.firstName} ${user.lastName}`;
  const dashboard = await getPortalDashboard(user.userId);
  const sharedDocuments = dashboard
    ? await listPortalSharedDocuments(user.userId)
    : [];
  const pendingSignatures = dashboard
    ? await listPendingPortalSignatures(user.userId)
    : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader fullName={fullName} email={user.email} />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 lg:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Bonjour {user.firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Voici l&apos;état de votre santé financière.
          </p>
        </div>

        {!dashboard ? (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={<HeartPulse className="text-accent-500" />}
                title="Liez votre dossier pour voir votre santé financière"
                description="Votre conseiller vous a remis un code d'invitation à 8 caractères. Saisissez-le pour accéder à votre indice de santé financière, expliqué simplement."
                action={
                  <Link href="/lier">
                    <Button>Lier mon dossier</Button>
                  </Link>
                }
              />
            </CardContent>
          </Card>
        ) : !dashboard.latest ? (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={<HeartPulse className="text-accent-500" />}
                title="Votre indice arrive bientôt"
                description={`Votre dossier est bien lié à ${dashboard.client.tenant.name}. Votre conseiller prépare votre premier indice de santé financière — revenez bientôt.`}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Score global */}
            <Card>
              <CardContent className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:gap-10">
                <FhiGauge score={dashboard.latest.score} />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                      Votre santé financière est {scoreTone(dashboard.latest.score).label}
                    </h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Indice sur 100, calculé le{" "}
                    {dashboard.latest.createdAt.toLocaleDateString("fr-CA", { dateStyle: "long" })}
                    {dashboard.latest.progress?.delta != null
                      ? ` · ${formatDelta(dashboard.latest.progress.delta)} depuis la dernière fois`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Préparé avec {dashboard.client.tenant.name} · lecture seule
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Catégories */}
              <Card>
                <CardHeader>
                  <CardTitle>Vos 10 aspects financiers</CardTitle>
                  <CardDescription>Votre photo complète, point par point</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {CATEGORY_ORDER.map((category) => {
                      const scores = dashboard.latest?.categoryScores as Record<string, number>;
                      const value = Math.round(scores?.[category] ?? 0);
                      const tone = scoreTone(value);
                      return (
                        <li key={category}>
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-slate-700">{CATEGORY_LABELS[category]}</p>
                            <p className={`text-sm font-semibold ${tone.text}`}>{value}</p>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${tone.bar}`}
                              style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              {/* Explications */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Comprendre votre score</CardTitle>
                  <CardDescription>
                    Ce qui influence votre indice — et quoi faire ensuite
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {dashboard.latest.insights.length === 0 ? (
                    <p className="text-sm text-slate-500">Aucune observation pour le moment.</p>
                  ) : (
                    INSIGHT_GROUPS.map((group) => {
                      const items = dashboard.latest!.insights.filter((i) => i.type === group.type);
                      if (items.length === 0) return null;
                      const Icon = group.icon;
                      return (
                        <section key={group.type}>
                          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <Icon className={`h-4 w-4 ${group.iconClass}`} aria-hidden="true" />
                            {group.title}
                          </h3>
                          <ul className="mt-2 space-y-2">
                            {items.map((insight, index) => (
                              <li
                                key={`${insight.type}-${index}`}
                                className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                              >
                                <p className="text-sm font-medium text-slate-800">{insight.message}</p>
                                {insight.recommendation ? (
                                  <p className="mt-1 text-sm text-slate-600">{insight.recommendation}</p>
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

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Objectifs */}
              <Card>
                <CardHeader>
                  <CardTitle>Vos objectifs</CardTitle>
                  <CardDescription>Définis avec votre conseiller</CardDescription>
                </CardHeader>
                <CardContent>
                  {dashboard.client.financialGoals.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Aucun objectif défini pour le moment — parlez-en à votre conseiller.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {dashboard.client.financialGoals.map((goal, index) => (
                        <li key={index} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                          <Target className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">{goal.name}</p>
                            <p className="text-xs text-slate-500">
                              Cible {money.format(Number(goal.targetAmount))}
                              {goal.targetDate
                                ? ` · ${goal.targetDate.toLocaleDateString("fr-CA", { dateStyle: "medium" })}`
                                : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              {/* Progression */}
              <Card>
                <CardHeader>
                  <CardTitle>Votre progression</CardTitle>
                  <CardDescription>L&apos;évolution de votre indice dans le temps</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {dashboard.history.map((entry, index) => (
                      <li key={index} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">{entry.score}/100</p>
                          <p className="text-xs text-slate-500">
                            {entry.createdAt.toLocaleDateString("fr-CA", { dateStyle: "medium" })}
                          </p>
                        </div>
                        {entry.progress?.delta != null ? (
                          <Badge variant={entry.progress.delta >= 0 ? "success" : "danger"}>
                            {formatDelta(entry.progress.delta)}
                          </Badge>
                        ) : (
                          <Badge variant="neutral">Premier calcul</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {sharedDocuments.length > 0 || pendingSignatures.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      <CardTitle className="text-base">Documents partagés avec vous</CardTitle>
                    </div>
                    <CardDescription>
                      Déposés au coffre chiffré par votre conseiller — chaque
                      ouverture est journalisée.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {sharedDocuments.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Aucun document partagé pour l'instant.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {sharedDocuments.map((document) => (
                          <li
                            key={document.id}
                            className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                              <FileText className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800">
                                {document.label}
                              </p>
                              <p className="text-xs text-slate-500">
                                {DOCUMENT_CATEGORY_LABELS[document.category as keyof typeof DOCUMENT_CATEGORY_LABELS] ?? document.category} · partagé le{" "}
                                {document.sharedAt.toLocaleDateString("fr-CA", { dateStyle: "medium" })}
                              </p>
                            </div>
                            <a
                              href={`/espace/documents/${document.id}/telecharger`}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                            >
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              Ouvrir
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <PenLine className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      <CardTitle className="text-base">Signatures en attente</CardTitle>
                    </div>
                    <CardDescription>
                      Enveloppes multi-signataires : tapez votre nom (tracé
                      facultatif) — les zones sont apposées automatiquement,
                      avec certificat de preuve remis ici et à votre conseiller.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pendingSignatures.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Aucun document n'attend votre signature.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {pendingSignatures.map((envelope) => (
                          <PortalEnvelopeCard
                            key={envelope.signerId}
                            envelope={envelope}
                          />
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
