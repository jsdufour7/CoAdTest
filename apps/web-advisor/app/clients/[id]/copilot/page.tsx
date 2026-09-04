import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  ArrowLeft,
  CalendarCheck,
  FileText,
  HeartPulse,
  Lightbulb,
  NotebookPen,
  Printer,
  Wallet,
} from "lucide-react";

import {
  getCopilotRoutingState,
  getLatestCopilotArtifact,
  listCopilotArtifacts,
} from "@coadvisor/ai";
import { hasPermission } from "@coadvisor/auth";
import { getClient } from "@coadvisor/crm";
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
} from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";
import { Markdown } from "../../../../lib/markdown";
import { advisorNavFor } from "../../../../lib/nav";
import { logoutAction } from "../../../dashboard/actions";
import { SavePrepButton } from "./save-prep-button";
import { BridgeTester } from "./bridge-tester";
import { GenerateButton } from "./generate-button";
import { CreateTaskFromSuggestionButton } from "./suggestion-task-button";

export const metadata: Metadata = { title: "Copilot" };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur",
  ADVISOR: "Conseiller",
  ASSISTANT: "Assistant·e",
  CLIENT: "Client",
  COMPLIANCE_OFFICER: "Responsable conformité",
};

const KIND_LABELS: Record<string, string> = {
  SUMMARY: "Résumé",
  MEETING_PREP: "Préparation rencontre",
  SUGGESTIONS: "Suggestions",
  CLIENT_REPORT: "Bilan client",
};

const PROVIDER_BADGES: Record<string, BadgeVariant> = {
  "codex-bridge": "success",
  "local-composer": "neutral",
};

