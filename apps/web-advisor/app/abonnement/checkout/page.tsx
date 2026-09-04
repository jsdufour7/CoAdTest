import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FlaskConical, Lock } from "lucide-react";

import { computeInvoiceAmounts, formatCad, getPlan } from "@coadvisor/billing";
import { AppShell, Card, CardContent, CardHeader, CardTitle } from "@coadvisor/ui";

import { requireAdvisorContext } from "../../../lib/advisor-context";
import { advisorNavFor } from "../../../lib/nav";
import { logoutAction } from "../../dashboard/actions";
import { SimCheckoutForm } from "./sim-checkout-form";

export const metadata: Metadata = { title: "Paiement simulé" };

/**
 * « Page hébergée » du SIMULATEUR de paiement (Sprint 8, ADR-013) :
 * même posture qu'un checkout Stripe (résumé + carte), mais locale —
 * aucune vraie carte n'est débitée, la carte de test 4242… est exigée.
 */
export default async function CheckoutSimulePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; session?: string; sieges?: string }>;
}) {
  const params = await searchParams;
  const { user, membership } = await requireAdvisorContext();
  const plan = getPlan(params.plan ?? "");
  if (!plan || plan.code === "decouverte" || plan.priceCentsPerMonth === 0) {
    redirect("/abonnement");
  }
  const seatsExtra = Math.max(0, Number(params.sieges ?? "0") || 0);
  const amounts = computeInvoiceAmounts(plan, seatsExtra);

  return (
    <AppShell
      currentPath="/abonnement"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: membership.role,
      }}
      planLabel="Paiement"
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Finaliser le changement de palier"
      subtitle={`Souscription au palier ${plan.name}`}
    >
      <div
        data-testid="checkout-simulateur"
        className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-5 w-5 text-indigo-600" />
              Simulateur Stripe — environnement de test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              Cette page joue le rôle du checkout hébergé. <strong>Aucune
              vraie carte n'est débitée</strong> : utilisez la carte de test
              ci-dessous (le simulateur refuse tout autre numéro).
            </p>
            <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
              4242 4242 4242 4242 · 12/30 · CVC 123
            </div>
            <p className="text-xs text-slate-400">
              Dès que STRIPE_SECRET_KEY sera configurée sur le serveur, ce
              parcours redirigera vers le vrai portail Stripe (Checkout).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Palier {plan.name} — {formatCad(plan.priceCentsPerMonth)} / mois
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {amounts.lines.map((line) => (
              <div key={line.description} className="flex justify-between text-slate-600">
                <span>{line.description}</span>
                <span>{formatCad(line.totalCents)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-100 pt-2 text-slate-500">
              <span>TPS (5 %)</span>
              <span>{formatCad(amounts.tpsCents)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>TVQ (9,975 %)</span>
              <span>{formatCad(amounts.tvqCents)}</span>
            </div>
            <div
              className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900"
              data-testid="checkout-total"
            >
              <span>Total mensuel</span>
              <span>{formatCad(amounts.totalCents)} CAD</span>
            </div>
            <SimCheckoutForm planCode={plan.code} seatsExtra={seatsExtra} />
            <p className="flex items-center gap-1.5 pt-2 text-xs text-slate-400">
              <Lock className="h-3.5 w-3.5" />
              Aucun numéro de carte complet n'est conservé — seuls les 4
              derniers chiffres figurent au journal d'audit.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
