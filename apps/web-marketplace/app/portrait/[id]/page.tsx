import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  ArrowDownRight,
  ArrowUpRight,
  Lightbulb,
  Target,
  UserCheck,
} from "lucide-react";

import { getAssessmentReport } from "@coadvisor/fnae";
import {
  listPublicProfiles,
  matchAdvisors,
  prioritiesFromCategoryScores,
} from "@coadvisor/marketplace";
import type { Dimension, EngineResult, InsightType } from "@coadvisor/fnae";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Logo,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import { AdvisorCard } from "../../../components/advisor-card";
import { LeadCaptureForm } from "./lead-capture-form";

export const metadata: Metadata = {
  title: "Votre portrait financier",
  robots: { index: false, follow: false },
};

const DIMENSION_LABELS: Record<Dimension, string> = {
  emergencyFund: "Fonds d'urgence",
  debt: "Dettes et budget",
  savings: "Épargne",
  retirement: "Retraite",
  protection: "Protection",
  goals: "Objectifs",
};

const PROFILE_LABELS: Record<string, string> = {
  FRAGILE: "Fondations fragiles",
  EN_PROGRESSION: "En progression",
  SOLIDE: "Situation solide",
  EXCELLENT: "Excellente santé financière",
};

const INSIGHT_BADGES: Record<InsightType, BadgeVariant> = {
  STRENGTH: "success",
  RISK: "danger",
  OPPORTUNITY: "warning",
  ACTION: "brand",
};

const INSIGHT_LABELS: Record<InsightType, string> = {
  STRENGTH: "Force",
  RISK: "Risque",
  OPPORTUNITY: "Opportunité",
  ACTION: "Action",
};

function scoreTone(value: number): string {
  if (value >= 85) return "text-emerald-600";
  if (value >= 65) return "text-brand-600";
  if (value >= 40) return "text-amber-600";
  return "text-red-600";
}

function barTone(value: number): string {
  if (value >= 85) return "bg-emerald-500";
  if (value >= 65) return "bg-brand-500";
  if (value >= 40) return "bg-amber-500";
  return "bg-red-500";
}

const percent = (ratio: number) => `${Math.round(ratio * 100)} %`;

