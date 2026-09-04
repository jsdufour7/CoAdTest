import Link from "next/link";
import type { Metadata } from "next";

import { hasPermission } from "@coadvisor/auth";
import { listAuditLogs } from "@coadvisor/core-platform";
import { listClients } from "@coadvisor/crm";
import type { AuditLog } from "@coadvisor/database";
import {
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  nativeSelectClass,
  TextField,
} from "@coadvisor/ui";

import { Database, Download, FileJson, ListFilter, ShieldCheck } from "lucide-react";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../lib/advisor-context";
import { advisorNavFor } from "../../../lib/nav";
import { logoutAction } from "../../dashboard/actions";

export const metadata: Metadata = { title: "Conformité" };

const PERIODS = [
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" },
  { value: "all", label: "Tout l'historique" },
] as const;

const ENTITY_SUGGESTIONS = [
  "Document",
  "DocumentShare",
  "DocumentSignature",
  "Client",
  "Lead",
  "AdvisorPublicProfile",
  "AuditLog",
  "Tenant",
  "User",
];

function periodCutoff(period: string): Date | undefined {
  if (period === "all") return undefined;
  const days = Number(period) || 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const ACTION_BADGES: Array<[prefix: string, variant: Parameters<typeof Badge>[0]["variant"]]> = [
  ["documents.signature", "success"],
  ["documents.file.deleted", "danger"],
  ["documents.share.revoked", "danger"],
  ["compliance.", "brand"],
  ["marketplace.", "brand"],
  ["notification.email.failed", "warning"],
];

function actionVariant(action: string): Parameters<typeof Badge>[0]["variant"] {
  for (const [prefix, variant] of ACTION_BADGES) {
    if (action.startsWith(prefix)) return variant;
  }
  return "neutral";
}

export default async function ConformitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);

  const allowed = hasPermission(actor.role, "compliance:read");
  const canAudit = hasPermission(actor.role, "audit:read");

  const action = typeof params.action === "string" ? params.action : "";
  const entityType = typeof params.entityType === "string" ? params.entityType : "";
  const period = typeof params.period === "string" ? params.period : "30";

  const filters = {
    action: action || undefined,
    entityType: entityType || undefined,
    from: periodCutoff(period),
  };

  const logs: AuditLog[] = allowed && canAudit
    ? await listAuditLogs(actor, actor.tenantId, { ...filters, limit: 200 })
    : [];
  const clients = allowed ? await listClients(actor, { limit: 100 }) : [];

  const exportQuery = new URLSearchParams();
  if (action) exportQuery.set("action", action);
  if (entityType) exportQuery.set("entityType", entityType);
  exportQuery.set("period", period);

  return (
    <AppShell
      currentPath="/parametres/conformite"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: membership.role === "ADMIN" ? "Administrateur" : membership.role === "COMPLIANCE_OFFICER" ? "Responsable conformité" : membership.role,
      }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Conformité"
      subtitle="Journal immuable du cabinet, export des données (Loi 25) — tout accès à cette page est lui-même journalisé."
    >
      {!allowed || !canAudit ? (
        <Alert variant="warning">
          <strong>Accès réservé.</strong> Cette page exige la permission «
          conformité » (rôles Administrateur ou Responsable conformité). Votre
          consultation de cette page a été tentée avec le rôle {membership.role}.
        </Alert>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  <CardTitle className="text-base">Export du journal d'audit</CardTitle>
                </div>
                <CardDescription>
                  CSV (UTF-8, ouvrable dans Excel) avec les mêmes filtres que le
                  tableau ci-dessous — borné à 2 000 lignes. L'export est
                  consigné au journal.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a href={`/parametres/conformite/export.csv?${exportQuery.toString()}`}>
                  <Button variant="secondary" size="sm">
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Exporter le journal filtré (CSV)
                  </Button>
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <FileJson className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  <CardTitle className="text-base">Export données d'un client (Loi 25)</CardTitle>
                </div>
                <CardDescription>
                  JSON complet du dossier : profil, finances granulaires, notes,
                  tâches, chronologie, historique FHI, artefacts Copilot et
                  métadonnées du coffre. Audité + tracé à la chronologie du dossier.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form method="get" action="/parametres/conformite/exporter" className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <label htmlFor="clientId" className="block text-sm font-medium text-slate-700">
                      Dossier à exporter
                    </label>
                    <select id="clientId" name="clientId" className={nativeSelectClass()} required>
                      <option value="">Choisir un client…</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.firstName} {client.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" variant="secondary" size="sm">
                    <Database className="h-4 w-4" aria-hidden="true" />
                    Exporter (JSON)
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ListFilter className="h-4 w-4 text-brand-600" aria-hidden="true" />
                <CardTitle className="text-base">Journal d'audit — filtres</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <form method="get" className="grid gap-3 sm:grid-cols-4">
                <TextField
                  id="action"
                  label="Action contient"
                  name="action"
                  defaultValue={action}
                  placeholder="documents."
                />
                <div className="space-y-1.5">
                  <label htmlFor="entityType" className="block text-sm font-medium text-slate-700">
                    Entité
                  </label>
                  <select id="entityType" name="entityType" className={nativeSelectClass()} defaultValue={entityType}>
                    <option value="">Toutes</option>
                    {ENTITY_SUGGESTIONS.map((entity) => (
                      <option key={entity} value={entity}>
                        {entity}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="period" className="block text-sm font-medium text-slate-700">
                    Période
                  </label>
                  <select id="period" name="period" className={nativeSelectClass()} defaultValue={period}>
                    {PERIODS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                    Appliquer
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
                <CardTitle className="text-base">
                  {logs.length} entrée{logs.length > 1 ? "s" : ""} (200 maximum affichées)
                </CardTitle>
              </div>
              <CardDescription>
                Le journal est INSERT-only en base : même l'administrateur ne
                peut ni le modifier ni l'élaguer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />}
                  title="Aucune entrée pour ces filtres"
                  description="Élargissez la période ou retirez des filtres."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Horodatage</th>
                        <th className="pb-2 pr-3 font-medium">Action</th>
                        <th className="pb-2 pr-3 font-medium">Entité</th>
                        <th className="pb-2 pr-3 font-medium">Détails (métadonnées)</th>
                        <th className="pb-2 font-medium">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {logs.map((log) => (
                        <tr key={log.id} className="align-top">
                          <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                            {log.createdAt.toLocaleString("fr-CA", {
                              dateStyle: "short",
                              timeStyle: "medium",
                            })}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant={actionVariant(log.action)}>{log.action}</Badge>
                          </td>
                          <td className="py-2 pr-3 text-slate-600">
                            {log.entityType}
                            {log.entityId ? (
                              <span className="block max-w-32 truncate text-[10px] text-slate-400" title={log.entityId}>
                                {log.entityId}
                              </span>
                            ) : null}
                          </td>
                          <td className="max-w-md py-2 pr-3 font-mono text-[10px] leading-relaxed text-slate-500">
                            <span className="line-clamp-3 break-all">
                              {log.newData !== null ? JSON.stringify(log.newData) : "—"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2 text-slate-400">{log.ipAddress ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
