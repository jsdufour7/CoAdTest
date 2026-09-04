import type { Metadata } from "next";
import Link from "next/link";

import { Cloud, DatabaseBackup, HardDrive, ShieldCheck } from "lucide-react";

import {
  getBackupRoutingState,
  listBackupRuns,
} from "@coadvisor/documents";
import { AppShell, Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../lib/advisor-context";
import { advisorNavFor } from "../../../lib/nav";
import { logoutAction } from "../../dashboard/actions";
import { runBackupAction } from "./actions";

export const metadata: Metadata = { title: "Sauvegardes" };

/**
 * Console Ops des sauvegardes (Sprint 8, ADR-015) : réservée au tenant
 * OPÉRATEUR (équipe fondatrice). Réplica locale + S3 région Canada,
 * manifeste sha256 et vérification à destination à chaque cycle.
 */
export default async function SauvegardesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const routing = getBackupRoutingState();
  const operatorSlug = process.env.PLATFORM_TENANT_SLUG?.trim() || "twodots";
  const allowed = membership.role === "ADMIN" && tenant?.slug === operatorSlug;
  const runs = allowed ? await listBackupRuns(actor, 20) : [];

  return (
    <AppShell
      currentPath="/parametres/sauvegardes"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: membership.role,
      }}
      tenantName={tenant?.name}
      planLabel="Ops plateforme"
      linkComponent={Link}
      logoutAction={logoutAction}
      title="Sauvegardes du coffre"
      subtitle="Réplication des blobs chiffrés — réplica locale + S3 région Canada"
    >
      <div className="space-y-6">
        {params.ran === "ok" ? (
          <div
            data-testid="banner-backup-ok"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            Sauvegarde terminée et <strong>vérifiée</strong> (empreintes
            sha256 conformes à destination).
          </div>
        ) : null}
        {params.ran === "ko" ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            La sauvegarde a échoué — consultez la ligne du registre
            ci-dessous pour le détail.
          </div>
        ) : null}
        {params.erreur ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {decodeURIComponent(params.erreur)}
          </div>
        ) : null}

        {!allowed ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-slate-500">
              La console des sauvegardes est réservée à l'équipe fondatrice
              (tenant opérateur « {operatorSlug} », rôle administrateur).
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <HardDrive className="h-4 w-4 text-brand-600" />
                    Coffre (source)
                  </CardTitle>
                </CardHeader>
                <CardContent className="break-all font-mono text-xs text-slate-600">
                  {routing.storageDir}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <DatabaseBackup className="h-4 w-4 text-brand-600" />
                    Réplica locale
                  </CardTitle>
                </CardHeader>
                <CardContent className="break-all font-mono text-xs text-slate-600">
                  {routing.replicaDir}
                </CardContent>
              </Card>
              <Card data-testid="etat-s3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Cloud className="h-4 w-4 text-brand-600" />
                    S3 région Canada
                    {routing.s3.configured ? (
                      <Badge variant="success">Configuré</Badge>
                    ) : (
                      <Badge variant="neutral">Prêt à câbler</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-slate-600">
                  <p>Région : {routing.s3.region}</p>
                  <p>Endpoint : {routing.s3.endpointHost}</p>
                  <p>
                    {routing.s3.configured
                      ? `Compartiment : ${routing.s3.bucket} · préfixe ${routing.s3.prefix}`
                      : "Renseignez S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY pour activer la réplication (AWS ca-central-1, OVH BHS ou MinIO)."}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  Registre des exécutions
                  <form action={runBackupAction}>
                    <Button type="submit" size="sm" data-testid="run-backup">
                      Lancer une sauvegarde maintenant
                    </Button>
                  </form>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? (
                  <p className="text-sm text-slate-500" data-testid="runs-vides">
                    Aucune exécution pour l'instant — lancez la première, ou
                    planifiez « pnpm backup:run » en cron.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm" data-testid="runs-liste">
                    {runs.map((run) => (
                      <li key={run.id} className="py-2.5" data-testid={`run-${run.status.toLowerCase()}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <Badge variant={run.status === "VERIFIED" ? "success" : "danger"}>
                              {run.status === "VERIFIED" ? "Vérifiée" : "Échouée"}
                            </Badge>
                            <span className="text-slate-700">
                              {new Date(run.startedAt).toLocaleString("fr-CA")}
                            </span>
                            <Badge variant="outline">
                              {run.trigger === "MANUAL" ? "Manuelle" : "Planifiée"}
                            </Badge>
                            <Badge variant="brand">
                              {run.destination === "BOTH"
                                ? "Réplica + S3"
                                : run.destination === "S3"
                                  ? "S3"
                                  : "Réplica locale"}
                            </Badge>
                          </span>
                          <span className="text-xs text-slate-500">
                            {run.blobCount} blobs · {run.copiedCount} copiés ·{" "}
                            {(run.bytesTotal / (1024 * 1024)).toLocaleString("fr-CA", { maximumFractionDigits: 2 })} Mo
                            · {run.durationMs} ms
                          </span>
                        </div>
                        {run.manifestSha256 ? (
                          <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                            manifeste sha256 : {run.manifestSha256}
                          </p>
                        ) : null}
                        {run.error ? (
                          <p className="mt-1 text-xs text-red-600">{run.error}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <p className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Les blobs répliqués restent chiffrés (AES-256-GCM) — la clé
              maîtresse ne quitte jamais le serveur. Moteur {routing.engineVersion}.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
