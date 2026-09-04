import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ArrowLeft, HeartPulse, Trash2 } from "lucide-react";

import { hasPermission } from "@coadvisor/auth";
import { getClient } from "@coadvisor/crm";
import { getFinancialProfile } from "@coadvisor/health-engine";
import {
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";
import { advisorNavFor } from "../../../../lib/nav";
import { logoutAction } from "../../../dashboard/actions";
import { removeEntryAction } from "./actions";
import {
  AddAssetForm,
  AddExpenseForm,
  AddGoalForm,
  AddIncomeForm,
  AddInsuranceForm,
  AddLiabilityForm,
  FinancialContextForm,
  RetirementPlanForm,
} from "./finance-forms";

export const metadata: Metadata = { title: "Données financières" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

const ASSET_LABELS: Record<string, string> = {
  CASH: "Comptant",
  INVESTMENT: "Placements",
  REAL_ESTATE: "Immobilier",
  BUSINESS: "Entreprise",
  OTHER: "Autre",
};
const LIABILITY_LABELS: Record<string, string> = {
  MORTGAGE: "Hypothèque",
  LOAN: "Prêt",
  CREDIT_CARD: "Carte de crédit",
  LINE_OF_CREDIT: "Marge de crédit",
};
const EXPENSE_LABELS: Record<string, string> = {
  HOUSING: "Logement",
  FOOD: "Alimentation",
  TRANSPORT: "Transport",
  UTILITIES: "Services publics",
  INSURANCE: "Assurances",
  LEISURE: "Loisirs",
  SAVINGS: "Épargne",
  OTHER: "Autre",
};
const INSURANCE_LABELS: Record<string, string> = {
  LIFE: "Vie",
  DISABILITY: "Invalidité",
  CRITICAL_ILLNESS: "Maladies graves",
  PROPERTY: "Biens",
};
const FREQUENCY_LABELS: Record<string, string> = {
  WEEKLY: "/sem.",
  BIWEEKLY: "/2 sem.",
  MONTHLY: "/mois",
  ANNUAL: "/an",
};
const MONTHLY_FACTOR: Record<string, number> = {
  WEEKLY: 52 / 12,
  BIWEEKLY: 26 / 12,
  MONTHLY: 1,
  ANNUAL: 1 / 12,
};

const money = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("fr-CA", { dateStyle: "medium" });
}

function RemoveButton({
  kind,
  clientId,
  entryId,
  label,
}: {
  kind: "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "INSURANCE" | "GOAL";
  clientId: string;
  entryId: string;
  label: string;
}) {
  return (
    <form action={removeEntryAction.bind(null, kind, clientId, entryId)}>
      <button
        type="submit"
        aria-label={label}
        title="Retirer (la valeur reste archivée dans le journal d'audit)"
        className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}

export default async function FinancesPage({
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
  const profile = await getFinancialProfile(actor, id);
  if (!profile) {
    notFound();
  }

  const canWrite = hasPermission(actor.role, "clients:write");
  const name = `${client.firstName} ${client.lastName}`;

  // Synthèse indicative (conversion de fréquences uniquement — le calcul
  // officiel reste celui du moteur FHI, page « Santé financière »).
  const annualIncome = profile.incomes.reduce(
    (total, i) => total + Number(i.amount) * (MONTHLY_FACTOR[i.frequency] ?? 1) * 12,
    0,
  );
  const monthlyExpenses = profile.expenses
    .filter((e) => e.category !== "SAVINGS")
    .reduce((total, e) => total + Number(e.amount) * (MONTHLY_FACTOR[e.frequency] ?? 1), 0);
  const totalAssets = profile.assets.reduce((t, a) => t + Number(a.value), 0);
  const totalDebts = profile.liabilities.reduce((t, l) => t + Number(l.balance), 0);

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
      title="Données financières"
      subtitle={`Profil granulaire de ${name} — alimente le Financial Health Index`}
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
          <Link href={`/clients/${id}/sante`}>
            <Button variant="secondary" size="sm">
              <HeartPulse className="h-4 w-4" aria-hidden="true" />
              Santé financière (FHI)
            </Button>
          </Link>
        </div>

        {/* Synthèse */}
        <Card>
          <CardHeader>
            <CardTitle>Synthèse du profil</CardTitle>
            <CardDescription>
              Totaux indicatifs issus de la saisie — vérifiez avant de calculer l&apos;indice FHI
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Revenus annuels</p>
              <p className="text-lg font-semibold text-slate-900">{money.format(annualIncome)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Dépenses mensuelles</p>
              <p className="text-lg font-semibold text-slate-900">{money.format(monthlyExpenses)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Actif total</p>
              <p className="text-lg font-semibold text-slate-900">{money.format(totalAssets)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Passif total</p>
              <p className="text-lg font-semibold text-slate-900">{money.format(totalDebts)}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenus */}
          <Card>
            <CardHeader>
              <CardTitle>Revenus</CardTitle>
              <CardDescription>{profile.incomes.length} source{profile.incomes.length > 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.incomes.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun revenu saisi — requis pour calculer le FHI.</p>
              ) : (
                <ul className="space-y-2">
                  {profile.incomes.map((income) => (
                    <li key={income.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{income.label}</p>
                        <p className="text-xs text-slate-500">
                          {money.format(Number(income.amount))}{FREQUENCY_LABELS[income.frequency]}
                          {income.taxable ? " · imposable" : " · non imposable"}
                        </p>
                      </div>
                      {canWrite ? <RemoveButton kind="INCOME" clientId={id} entryId={income.id} label={`Retirer le revenu ${income.label}`} /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <AddIncomeForm clientId={id} /> : null}
            </CardContent>
          </Card>

          {/* Dépenses */}
          <Card>
            <CardHeader>
              <CardTitle>Dépenses</CardTitle>
              <CardDescription>{profile.expenses.length} poste{profile.expenses.length > 1 ? "s" : ""} — la catégorie « Épargne » alimente le ratio d&apos;épargne</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.expenses.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune dépense saisie.</p>
              ) : (
                <ul className="space-y-2">
                  {profile.expenses.map((expense) => (
                    <li key={expense.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {expense.label ?? EXPENSE_LABELS[expense.category]}
                        </p>
                        <p className="text-xs text-slate-500">
                          {EXPENSE_LABELS[expense.category]} · {money.format(Number(expense.amount))}{FREQUENCY_LABELS[expense.frequency]}
                        </p>
                      </div>
                      {expense.category === "SAVINGS" ? <Badge variant="success">Épargne</Badge> : null}
                      {canWrite ? <RemoveButton kind="EXPENSE" clientId={id} entryId={expense.id} label="Retirer la dépense" /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <AddExpenseForm clientId={id} /> : null}
            </CardContent>
          </Card>

          {/* Actifs */}
          <Card>
            <CardHeader>
              <CardTitle>Actifs</CardTitle>
              <CardDescription>{profile.assets.length} actif{profile.assets.length > 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.assets.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun actif saisi.</p>
              ) : (
                <ul className="space-y-2">
                  {profile.assets.map((asset) => (
                    <li key={asset.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{asset.label}</p>
                        <p className="text-xs text-slate-500">
                          {ASSET_LABELS[asset.type]}
                          {asset.institution ? ` · ${asset.institution}` : ""} · {money.format(Number(asset.value))}
                        </p>
                      </div>
                      {asset.registered ? <Badge variant="brand">Enregistré</Badge> : null}
                      {canWrite ? <RemoveButton kind="ASSET" clientId={id} entryId={asset.id} label={`Retirer l'actif ${asset.label}`} /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <AddAssetForm clientId={id} /> : null}
            </CardContent>
          </Card>

          {/* Dettes */}
          <Card>
            <CardHeader>
              <CardTitle>Dettes</CardTitle>
              <CardDescription>{profile.liabilities.length} dette{profile.liabilities.length > 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.liabilities.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune dette saisie.</p>
              ) : (
                <ul className="space-y-2">
                  {profile.liabilities.map((liability) => (
                    <li key={liability.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{liability.label}</p>
                        <p className="text-xs text-slate-500">
                          {LIABILITY_LABELS[liability.type]} · solde {money.format(Number(liability.balance))} · {money.format(Number(liability.monthlyPayment))}/mois
                          {liability.interestRate ? ` · ${Number(liability.interestRate).toLocaleString("fr-CA")} %` : ""}
                        </p>
                      </div>
                      {canWrite ? <RemoveButton kind="LIABILITY" clientId={id} entryId={liability.id} label={`Retirer la dette ${liability.label}`} /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <AddLiabilityForm clientId={id} /> : null}
            </CardContent>
          </Card>

          {/* Assurances */}
          <Card>
            <CardHeader>
              <CardTitle>Assurances</CardTitle>
              <CardDescription>{profile.insurancePolicies.length} police{profile.insurancePolicies.length > 1 ? "s" : ""}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.insurancePolicies.length === 0 ? (
                <p className="text-sm text-slate-500">Aucune police saisie.</p>
              ) : (
                <ul className="space-y-2">
                  {profile.insurancePolicies.map((policy) => (
                    <li key={policy.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">
                          Assurance {INSURANCE_LABELS[policy.type]?.toLowerCase()}
                          {policy.provider ? ` — ${policy.provider}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          Couverture {money.format(Number(policy.coverage))} · prime {money.format(Number(policy.premium))}/mois
                        </p>
                      </div>
                      {canWrite ? <RemoveButton kind="INSURANCE" clientId={id} entryId={policy.id} label="Retirer la police" /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <AddInsuranceForm clientId={id} /> : null}
            </CardContent>
          </Card>

          {/* Objectifs */}
          <Card>
            <CardHeader>
              <CardTitle>Objectifs financiers</CardTitle>
              <CardDescription>Visibles par le client dans son portail</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.financialGoals.length === 0 ? (
                <p className="text-sm text-slate-500">Aucun objectif défini.</p>
              ) : (
                <ul className="space-y-2">
                  {profile.financialGoals.map((goal) => (
                    <li key={goal.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{goal.name}</p>
                        <p className="text-xs text-slate-500">
                          Cible {money.format(Number(goal.targetAmount))}
                          {goal.targetDate ? ` · pour ${formatDate(goal.targetDate)}` : ""}
                        </p>
                      </div>
                      <Badge variant={goal.priority === "HIGH" ? "danger" : goal.priority === "LOW" ? "neutral" : "brand"}>
                        {goal.priority === "HIGH" ? "Haute" : goal.priority === "LOW" ? "Basse" : "Moyenne"}
                      </Badge>
                      {canWrite ? <RemoveButton kind="GOAL" clientId={id} entryId={goal.id} label={`Retirer l'objectif ${goal.name}`} /> : null}
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <AddGoalForm clientId={id} /> : null}
            </CardContent>
          </Card>

          {/* Retraite */}
          <Card>
            <CardHeader>
              <CardTitle>Plan de retraite</CardTitle>
              <CardDescription>Paramètres 1:1 — pondération la plus forte du FHI (15 %)</CardDescription>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <RetirementPlanForm
                  clientId={id}
                  initial={
                    profile.retirementPlan
                      ? {
                          retirementAge: profile.retirementPlan.retirementAge,
                          targetAnnualIncome: Number(profile.retirementPlan.targetAnnualIncome),
                        }
                      : null
                  }
                />
              ) : (
                <p className="text-sm text-slate-500">
                  {profile.retirementPlan
                    ? `Retraite visée à ${profile.retirementPlan.retirementAge} ans avec ${money.format(Number(profile.retirementPlan.targetAnnualIncome))}/an.`
                    : "Aucun plan de retraite enregistré."}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Fiscalité & succession */}
          <Card>
            <CardHeader>
              <CardTitle>Fiscalité &amp; succession</CardTitle>
              <CardDescription>Comptes enregistrés, testament, bénéficiaires</CardDescription>
            </CardHeader>
            <CardContent>
              {canWrite ? (
                <FinancialContextForm
                  clientId={id}
                  initial={
                    profile.financialContext
                      ? {
                          registeredAccountsUsage: profile.financialContext.registeredAccountsUsage,
                          hasWill: profile.financialContext.hasWill,
                          beneficiariesStatus: profile.financialContext.beneficiariesStatus,
                        }
                      : null
                  }
                />
              ) : (
                <p className="text-sm text-slate-500">Lecture seule pour votre rôle.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
