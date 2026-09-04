import Link from "next/link";
import type { Metadata } from "next";

import { FileSignature } from "lucide-react";

import { listSignatureDesk } from "@coadvisor/documents";
import { AppShell, EmptyState } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../lib/advisor-context";
import { advisorNavFor } from "../../lib/nav";
import { logoutAction } from "../dashboard/actions";
import {
  DeskHistoryRow,
  DeskInFlightRow,
  DeskMyPendingCard,
} from "./desk-rows";

export const metadata: Metadata = { title: "Signatures" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

/**
 * Console Signatures du cabinet (Sprint 7c — correctif 5) : mes
 * contre-signatures à faire, suivi des demandes en circulation,
 * historique des rondes closes (télécharger / nouvel envoi).
 */
export default async function SignaturesPage() {
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const desk = await listSignatureDesk(actor);

  const fullName = `${user.firstName} ${user.lastName}`;
  const empty =
    desk.myPending.length === 0 &&
    desk.inFlight.length === 0 &&
    desk.history.length === 0;

  return (
    <AppShell
      currentPath="/signatures"
      nav={advisorNavFor(membership)}
      user={{ name: fullName, email: user.email, roleLabel: ROLE_LABELS[membership.role] ?? membership.role }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Signatures"
      subtitle="Enveloppes, contre-signatures et preuves du cabinet"
    >
      {empty ? (
        <EmptyState
          icon={<FileSignature className="text-brand-500" />}
          title="Aucune signature en circulation"
          description="Demandez une signature depuis le coffre d'un client (pièce PDF → « Nouvelle enveloppe… ») — le suivi apparaîtra ici."
          action={
            <Link href="/clients">
              <span className="text-sm font-medium text-brand-700 hover:underline">
                Ouvrir la liste des clients
              </span>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="desk-my" data-testid="desk-my-pending">
            <h2
              id="desk-my"
              className="mb-2 text-sm font-semibold tracking-tight text-slate-900"
            >
              À signer par moi ({desk.myPending.length})
            </h2>
            {desk.myPending.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Rien en attente de votre main — belle journée.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {desk.myPending.map((item) => (
                  <DeskMyPendingCard key={item.envelopeId} item={item} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="desk-flight" data-testid="desk-in-flight">
            <h2
              id="desk-flight"
              className="mb-2 text-sm font-semibold tracking-tight text-slate-900"
            >
              Signatures en circulation ({desk.inFlight.length})
            </h2>
            {desk.inFlight.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Aucune enveloppe ouverte pour le moment.
              </p>
            ) : (
              <ul className="space-y-2">
                {desk.inFlight.map((item) => (
                  <DeskInFlightRow key={item.envelopeId} item={item} />
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="desk-history" data-testid="desk-history">
            <h2
              id="desk-history"
              className="mb-2 text-sm font-semibold tracking-tight text-slate-900"
            >
              Historique des rondes closes ({desk.history.length})
            </h2>
            {desk.history.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                Les rondes terminées (signées, refusées, annulées, expirées)
                s'archiveront ici avec leur certificat.
              </p>
            ) : (
              <ul className="space-y-2">
                {desk.history.map((item) => (
                  <DeskHistoryRow key={item.envelopeId} item={item} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