export default async function PortraitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ k?: string; cabinet?: string }>;
}) {
  const { id } = await params;
  const { k, cabinet } = await searchParams;

  if (!k) {
    notFound();
  }

  const assessment = await getAssessmentReport(id, k);
  if (!assessment) {
    notFound();
  }

  const portrait = assessment.report as unknown as EngineResult;
  const alreadyCaptured = assessment.hasLead;
  const attributed = Boolean(cabinet);

  // Recommandations marketplace (Sprint 6) : priorités recalculées
  // depuis les scores par dimension (mktmatch-1.0, déterministe).
  const recommendationPriorities = prioritiesFromCategoryScores(
    portrait.dimensionScores as unknown as Record<string, unknown>,
  );
  const listedProfiles = await listPublicProfiles();
  const recommendations = matchAdvisors(listedProfiles, {
    priorities: recommendationPriorities,
  });

  const ratioCards = [
    {
      label: "Fonds d'urgence",
      value: `${portrait.ratios.emergencyMonths} mois`,
      hint: "Cible : 3 à 6 mois",
    },
    {
      label: "Service de la dette",
      value: percent(portrait.ratios.debtServiceRatio),
      hint: "Cible : 36 % ou moins",
    },
    {
      label: "Taux d'épargne",
      value: percent(portrait.ratios.savingsRate),
      hint: "Cible : 15 %",
    },
    {
      label: "Progression retraite",
      value: percent(portrait.ratios.retirementProgress),
      hint: "Selon les repères d'âge",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-100 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-4 lg:px-6">
          <Link href="/" aria-label="Retour à l'accueil">
            <Logo size={30} />
          </Link>
          <div className="flex-1" />
          <Badge variant="neutral">Analyse du {assessment.createdAt.toLocaleDateString("fr-CA", { dateStyle: "medium" })}</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 lg:px-6">
        {/* Score global */}
        <Card className="overflow-hidden">
          <div className="bg-brand-950 px-6 py-8 text-white sm:px-8">
            <div className="flex flex-wrap items-center gap-6">
              <div
                className={cn(
                  "flex h-28 w-28 shrink-0 flex-col items-center justify-center rounded-full border-4 bg-white/5",
                  portrait.score >= 65
                    ? "border-emerald-400"
                    : portrait.score >= 40
                      ? "border-amber-400"
                      : "border-red-400",
                )}
              >
                <span className="text-4xl font-semibold tracking-tight">
                  {portrait.score}
                </span>
                <span className="text-xs text-slate-300">sur 100</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-accent-300">
                  Votre portrait financier
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  {PROFILE_LABELS[portrait.profile]}
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {portrait.summary}
                </p>
              </div>
            </div>
          </div>
          {/* Ratios clés */}
          <CardContent className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-4">
            {ratioCards.map((card) => (
              <div key={card.label} className="text-center">
                <p className={cn("text-xl font-semibold", scoreTone(0))}>
                  {card.value}
                </p>
                <p className="text-xs font-medium text-slate-600">{card.label}</p>
                <p className="text-[11px] text-slate-400">{card.hint}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Dimensions */}
        <Card>
          <CardHeader>
            <CardTitle>Vos 6 dimensions</CardTitle>
            <CardDescription>
              Chaque dimension est notée sur 100 selon des ratios financiers
              standards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((dim) => {
              const value = portrait.dimensionScores[dim];
              return (
                <div key={dim}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm font-medium text-slate-700">
                      {DIMENSION_LABELS[dim]}
                    </p>
                    <p className={cn("text-sm font-semibold", scoreTone(value))}>
                      {value}
                    </p>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full transition-all", barTone(value))}
                      style={{ width: `${Math.max(value, 2)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Priorités */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-brand-600" />
              Vos 3 priorités
            </CardTitle>
            <CardDescription>
              Par où commencer, selon votre situation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {portrait.priorities.map((priority, index) => (
                <li
                  key={priority}
                  className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="text-sm text-slate-700">{priority}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Conseillers recommandés (matching transparent, Sprint 6) */}
        {recommendations.length > 0 ? (
          <Card className="border-brand-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-brand-600" />
                Conseillers recommandés pour votre profil
              </CardTitle>
              <CardDescription>
                Croisement transparent de vos priorités avec les spécialités
                déclarées — chaque suggestion explique ses raisons. Vous
                choisissez qui contacter; rien n'est envoyé sans vous.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendations.map((match) => {
                  const listedProfile = listedProfiles.find(
                    (candidate) => candidate.profileId === match.profileId,
                  );
                  if (!listedProfile) return null;
                  return (
                    <AdvisorCard
                      key={match.profileId}
                      profile={listedProfile}
                      matchScore={match.score}
                      reasons={match.reasons}
                      hrefSuffix={`?assessment=${assessment.id}&token=${k}`}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Observations détaillées */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-brand-600" />
              Ce que révèle votre portrait
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {portrait.insights.map((insight, index) => (
                <li key={index} className="flex items-start gap-3">
                  {insight.type === "STRENGTH" ? (
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : insight.type === "RISK" ? (
                    <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  ) : (
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <div>
                    <Badge variant={INSIGHT_BADGES[insight.type]}>
                      {INSIGHT_LABELS[insight.type]}
                    </Badge>
                    <span className="ml-2 text-xs text-slate-400">
                      {DIMENSION_LABELS[insight.dimension]}
                    </span>
                    <p className="mt-1 text-sm leading-relaxed text-slate-700">
                      {insight.message}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Capture de lead */}
        <Card className="border-brand-200">
          <CardHeader>
            <CardTitle>Aller plus loin avec un professionnel</CardTitle>
            <CardDescription>
              Un portrait se lit bien, mais un plan se construit à deux.
              Laissez vos coordonnées pour être contacté·e — rien d'automatique,
              rien sans votre consentement.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alreadyCaptured ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-800">
                Une demande de contact a déjà été envoyée pour ce portrait. ✔
              </div>
            ) : (
              <LeadCaptureForm
                assessmentId={assessment.id}
                readToken={k}
                cabinetSlug={cabinet}
                attributed={attributed}
              />
            )}
          </CardContent>
        </Card>

        <p className="pb-6 text-center text-xs leading-relaxed text-slate-400">
          Outil éducatif propulsé par le moteur {assessment.engineVersion} —
          ne constitue pas un conseil financier réglementé. Conservez le lien
          de cette page : il est l'unique clé d'accès à votre portrait.
        </p>
      </main>
    </div>
  );
}
