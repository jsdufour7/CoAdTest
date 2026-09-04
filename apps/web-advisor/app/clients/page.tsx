import Link from "next/link";
import type { Metadata } from "next";

import { UserPlus, Users } from "lucide-react";

import { hasPermission } from "@coadvisor/auth";
import { listClients } from "@coadvisor/crm";
import {
  AppShell,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  nativeSelectClass,
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../lib/advisor-context";
import { advisorNavFor } from "../../lib/nav";
import { logoutAction } from "../dashboard/actions";

export const metadata: Metadata = { title: "Clients" };

const TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individuel",
  FAMILY: "Famille",
  CORPORATE: "Entreprise",
};

const STATUS_LABELS: Record<string, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Actif",
  ARCHIVED: "Archivé",
};

const STATUS_BADGES: Record<string, BadgeVariant> = {
  PROSPECT: "warning",
  ACTIVE: "success",
  ARCHIVED: "neutral",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { user, membership, actor } = await requireAdvisorContext();
  const { q, status } = await searchParams;
  const tenant = await getTenantSummary(actor);

  const canWrite = hasPermission(actor.role, "clients:write");
  const clients = await listClients(actor, {
    query: q,
    status: status as "PROSPECT" | "ACTIVE" | "ARCHIVED" | undefined,
  });

  const fullName = `${user.firstName} ${user.lastName}`;
  const roleLabel = ROLE_LABELS[membership.role] ?? membership.role;

  return (
    <AppShell
      currentPath="/clients"
      nav={advisorNavFor(membership)}
      user={{ name: fullName, email: user.email, roleLabel }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Clients"
      subtitle={`${clients.length} dossier${clients.length > 1 ? "s" : ""}`}
      actions={
        canWrite ? (
          <Link href="/clients/nouveau">
            <Button size="sm">
              <UserPlus className="h-4 w-4" />
              Nouveau client
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Recherche */}
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Rechercher (nom, courriel)…"
              aria-label="Rechercher"
            />
          </div>
          <select
            name="status"
            defaultValue={status ?? ""}
            className={nativeSelectClass("w-44")}
            aria-label="Statut"
          >
            <option value="">Tous les statuts</option>
            <option value="ACTIVE">Actif</option>
            <option value="PROSPECT">Prospect</option>
            <option value="ARCHIVED">Archivé</option>
          </select>
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </form>

        {/* Liste */}
        <Card>
          <CardContent className="px-0 py-2">
            {clients.length === 0 ? (
              <div className="px-6 py-6">
                <EmptyState
                  icon={<Users />}
                  title={q ? "Aucun client trouvé" : "Aucun client pour le moment"}
                  description={
                    q
                      ? `Aucun dossier ne correspond à « ${q} ».`
                      : "Créez votre premier dossier client pour commencer à bâtir votre portefeuille."
                  }
                  action={
                    canWrite && !q ? (
                      <Link href="/clients/nouveau">
                        <Button size="sm">
                          <UserPlus className="h-4 w-4" />
                          Nouveau client
                        </Button>
                      </Link>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {clients.map((client) => {
                  const name = `${client.firstName} ${client.lastName}`;
                  return (
                    <li key={client.id}>
                      <Link
                        href={`/clients/${client.id}`}
                        className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-slate-50"
                      >
                        <Avatar name={name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">
                            {name}
                          </p>
                          <p className="truncate text-sm text-slate-500">
                            {client.email ?? client.phone ?? "—"}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {TYPE_LABELS[client.type] ?? client.type}
                        </Badge>
                        <Badge
                          variant={STATUS_BADGES[client.status] ?? "neutral"}
                        >
                          {STATUS_LABELS[client.status] ?? client.status}
                        </Badge>
                        <span className="hidden w-28 text-right text-xs text-slate-400 sm:block">
                          {client._count.tasks > 0
                            ? `${client._count.tasks} tâche${client._count.tasks > 1 ? "s" : ""} · `
                            : ""}
                          {client._count.notes} note{client._count.notes > 1 ? "s" : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