function formatDateTime(date: Date): string {
  return date.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

function ProviderBadge({ provider, fellBack }: { provider: string; fellBack: boolean }) {
  return (
    <Badge variant={PROVIDER_BADGES[provider] ?? "outline"}>
      {provider === "codex-bridge"
        ? "codex-bridge"
        : fellBack
          ? "composer local (secours)"
          : "composer local"}
    </Badge>
  );
}

export default async function CopilotPage({
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

  const canWrite = hasPermission(actor.role, "clients:write");
  const name = `${client.firstName} ${client.lastName}`;
  const routing = getCopilotRoutingState();

  const [summary, prep, suggestions, report, history] = await Promise.all([
    getLatestCopilotArtifact(actor, id, "SUMMARY"),
    getLatestCopilotArtifact(actor, id, "MEETING_PREP"),
    getLatestCopilotArtifact(actor, id, "SUGGESTIONS"),
    getLatestCopilotArtifact(actor, id, "CLIENT_REPORT"),
    listCopilotArtifacts(actor, id),
  ]);

  const suggestionItems =
    (suggestions?.structured as { suggestions?: Array<{ title: string; rationale: string; category: string }> } | null)
      ?.suggestions ?? [];

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
      title="Copilot"
      subtitle={`Advisor Intelligence pour ${name} — résumés, préparations, suggestions`}
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
          <Link href={`/clients/${id}/finances`}>
            <Button variant="ghost" size="sm">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Données financières
            </Button>
          </Link>
          <Link href={`/clients/${id}/sante`}>
            <Button variant="ghost" size="sm">
              <HeartPulse className="h-4 w-4" aria-hidden="true" />
              Santé financière
            </Button>
          </Link>
        </div>

        {/* Disclosure + routage provider */}
        <Card>
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
              <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                <span className="font-medium">Moteur actif :</span>
                {routing.bridgeConfigured ? (
                  <Badge variant="success">codex-bridge (passerelle locale)</Badge>
                ) : (
                  <Badge variant="neutral">composer local (secours)</Badge>
                )}
              </p>
              <p className="max-w-2xl text-xs text-slate-500">
                IA assistive — jamais de conseil automatisé. Tout texte généré
                est <strong>à valider par le conseiller</strong> avant usage et
                n&apos;est jamais montré tel quel au client via le portail. Les
                appels à la passerelle partent du serveur CoAdvisor uniquement
                (URL et clé jamais exposées au navigateur).
              </p>
            </div>
            <BridgeTester />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Résumé de dossier */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-brand-500" aria-hidden="true" />
                <CardTitle>Résumé du dossier</CardTitle>
              </div>
              <CardDescription>
                Portrait instantané pour reprendre le fil en 30 secondes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {summary ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <ProviderBadge provider={summary.provider} fellBack={summary.fellBack} />
                    <span>
                      Généré le {formatDateTime(summary.createdAt)}
                      {summary.latencyMs !== null ? ` · ${summary.latencyMs} ms` : ""}
                    </span>
                  </div>
                  <Markdown text={summary.content} />
                </>
              ) : (
                <EmptyState
                  title="Aucun résumé généré"
                  description="Générez le premier résumé structuré du dossier en un clic."
                />
              )}
              {canWrite ? (
                <GenerateButton clientId={id} kind="SUMMARY" label="le résumé" regenerate={summary !== null} />
              ) : null}
            </CardContent>
          </Card>

          {/* Préparation de rencontre */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-brand-500" aria-hidden="true" />
                <CardTitle>Préparation de rencontre</CardTitle>
              </div>
              <CardDescription>
                Brief structuré avant chaque rendez-vous client
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {prep ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <ProviderBadge provider={prep.provider} fellBack={prep.fellBack} />
                    <span>Générée le {formatDateTime(prep.createdAt)}</span>
                  </div>
                  <Markdown text={prep.content} />
                  {canWrite ? (
                    <SavePrepButton clientId={id} artifactId={prep.id} />
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="Aucune préparation générée"
                  description="Ordre du jour, chiffres repères et questions à poser — en un clic."
                />
              )}
              {canWrite ? (
                <GenerateButton clientId={id} kind="MEETING_PREP" label="la préparation" regenerate={prep !== null} />
              ) : null}
            </CardContent>
          </Card>

          {/* Suggestions */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" aria-hidden="true" />
                <CardTitle>Suggestions</CardTitle>
              </div>
              <CardDescription>
                Actions proposées à partir des données — vous décidez
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {suggestions && suggestionItems.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <ProviderBadge provider={suggestions.provider} fellBack={suggestions.fellBack} />
                    <span>Générées le {formatDateTime(suggestions.createdAt)}</span>
                  </div>
                  <ul className="space-y-2.5">
                    {suggestionItems.map((suggestion, index) => (
                      <li
                        key={index}
                        className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3"
                      >
                        <p className="text-sm font-medium text-slate-800">{suggestion.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{suggestion.rationale}</p>
                        {canWrite ? (
                          <div className="mt-2">
                            <CreateTaskFromSuggestionButton
                              clientId={id}
                              title={suggestion.title}
                              rationale={suggestion.rationale}
                            />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : suggestions ? (
                <Markdown text={suggestions.content} />
              ) : (
                <EmptyState
                  title="Aucune suggestion générée"
                  description="L'assistante analyse le dossier et propose les prochaines actions pertinentes."
                />
              )}
              {canWrite ? (
                <GenerateButton clientId={id} kind="SUGGESTIONS" label="les suggestions" regenerate={suggestions !== null} />
              ) : null}
            </CardContent>
          </Card>

          {/* Bilan client */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-brand-500" aria-hidden="true" />
                <CardTitle>Bilan client</CardTitle>
              </div>
              <CardDescription>
                Rapport imprimable à remettre au client (FR-AI-001)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {report ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <ProviderBadge provider={report.provider} fellBack={report.fellBack} />
                    <span>Généré le {formatDateTime(report.createdAt)}</span>
                  </div>
                  <Alert variant="success">
                    Le bilan est prêt — ouvrez la version imprimable, validez-la,
                    puis imprimez ou copiez-la pour votre client.
                  </Alert>
                  <Link href={`/clients/${id}/copilot/bilan`}>
                    <Button variant="secondary" size="sm">
                      <Printer className="h-4 w-4" aria-hidden="true" />
                      Ouvrir la version imprimable
                    </Button>
                  </Link>
                </>
              ) : (
                <EmptyState
                  title="Aucun bilan généré"
                  description="Un bilan vulgarisé de santé financière, prêt à imprimer pour votre client."
                />
              )}
              {canWrite ? (
                <GenerateButton clientId={id} kind="CLIENT_REPORT" label="le bilan" regenerate={report !== null} />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Historique des artefacts */}
        <Card>
          <CardHeader>
            <CardTitle>Historique du Copilot</CardTitle>
            <CardDescription>
              Artefacts immuables — chaque génération est horodatée, auditée et
              garde sa provenance (provider, modèle)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Aucun artefact généré pour ce dossier.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Date</th>
                      <th className="pb-2 pr-4 font-medium">Type</th>
                      <th className="pb-2 pr-4 font-medium">Provider</th>
                      <th className="pb-2 pr-4 font-medium">Modèle</th>
                      <th className="pb-2 font-medium">Latence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((artifact) => (
                      <tr key={artifact.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 pr-4 text-slate-600">{formatDateTime(artifact.createdAt)}</td>
                        <td className="py-2.5 pr-4 font-medium text-slate-800">{KIND_LABELS[artifact.kind]}</td>
                        <td className="py-2.5 pr-4">
                          <ProviderBadge provider={artifact.provider} fellBack={artifact.fellBack} />
                        </td>
                        <td className="py-2.5 pr-4 text-slate-500">{artifact.model}</td>
                        <td className="py-2.5 text-slate-500">
                          {artifact.latencyMs !== null ? `${artifact.latencyMs} ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
