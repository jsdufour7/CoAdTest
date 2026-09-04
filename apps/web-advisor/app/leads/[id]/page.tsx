import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PhoneCall, ShieldCheck, Sparkles, Store, UserX } from "lucide-react";

import { hasPermission } from "@coadvisor/auth";
import { getLead } from "@coadvisor/fnae";
import { getContactRequestForLead } from "@coadvisor/marketplace";
import type { Dimension, EngineResult, QuestionnaireAnswers } from "@coadvisor/fnae";
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../lib/advisor-context";
import { advisorNavFor } from "../../../lib/nav";
import { logoutAction } from "../../dashboard/actions";
import { setLeadStatusAction } from "../actions";
import { ConvertLeadButton } from "./convert-lead-button";

export const metadata: Metadata = { title: "Lead" };

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  CONTACTED: "Pris en charge",
  CONVERTED: "Converti",
  DISMISSED: "Écarté",
};

const STATUS_BADGES: Record<string, BadgeVariant> = {
  NEW: "brand",
  CONTACTED: "warning",
  CONVERTED: "success",
  DISMISSED: "neutral",
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

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

const money = (value: number) =>
  value.toLocaleString("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  });

function barTone(value: number): string {
  if (value >= 65) return "bg-emerald-500";
  if (value >= 40) return "bg-amber-500";
  return "bg-red-500";
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);

  const lead = await getLead(actor, id);
  if (!lead) {
    notFound();
  }

  const contactRequest = await getContactRequestForLead(actor, id);
  const canWrite = hasPermission(actor.role, "leads:write");
  const portrait = lead.assessment
    ? (lead.assessment.report as unknown as EngineResult)
    : null;
  const answers = lead.assessment
    ? (lead.assessment.answers as unknown as QuestionnaireAnswers)
    : null;

  const name = `${lead.firstName} ${lead.lastName}`;

  return (
    <AppShell
      currentPath="/leads"
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
      title={name}
      subtitle={
        contactRequest
          ? `Demande reçue le ${lead.createdAt.toLocaleDateString("fr-CA", { dateStyle: "medium" })} via votre annonce publique`
          : `Lead reçu le ${lead.createdAt.toLocaleDateString("fr-CA", { dateStyle: "medium" })} — analyse financière publique`
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne principale : portrait financier */}
        <div className="space-y-6 lg:col-span-2">
          {contactRequest ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-brand-500" aria-hidden="true" />
                    <CardTitle>Demande via l'annuaire public</CardTitle>
                  </div>
                  {contactRequest.matchScore !== null ? (
                    <Badge variant="brand">
                      Adéquation {contactRequest.matchScore}/100
                    </Badge>
                  ) : null}
                </div>
                <CardDescription>
                  Message du prospect via votre annonce « {contactRequest.profileDisplayName} »
                  — consentement Loi 25 horodaté
                  {contactRequest.consentAt
                    ? ` le ${new Date(contactRequest.consentAt).toLocaleDateString("fr-CA", { dateStyle: "medium" })}`
                    : ""}
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <blockquote className="rounded-lg border-l-2 border-brand-300 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                  {contactRequest.message}
                </blockquote>
                {contactRequest.matchReasons && contactRequest.matchReasons.length > 0 ? (
                  <div>
                    <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      Pourquoi ce prospect vous a été recommandé ({contactRequest.engineVersion})
                    </p>
                    <ul className="space-y-1">
                      {contactRequest.matchReasons.map((reason, index) => (
                        <li key={index} className="text-sm text-slate-600">
                          · {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {contactRequest.prospectPhone ? (
                  <p className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <PhoneCall className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    {contactRequest.prospectPhone}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Portrait financier</CardTitle>
                {portrait ? (
                  <Badge
                    variant={
                      portrait.score >= 65
                        ? "success"
                        : portrait.score >= 40
                          ? "warning"
                          : "danger"
                    }
                  >
                    Score {portrait.score}/100 — {PROFILE_LABELS[portrait.profile]}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                Moteur {lead.assessment?.engineVersion ?? "—"} · analyse du{" "}
                {lead.assessment?.createdAt.toLocaleDateString("fr-CA", {
                  dateStyle: "medium",
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {portrait ? (
                <>
                  {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((dim) => {
                    const value = portrait.dimensionScores[dim];
                    return (
                      <div key={dim}>
                        <div className="flex items-baseline justify-between">
                          <p className="text-sm font-medium text-slate-700">
                            {DIMENSION_LABELS[dim]}
                          </p>
                          <p className="text-sm font-semibold text-slate-600">
                            {value}
                          </p>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full", barTone(value))}
                            style={{ width: `${Math.max(value, 2)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-center sm:grid-cols-4">
                    <div>
                      <p className="text-lg font-semibold text-slate-800">
                        {portrait.ratios.emergencyMonths} mois
                      </p>
                      <p className="text-xs text-slate-500">Fonds d'urgence</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-800">
                        {Math.round(portrait.ratios.debtServiceRatio * 100)} %
                      </p>
                      <p className="text-xs text-slate-500">Service de la dette</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-800">
                        {Math.round(portrait.ratios.savingsRate * 100)} %
                      </p>
                      <p className="text-xs text-slate-500">Taux d'épargne</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-slate-800">
                        {Math.round(portrait.ratios.retirementProgress * 100)} %
                      </p>
                      <p className="text-xs text-slate-500">Progression retraite</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Portrait indisponible pour ce lead.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Chiffres déclarés */}
          {answers ? (
            <Card>
              <CardHeader>
                <CardTitle>Situation déclarée</CardTitle>
                <CardDescription>
                  Réponses du questionnaire public (montants déclaratifs)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-slate-400">Âge</dt>
                    <dd className="font-medium text-slate-800">{answers.age} ans</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Revenu annuel</dt>
                    <dd className="font-medium text-slate-800">
                      {money(answers.annualIncome)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Épargne mensuelle</dt>
                    <dd className="font-medium text-slate-800">
                      {money(answers.monthlySavings)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Épargne-retraite</dt>
                    <dd className="font-medium text-slate-800">
                      {money(answers.retirementSavings)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Dettes consommation</dt>
                    <dd className="font-medium text-slate-800">
                      {money(answers.consumerDebt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Retraite visée</dt>
                    <dd className="font-medium text-slate-800">
                      {answers.retirementAge} ans
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Colonne latérale : fiche lead + actions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fiche lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Statut</span>
                <Badge variant={STATUS_BADGES[lead.status] ?? "neutral"}>
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Courriel</span>
                <a
                  href={`mailto:${lead.email}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {lead.email}
                </a>
              </div>
              {lead.phone ? (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Téléphone</span>
                  <span className="font-medium text-slate-800">{lead.phone}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Source</span>
                <span className="font-medium text-slate-800">
                  {lead.source === "referral"
                    ? "Référence cabinet"
                    : lead.source === "annuaire"
                      ? "Annuaire public"
                      : "Questionnaire public"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Consentement</span>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {lead.consent && lead.consentAt
                    ? `Obtenu le ${lead.consentAt.toLocaleDateString("fr-CA", { dateStyle: "medium" })}`
                    : "Non documenté"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {lead.status === "CONVERTED" ? (
            <Card>
              <CardHeader>
                <CardTitle>Converti ✔</CardTitle>
                <CardDescription>
                  Ce lead est devenu un dossier client actif.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lead.clientId ? (
                  <Link href={`/clients/${lead.clientId}`}>
                    <Button variant="secondary" className="w-full">
                      Ouvrir le dossier client
                    </Button>
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : canWrite ? (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {lead.status !== "DISMISSED" ? (
                  <ConvertLeadButton leadId={lead.id} />
                ) : null}

                <div className="space-y-2 border-t border-slate-100 pt-4">
                  {lead.status === "NEW" ? (
                    <form action={setLeadStatusAction.bind(null, lead.id, "CONTACTED")}>
                      <Button type="submit" variant="secondary" className="w-full">
                        <PhoneCall className="h-4 w-4" />
                        Marquer comme pris en charge
                      </Button>
                    </form>
                  ) : null}
                  {lead.status !== "DISMISSED" ? (
                    <form action={setLeadStatusAction.bind(null, lead.id, "DISMISSED")}>
                      <Button type="submit" variant="ghost" className="w-full text-slate-500">
                        <UserX className="h-4 w-4" />
                        Écarter ce lead
                      </Button>
                    </form>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
