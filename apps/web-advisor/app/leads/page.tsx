import Link from "next/link";
import type { Metadata } from "next";

import { Inbox } from "lucide-react";

import { hasPermission } from "@coadvisor/auth";
import { listLeads } from "@coadvisor/fnae";
import {
  AppShell,
  Badge,
  Card,
  CardContent,
  EmptyState,
  nativeSelectClass,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../lib/advisor-context";
import { advisorNavFor } from "../../lib/nav";
import { logoutAction } from "../dashboard/actions";

export const metadata: Metadata = { title: "Leads" };

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

const SOURCE_LABELS: Record<string, string> = {
  marketplace: "Questionnaire public",
  referral: "Référence cabinet",
  annuaire: "Annuaire public",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

type LeadStatus = "NEW" | "CONTACTED" | "CONVERTED" | "DISMISSED";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user, membership, actor } = await requireAdvisorContext();
  const { status } = await searchParams;
  const tenant = await getTenantSummary(actor);

  const canRead = hasPermission(actor.role, "leads:read");
  const leads = canRead
    ? await listLeads(actor, { status: status as LeadStatus | undefined })
    : [];

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
      title="Leads"
      subtitle={`${leads.length} demande${leads.length > 1 ? "s" : ""} reçue${leads.length > 1 ? "s" : ""}`}
    >
      <div className="space-y-6">
        {/* Filtre */}
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <select
            name="status"
            defaultValue={status ?? ""}
            className={nativeSelectClass("w-52")}
            aria-label="Statut"
          >
            <option value="">Tous les statuts</option>
            <option value="NEW">Nouveau</option>
            <option value="CONTACTED">Pris en charge</option>
            <option value="CONVERTED">Converti</option>
            <option value="DISMISSED">Écarté</option>
          </select>
        </form>

        <Card>
          <CardContent className="px-0 py-2">
            {leads.length === 0 ? (
              <div className="px-6 py-6">
                <EmptyState
                  icon={<Inbox />}
                  title="Aucun lead pour le moment"
                  description="Les visiteurs qui demandent à être contactés après leur analyse financière gratuite apparaîtront ici (consentement Loi 25 vérifié)."
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <li key={lead.id}>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">
                          {lead.firstName} {lead.lastName}
                        </p>
                        <p className="truncate text-sm text-slate-500">
                          {lead.email}
                        </p>
                      </div>
                      <span className="hidden text-xs text-slate-400 sm:block">
                        {SOURCE_LABELS[lead.source] ?? lead.source} ·{" "}
                        {lead.createdAt.toLocaleDateString("fr-CA", {
                          dateStyle: "medium",
                        })}
                      </span>
                      <Badge variant={STATUS_BADGES[lead.status] ?? "neutral"}>
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
