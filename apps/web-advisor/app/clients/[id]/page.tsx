import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { hasPermission } from "@coadvisor/auth";
import { getLatestCopilotArtifact } from "@coadvisor/ai";
import { getClient, listClientLinks, listClients } from "@coadvisor/crm";
import { getHealthDashboard } from "@coadvisor/health-engine";
import {
  AppShell,
  Avatar,
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

import { FolderLock, HeartPulse, Link2, Sparkles, Wallet } from "lucide-react";

import { Markdown } from "../../../lib/markdown";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../lib/advisor-context";
import { advisorNavFor } from "../../../lib/nav";
import { logoutAction } from "../../dashboard/actions";
import { AddFamilyMemberForm } from "./add-family-member-form";
import { ClientLinksCard } from "./client-links-card";
import { AddNoteForm } from "./add-note-form";
import { AddTaskForm } from "./add-task-form";
import { toggleTaskAction } from "../actions";
import { TaskToggleButton } from "./task-toggle";

export const metadata: Metadata = { title: "Dossier client" };

const TYPE_LABELS: Record<string, string> = { INDIVIDUAL: "Individuel", FAMILY: "Famille", CORPORATE: "Entreprise" };
const STATUS_LABELS: Record<string, string> = { PROSPECT: "Prospect", ACTIVE: "Actif", ARCHIVED: "Archivé" };
const STATUS_BADGES: Record<string, BadgeVariant> = { PROSPECT: "warning", ACTIVE: "success", ARCHIVED: "neutral" };
const ROLE_LABELS: Record<string, string> = { ADMIN: "Administrateur", ADVISOR: "Conseiller", ASSISTANT: "Assistant·e", CLIENT: "Client", COMPLIANCE_OFFICER: "Responsable conformité" };
const HOUSEHOLD_LABELS: Record<string, string> = { SPOUSE: "Conjoint·e", CHILD: "Enfant", PARENT: "Parent", DEPENDENT: "Personne à charge", OTHER: "Autre" };
const NOTE_LABELS: Record<string, string> = { MEETING: "Rencontre", PHONE: "Téléphone", EMAIL: "Courriel", OBSERVATION: "Observation", TASK: "Tâche" };
const PRIORITY_LABELS: Record<string, string> = { LOW: "Basse", MEDIUM: "Moyenne", HIGH: "Haute", URGENT: "Urgente" };
const PRIORITY_BADGES: Record<string, BadgeVariant> = { LOW: "neutral", MEDIUM: "brand", HIGH: "warning", URGENT: "danger" };
const TASK_STATUS_LABELS: Record<string, string> = { TODO: "À faire", IN_PROGRESS: "En cours", DONE: "Complétée", CANCELLED: "Annulée" };
const TASK_STATUS_BADGES: Record<string, BadgeVariant> = { TODO: "neutral", IN_PROGRESS: "brand", DONE: "success", CANCELLED: "outline" };
const TIMELINE_LABELS: Record<string, string> = { LIFE_EVENT: "Événement de vie", FINANCIAL_EVENT: "Financier", MEETING: "Rencontre", COMPLIANCE: "Conformité", DOCUMENT: "Document", GOAL: "Objectif" };

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("fr-CA", { dateStyle: "medium" });
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const client = await getClient(actor, id);
  if (!client) {
    notFound();
  }

  const { latest: latestFhi } = await getHealthDashboard(actor, id);
  const copilotSummary = await getLatestCopilotArtifact(actor, id, "SUMMARY");

  // Liens inter-clients certifiés (Sprint 7c) — navigation croisée fiche ↔ fiche.
  const certifiedLinks = await listClientLinks(actor, id);
  const linkCandidates = (await listClients(actor, { status: "ACTIVE" }))
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }));

  const canWrite = hasPermission(actor.role, "clients:write");
  const name = `${client.firstName} ${client.lastName}`;
  const openTasks = client.tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED");

  return (
    <AppShell
      currentPath="/clients"
      nav={advisorNavFor(membership)}
      user={{ name: `${user.firstName} ${user.lastName}`, email: user.email, roleLabel: ROLE_LABELS[membership.role] ?? membership.role }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title={name}
      subtitle={`Dossier client — ${TYPE_LABELS[client.type] ?? client.type}`}
    >
      <div className="space-y-6">
        {/* En-tête du dossier */}
        <Card>
          <CardContent className="flex flex-wrap items-center gap-5">
            <Avatar name={name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-slate-900">{name}</h2>
                <Badge variant="outline">{TYPE_LABELS[client.type]}</Badge>
                <Badge variant={STATUS_BADGES[client.status]}>{STATUS_LABELS[client.status]}</Badge>
                {latestFhi ? (
                  <Badge variant={latestFhi.score >= 75 ? "success" : latestFhi.score >= 60 ? "brand" : latestFhi.score >= 40 ? "warning" : "danger"}>
                    FHI {latestFhi.score}/100
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {client.email ?? "—"} · {client.phone ?? "—"} · Né·e le {formatDate(client.birthDate)}
              </p>
              <p className="text-xs text-slate-400">Dossier créé le {formatDate(client.createdAt)}</p>
              {certifiedLinks.length > 0 ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <Link2 className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
                  Lié à{" "}
                  {certifiedLinks.map((l, i) => (
                    <span key={l.id} className="inline-flex items-center gap-1">
                      {i > 0 ? <span aria-hidden="true">·</span> : null}
                      <Link
                        href={`/clients/${l.otherClientId}`}
                        data-testid={`header-link-nav-${l.otherClientId}`}
                        className="font-medium text-brand-700 underline-offset-2 hover:underline"
                      >
                        {l.otherClientName}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/clients/${client.id}/finances`}>
                  <Button variant="secondary" size="sm">
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                    Données financières
                  </Button>
                </Link>
                <Link href={`/clients/${client.id}/sante`}>
                  <Button variant="secondary" size="sm">
                    <HeartPulse className="h-4 w-4" aria-hidden="true" />
                    Santé financière
                  </Button>
                </Link>
                <Link href={`/clients/${client.id}/copilot`}>
                  <Button variant="secondary" size="sm">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Copilot
                  </Button>
                </Link>
                <Link href={`/clients/${client.id}/documents`}>
                  <Button variant="secondary" size="sm">
                    <FolderLock className="h-4 w-4" aria-hidden="true" />
                    Coffre documentaire
                  </Button>
                </Link>
              </div>
            </div>
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-xl font-semibold text-slate-900">{client.notes.length}</p>
                <p className="text-xs text-slate-500">Notes</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">{openTasks.length}</p>
                <p className="text-xs text-slate-500">Tâches ouvertes</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900">{client.familyMembers.length}</p>
                <p className="text-xs text-slate-500">Famille</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Colonne principale */}
          <div className="space-y-6 lg:col-span-2">
            {/* Copilot — résumé instantané (Sprint 5) */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-500" aria-hidden="true" />
                  <CardTitle>Copilot — résumé du dossier</CardTitle>
                </div>
                <CardDescription>
                  Portrait instantané généré par l&apos;assistante — à valider
                </CardDescription>
              </CardHeader>
              <CardContent>
                {copilotSummary ? (
                  <div className="space-y-3">
                    <div className="max-h-56 overflow-hidden">
                      <Markdown
                        text={copilotSummary.content.split("\n").slice(0, 10).join("\n")}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-400">
                        {copilotSummary.provider === "codex-bridge"
                          ? "codex-bridge"
                          : "composer local"}
                        {" · "}
                        {copilotSummary.createdAt.toLocaleDateString("fr-CA", { dateStyle: "medium" })}
                      </p>
                      <Link href={`/clients/${client.id}/copilot`}>
                        <Button variant="secondary" size="sm">
                          <Sparkles className="h-4 w-4" aria-hidden="true" />
                          Ouvrir le Copilot
                        </Button>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-slate-500">
                      Aucun résumé généré — l&apos;assistante peut préparer un
                      portrait instantané du dossier.
                    </p>
                    <Link href={`/clients/${client.id}/copilot`}>
                      <Button variant="secondary" size="sm">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        Générer le premier résumé
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
                <CardDescription>Journal professionnel — toute entrée est auditée</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canWrite ? <AddNoteForm clientId={client.id} /> : null}
                {client.notes.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune note pour le moment.</p>
                ) : (
                  <ul className="space-y-3">
                    {client.notes.map((note) => (
                      <li key={note.id} className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-slate-500">
                            {note.author.firstName} {note.author.lastName} ·{" "}
                            {note.createdAt.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                          <Badge variant="neutral">{NOTE_LABELS[note.type]}</Badge>
                        </div>
                        <p className="mt-1.5 whitespace-pre-line text-sm text-slate-700">{note.content}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Tâches */}
            <Card>
              <CardHeader>
                <CardTitle>Tâches</CardTitle>
                <CardDescription>{openTasks.length} ouverte{openTasks.length > 1 ? "s" : ""}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {canWrite ? <AddTaskForm clientId={client.id} /> : null}
                {client.tasks.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune tâche planifiée.</p>
                ) : (
                  <ul className="space-y-2">
                    {client.tasks.map((task) => {
                      const done = task.status === "DONE";
                      return (
                        <li key={task.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3.5 py-2.5">
                          {canWrite ? (
                            <TaskToggleButton
                              clientId={client.id}
                              taskId={task.id}
                              done={done}
                              action={toggleTaskAction.bind(null, client.id, task.id, done ? "TODO" : "DONE")}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm font-medium ${done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                              {task.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              Échéance : {formatDate(task.dueDate)}
                            </p>
                          </div>
                          <Badge variant={PRIORITY_BADGES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
                          <Badge variant={TASK_STATUS_BADGES[task.status]}>{TASK_STATUS_LABELS[task.status]}</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Colonne latérale */}
          <div className="space-y-6">
            {/* Famille */}
            <Card>
              <CardHeader>
                <CardTitle>Famille</CardTitle>
                <CardDescription>Entourage financier du client</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {client.familyMembers.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun membre enregistré.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {client.familyMembers.map((member) => (
                      <li key={member.id} className="flex items-center gap-3">
                        <Avatar name={`${member.firstName} ${member.lastName}`} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {member.firstName} {member.lastName}
                          </p>
                          <p className="text-xs text-slate-500">{HOUSEHOLD_LABELS[member.role]}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {canWrite ? <AddFamilyMemberForm clientId={client.id} /> : null}
              </CardContent>
            </Card>

            {/* Liens inter-clients certifiés (Sprint 7c) */}
            <Card>
              <CardHeader>
                <CardTitle>Liens certifiés</CardTitle>
                <CardDescription>
                  Fiches reliées par le conseiller — navigation croisée
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ClientLinksCard
                  clientId={client.id}
                  links={certifiedLinks}
                  candidates={linkCandidates}
                  canWrite={canWrite}
                />
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Chronologie</CardTitle>
                <CardDescription>Financial Life OS — historique préservé</CardDescription>
              </CardHeader>
              <CardContent>
                {client.timelineEvents.length === 0 ? (
                  <EmptyState title="Aucun événement" description="Les événements de vie et financiers du client s'afficheront ici." />
                ) : (
                  <ul className="relative space-y-4 border-l border-slate-200 pl-4">
                    {client.timelineEvents.map((event) => (
                      <li key={event.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500" aria-hidden="true" />
                        <p className="text-xs font-medium text-slate-400">
                          {formatDate(event.eventDate)} · {TIMELINE_LABELS[event.eventType]}
                        </p>
                        <p className="text-sm font-medium text-slate-800">{event.title}</p>
                        {event.description ? (
                          <p className="text-sm text-slate-500">{event.description}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
