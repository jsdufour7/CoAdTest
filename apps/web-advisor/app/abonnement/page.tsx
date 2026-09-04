import type { Metadata } from "next";
import Link from "next/link";

import {
  BadgeCheck,
  CreditCard,
  MailWarning,
  ShieldCheck,
  Users,
} from "lucide-react";

import {
  BILLING_PLANS,
  formatCad,
  getBillingOverview,
  PLAN_ORDER,
  planRank,
} from "@coadvisor/billing";
import type { BillingPlan } from "@coadvisor/billing";
import { AppShell, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../lib/advisor-context";
import { InviteMemberForm } from "../dashboard/invite-member-form";
import { logoutAction } from "../dashboard/actions";
import { advisorNavFor } from "../../lib/nav";
import {
  cancelRenewalAction,
  choosePlanAction,
  resumeRenewalAction,
  setSeatsExtraAction,
} from "./actions";

export const metadata: Metadata = { title: "Abonnement" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Adjoint",
};

/** Jauge d'usage (« 2 / 10 », « ∞ » si illimité). */
function UsageGauge(props: {
  label: string;
  used: number;
  limit: number | null;
  unit?: string;
  testId: string;
}) {
  const unlimited = props.limit === null;
  const limit = props.limit ?? 0;
  const ratio = unlimited ? 0 : limit > 0 ? Math.min(1, props.used / limit) : 1;
  const danger = !unlimited && ratio >= 0.9;
  return (
    <div data-testid={props.testId}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{props.label}</span>
        <span className={danger ? "font-semibold text-red-600" : "text-slate-500"}>
          {props.used.toLocaleString("fr-CA")}
          {unlimited ? " / ∞" : ` / ${props.limit!.toLocaleString("fr-CA")}`}
          {props.unit ? ` ${props.unit}` : ""}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${danger ? "bg-red-500" : "bg-brand-500"}`}
          style={{ width: unlimited ? "12%" : `${Math.max(4, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const overview = await getBillingOverview(actor);
  const plan = overview.plan;
  const isAdmin = membership.role === "ADMIN";

  const periodEnd = new Date(overview.periodEnd).toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const gib = 1024 ** 3;
  const storageUsed = +(overview.usage.vaultBytes / gib).toFixed(2);
  const storageLimit = overview.plan.limits.vaultBytesMax
    ? overview.plan.limits.vaultBytesMax / gib
    : null;

  return (
    <AppShell
      currentPath="/abonnement"
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
      title="Abonnement"
      subtitle="Palier, usage, sièges et factures du cabinet"
    >
      <div className="space-y-8">
        {/* Bandeaux d'état */}
        {params.checkout === "succes" ? (
          <div
            data-testid="banner-checkout-succes"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            Paiement accepté — votre nouveau palier est actif et la facture
            est disponible ci-dessous.
          </div>
        ) : null}
        {params.checkout === "annule" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Paiement abandonné — aucun changement appliqué à votre palier.
          </div>
        ) : null}
        {params.plan_change ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Palier ajusté — effet immédiat, sans facture pour une baisse de
            palier.
          </div>
        ) : null}
        {params.erreur ? (
          <div
            data-testid="banner-erreur"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {decodeURIComponent(params.erreur)}
          </div>
        ) : null}
        {overview.routing.provider === "SIMULATOR" ? (
          <div
            data-testid="badge-simulateur"
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800"
          >
            <strong>Mode simulateur de paiement</strong> — aucune vraie carte
            n'est débitée. Dès que les clés Stripe seront configurées
            (STRIPE_SECRET_KEY), le paiement passera par le portail Stripe.
          </div>
        ) : null}

        {/* Palier courant + jauges */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card data-testid="plan-courant">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-brand-600" />
                  Palier {plan.name}
                </span>
                <div className="flex items-center gap-2">
                  {overview.status === "ACTIVE" ? (
                    <Badge variant="success">Actif</Badge>
                  ) : (
                    <Badge variant="warning">{overview.status}</Badge>
                  )}
                  {overview.cancelAtPeriodEnd ? (
                    <Badge variant="warning">Fin le {periodEnd}</Badge>
                  ) : null}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <p className="text-2xl font-semibold text-slate-900">
                {plan.priceCentsPerMonth === 0
                  ? "Gratuit"
                  : `${formatCad(plan.priceCentsPerMonth)} / mois`}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  + taxes
                </span>
              </p>
              <p>{plan.tagline}</p>
              <p className="text-xs text-slate-400">
                {plan.priceCentsPerMonth === 0
                  ? "Aucune période de facturation (palier gratuit)."
                  : overview.cancelAtPeriodEnd
                    ? `Le palier restera actif jusqu'au ${periodEnd}, puis repassera en Découverte.`
                    : `Prochain renouvellement le ${periodEnd}.`}
              </p>
              {overview.cancelAtPeriodEnd ? (
                <form action={resumeRenewalAction}>
                  <Button type="submit" variant="secondary" size="sm">
                    Reprendre le renouvellement
                  </Button>
                </form>
              ) : plan.priceCentsPerMonth > 0 ? (
                <form action={cancelRenewalAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    Annuler le renouvellement
                  </Button>
                </form>
              ) : null}
            </CardContent>
          </Card>

          <Card data-testid="jauges-usage">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
                Usage du mois et plafonds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <UsageGauge
                label="Dossiers clients actifs"
                used={overview.usage.clientsActive}
                limit={plan.limits.clientsMax}
                testId="jauge-clients"
              />
              <UsageGauge
                label="Coffre chiffré"
                used={storageUsed}
                limit={storageLimit}
                unit="Go"
                testId="jauge-coffre"
              />
              <UsageGauge
                label="Enveloppes de signature (mois civil)"
                used={overview.usage.envelopesThisMonth}
                limit={plan.limits.envelopesPerMonthMax}
                testId="jauge-enveloppes"
              />
              <UsageGauge
                label="Sièges"
                used={overview.usage.seatsUsed}
                limit={plan.limits.seatsIncluded + overview.seatsExtra}
                testId="jauge-sieges"
              />
            </CardContent>
          </Card>
        </div>

        {/* Paliers */}
        <section aria-labelledby="paliers">
          <h2 id="paliers" className="text-lg font-semibold text-slate-900">
            Choisir un palier
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Prix par mois, CAD, taxes (TPS 5 % · TVQ 9,975 %) calculées à la
            facturation. Changement de palier immédiat — la facturation
            mensuelle s'aligne au cycle suivant.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PLAN_ORDER.map((code) => {
              const candidate: BillingPlan = BILLING_PLANS[code];
              const current = candidate.code === plan.code;
              const upgrade = planRank(candidate.code) > planRank(plan.code);
              return (
                <Card
                  key={code}
                  data-testid={`plan-${code}`}
                  className={
                    candidate.recommended
                      ? "border-brand-300 ring-1 ring-brand-200"
                      : undefined
                  }
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      {candidate.name}
                      {candidate.recommended ? (
                        <Badge variant="brand">Recommandé</Badge>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex h-full flex-col gap-3">
                    <p className="text-xl font-semibold text-slate-900">
                      {candidate.priceCentsPerMonth === 0
                        ? "0 $"
                        : `${formatCad(candidate.priceCentsPerMonth)}`}
                      <span className="text-sm font-normal text-slate-500">
                        {" "}
                        / mois + tx
                      </span>
                    </p>
                    <p className="text-sm text-slate-500">{candidate.tagline}</p>
                    <ul className="flex-1 space-y-1.5 text-sm text-slate-600">
                      {candidate.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <form action={choosePlanAction}>
                      <input type="hidden" name="plan" value={code} />
                      <Button
                        type="submit"
                        size="sm"
                        variant={current ? "ghost" : upgrade ? "primary" : "secondary"}
                        disabled={current || !isAdmin}
                        data-testid={`cta-${code}`}
                        className="w-full"
                      >
                        {current
                          ? "Palier actuel"
                          : upgrade
                            ? `Passer à ${candidate.name}`
                            : `Revenir à ${candidate.name}`}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {!isAdmin ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <MailWarning className="h-3.5 w-3.5" />
              Seul un administrateur du cabinet peut modifier le palier.
            </p>
          ) : null}
        </section>

        {/* Sièges + factures */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card data-testid="portee-sieges">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-brand-600" />
                Équipe ({overview.usage.seatsUsed} siège
                {overview.usage.seatsUsed > 1 ? "s" : ""} occupé
                {overview.usage.seatsUsed > 1 ? "s" : ""})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="divide-y divide-slate-100 text-sm">
                {overview.members.map((member) => (
                  <li
                    key={member.membershipId}
                    className="flex items-center justify-between py-2"
                    data-testid={`member-${member.email}`}
                  >
                    <span>
                      <span className="font-medium text-slate-800">
                        {member.fullName}
                      </span>
                      <span className="ml-2 text-slate-500">{member.email}</span>
                    </span>
                    <Badge variant="neutral">
                      {ROLE_LABELS[member.role] ?? member.role}
                    </Badge>
                  </li>
                ))}
              </ul>
              {plan.limits.extraSeatCentsPerMonth > 0 && isAdmin ? (
                <form
                  action={setSeatsExtraAction}
                  className="flex items-end gap-2"
                  data-testid="form-sieges-extra"
                >
                  <label className="text-sm text-slate-600">
                    Sièges additionnels ({formatCad(plan.limits.extraSeatCentsPerMonth)} /mois)
                    <input
                      type="number"
                      name="seatsExtra"
                      min={0}
                      max={50}
                      defaultValue={overview.seatsExtra}
                      className="mt-1 block w-24 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <Button type="submit" size="sm" variant="secondary">
                    Ajuster
                  </Button>
                </form>
              ) : null}
              {isAdmin ? <InviteMemberForm /> : null}
            </CardContent>
          </Card>

          <Card data-testid="factures">
            <CardHeader>
              <CardTitle>Factures</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.invoices.length === 0 ? (
                <p
                  className="text-sm text-slate-500"
                  data-testid="factures-vides"
                >
                  Aucune facture pour l'instant — elles apparaîtront au premier
                  paiement.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {overview.invoices.map((invoice) => (
                    <li
                      key={invoice.id}
                      className="flex items-center justify-between py-2"
                      data-testid={`invoice-${invoice.number}`}
                    >
                      <span>
                        <span className="font-medium text-slate-800">
                          {invoice.number}
                        </span>
                        <span className="ml-2 text-slate-500">
                          {new Date(invoice.issuedAt).toLocaleDateString("fr-CA")}
                          {` — Palier ${
                            BILLING_PLANS[
                              invoice.planCode as keyof typeof BILLING_PLANS
                            ]?.name ?? invoice.planCode
                          }`}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge
                          variant={invoice.status === "PAID" ? "success" : "warning"}
                        >
                          {invoice.status === "PAID" ? "Payée" : invoice.status}
                        </Badge>
                        <span className="font-medium">
                          {formatCad(invoice.amountCents)}
                        </span>
                        <a
                          href={`/abonnement/factures/${invoice.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-700 hover:underline"
                          data-testid={`invoice-pdf-${invoice.number}`}
                        >
                          PDF
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-slate-400">
          Moteur de facturation {overview.engineVersion} · aucune carte
          complète n'est stockée chez CoAdvisor (les paiements réels transitent
          par Stripe).
        </p>
      </div>
    </AppShell>
  );
}
