import Link from "next/link";
import type { Metadata } from "next";

import { Activity, Inbox, ScrollText, ShieldCheck, Users } from "lucide-react";

import { hasPermission } from "@coadvisor/auth";
import { listAuditLogs, listMembers } from "@coadvisor/core-platform";
import { countClients } from "@coadvisor/crm";
import { countNewLeads } from "@coadvisor/fnae";
import {
  AppShell,
  Avatar,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";
import type { UserStatus } from "@coadvisor/types";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../lib/advisor-context";
import { advisorNavFor } from "../../lib/nav";
import { logoutAction } from "./actions";
import { InviteMemberForm } from "./invite-member-form";

export const metadata: Metadata = { title: "Tableau de bord" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

const ROLE_BADGES: Record<string, BadgeVariant> = {
  ADMIN: "brand",
  ADVISOR: "outline",
  ASSISTANT: "outline",
  CLIENT: "neutral",
  COMPLIANCE_OFFICER: "warning",
};

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Actif",
  INVITED: "Invité",
  SUSPENDED: "Suspendu",
};

const STATUS_BADGES: Record<UserStatus, BadgeVariant> = {
  ACTIVE: "success",
  INVITED: "warning",
  SUSPENDED: "danger",
};

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className="truncate text-xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
          {hint ? (
            <p className="truncate text-xs text-slate-400">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const { user, membership, actor } = await requireAdvisorContext();

  const tenant = await getTenantSummary(actor);

  const members = await listMembers(actor, membership.tenantId);
  const canAudit = hasPermission(actor.role, "audit:read");
  const auditLogs = canAudit
    ? await listAuditLogs(actor, membership.tenantId, 8)
    : [];
  const canInvite = hasPermission(actor.role, "members:invite");
  const canReadClients = hasPermission(actor.role, "clients:read");
  const clientCount = canReadClients ? await countClients(actor) : null;
  const canReadLeads = hasPermission(actor.role, "leads:read");
  const newLeadCount = canReadLeads ? await countNewLeads(actor) : null;

  const activeCount = members.filter((m) => m.status === "ACTIVE").length;
  const fullName = `${user.firstName} ${user.lastName}`;
  const roleLabel = ROLE_LABELS[membership.role] ?? membership.role;

  return (
    <AppShell
      currentPath="/dashboard"
      nav={advisorNavFor(membership)}
      user={{ name: fullName, email: user.email, roleLabel }}
      tenantName={tenant?.name}
      planLabel={`Plan ${tenant?.subscriptionPlan ?? "free"}`}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Tableau de bord"
      subtitle={tenant?.name}
    >
      <div className="space-y-6">
        {/* Indicateurs clés */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiCard
            label="Membres de l'équipe"
            value={String(members.length)}
            hint={`${activeCount} actif${activeCount > 1 ? "s" : ""}`}
            icon={<Users />}
          />
          <KpiCard
            label="Clients suivis"
            value={clientCount === null ? "—" : String(clientCount)}
            hint={
              clientCount === null
                ? "Permission requise"
                : "Dossiers actifs et prospects"
            }
            icon={<Activity />}
          />
          <KpiCard
            label="Leads entrants"
            value={newLeadCount === null ? "—" : String(newLeadCount)}
            hint={
              newLeadCount === null
                ? "Permission requise"
                : "Analyse publique — Sprint 3"
            }
            icon={<Inbox />}
          />
          <KpiCard
            label="Isolation des données"
            value="RLS active"
            hint="PostgreSQL Row-Level Security"
            icon={<ShieldCheck />}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Membres */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>Équipe</CardTitle>
              <CardDescription>
                Rôles et statuts des membres du cabinet
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-6 py-2 font-medium">Membre</th>
                    <th className="py-2 pr-4 font-medium">Rôle</th>
                    <th className="py-2 pr-6 font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const name = `${member.user.firstName} ${member.user.lastName}`;
                    return (
                      <tr
                        key={member.id}
                        className="border-b border-slate-50 last:border-0"
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={name} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-800">
                                {name}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {member.user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant={ROLE_BADGES[member.role] ?? "neutral"}>
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        </td>
                        <td className="py-3 pr-6">
                          <Badge
                            variant={
                              STATUS_BADGES[member.status as UserStatus] ??
                              "neutral"
                            }
                          >
                            {STATUS_LABELS[member.status as UserStatus] ??
                              member.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Invitation */}
          <div className="lg:col-span-2">
            {canInvite ? (
              <Card>
                <CardHeader>
                  <CardTitle>Inviter un membre</CardTitle>
                  <CardDescription>
                    Conseiller, assistant·e ou responsable conformité
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <InviteMemberForm />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Votre rôle</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={ROLE_BADGES[membership.role] ?? "neutral"}>
                    {roleLabel}
                  </Badge>
                  <p className="mt-3 text-sm text-slate-500">
                    L&apos;invitation de membres est réservée aux
                    administrateurs.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Journal d'audit */}
        {canAudit ? (
          <Card>
            <CardHeader>
              <CardTitle>Journal d&apos;audit</CardTitle>
              <CardDescription>
                Traçabilité Loi 25 / LPRPDE — entrées immuables, plus récentes
                d&apos;abord
              </CardDescription>
            </CardHeader>
            <CardContent>
              {auditLogs.length === 0 ? (
                <EmptyState
                  icon={<ScrollText />}
                  title="Aucune entrée pour le moment"
                  description="Chaque modification sensible du cabinet sera consignée ici, de façon immuable."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <li
                      key={log.id}
                      className="flex items-center justify-between gap-4 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500"
                          aria-hidden="true"
                        />
                        <p className="min-w-0 truncate text-sm">
                          <span className="font-medium text-slate-800">
                            {log.action}
                          </span>{" "}
                          <span className="text-slate-500">
                            {log.entityType}
                            {log.entityId
                              ? ` · ${log.entityId.slice(0, 8)}…`
                              : ""}
                          </span>
                        </p>
                      </div>
                      <time className="shrink-0 text-xs text-slate-400">
                        {log.createdAt.toLocaleString("fr-CA", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
