import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { hasPermission } from "@coadvisor/auth";
import { getClient } from "@coadvisor/crm";
import { listMembers } from "@coadvisor/core-platform";
import {
  getStorageRoutingState,
  listClientDocuments,
  listSignatureTemplates,
  sweepSignatureEnvelopes,
} from "@coadvisor/documents";
import { listPortalLinksForClient } from "@coadvisor/health-engine";
import {
  Alert,
  AppShell,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@coadvisor/ui";

import {
  ArrowLeft,
  FileOutput,
  FolderLock,
  ListChecks,
  PenLine,
  ShieldCheck,
  Upload,
} from "lucide-react";

import {
  getTenantSummary,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";
import { advisorNavFor } from "../../../../lib/nav";
import { logoutAction } from "../../../dashboard/actions";
import { ReportButtons } from "./report-buttons";
import { DocumentRow } from "./document-row";
import { UploadForm } from "./upload-form";

export const metadata: Metadata = { title: "Coffre documentaire" };

export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, membership, actor } = await requireAdvisorContext();
  const tenant = await getTenantSummary(actor);
  const client = await getClient(actor, id);
  if (!client) notFound();

  if (!hasPermission(actor.role, "documents:read")) {
    notFound();
  }
  const canWrite = hasPermission(actor.role, "documents:write");

  // Balayage au passage : échéances dépassées → expirées, relances 72 h.
  // Best-effort — un échec ici ne doit jamais empêcher la lecture du coffre.
  await sweepSignatureEnvelopes(actor).catch(() => ({
    expired: 0,
    reminded: 0,
  }));

  const [rows, portalLinks, templates] = await Promise.all([
    listClientDocuments(actor, id),
    listPortalLinksForClient(actor, id),
    listSignatureTemplates(actor),
  ]);
  const members = hasPermission(actor.role, "members:read")
    ? await listMembers(actor, actor.tenantId)
    : [];

  // Signataires proposables dans l'assistant d'enveloppe (Sprint 7b) :
  // liens portail ACTIFS du dossier (couple…) + membres actifs du cabinet.
  const portalSigners = portalLinks
    .filter(
      (link) =>
        link.status === "ACTIVE" && link.userId !== null && link.userName,
    )
    .map((link) => ({
      userId: link.userId as string,
      fullName: link.userName as string,
      email: link.userEmail ?? "",
    }));
  const staffSigners = members
    .filter((member) => member.status === "ACTIVE")
    .map((member) => ({
      userId: member.userId,
      fullName:
        `${member.user.firstName} ${member.user.lastName}`.trim() ||
        member.user.email,
    }));
  const storage = getStorageRoutingState();
  const name = `${client.firstName} ${client.lastName}`;

  return (
    <AppShell
      currentPath="/clients"
      nav={advisorNavFor(membership)}
      user={{
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        roleLabel: membership.role === "ADMIN" ? "Administrateur" : membership.role === "ADVISOR" ? "Conseiller" : membership.role,
      }}
      tenantName={tenant?.name}
      planLabel={tenant ? `Plan ${tenant.subscriptionPlan}` : undefined}
      linkComponent={Link}
      logoutAction={logoutAction}
      title={`Coffre — ${name}`}
      subtitle="Pièces chiffrées au repos, intégrité prouvée, partages et signatures horodatées."
    >
      <div className="space-y-6">
        <Link
          href={`/clients/${id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour au dossier
        </Link>

        {!storage.masterKeyConfigured ? (
          <Alert variant="warning">
            <strong>Coffre non chiffré.</strong> Aucun dépôt ne sera possible
            tant que <code>DOCUMENTS_MASTER_KEY</code> n'est pas définie dans{" "}
            <code>.env</code> (<code>openssl rand -base64 32</code>), puis
            redémarrez l'application. Aucun fichier n'est jamais laissé en
            clair : sans clé, le coffre refuse simplement le dépôt.
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-brand-600" aria-hidden="true" />
              <CardTitle>Coffre documentaire</CardTitle>
            </div>
            <CardDescription>
              Chiffrement AES-256-GCM en continu ({storage.provider} ·{" "}
              {storage.version}). Chaque pièce porte l'empreinte SHA-256 de son
              contenu — vérifiable à tout moment. Rien n'est supprimé sans
              trace : retraits, partages et téléchargements sont journalisés.
            </CardDescription>
          </CardHeader>
        </Card>

        {canWrite ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-brand-600" aria-hidden="true" />
                <CardTitle className="text-base">Déposer une pièce</CardTitle>
              </div>
              <CardDescription>
                50 Mo maximum — tout type sauf exécutables (le contenu est
                analysé par signature binaire, pas seulement par extension).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadForm clientId={id} />
            </CardContent>
          </Card>
        ) : null}

        {canWrite ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileOutput className="h-4 w-4 text-brand-600" aria-hidden="true" />
                <CardTitle className="text-base">Générer un rapport</CardTitle>
              </div>
              <CardDescription>
                PDF serveur déposé au coffre (catégorie Rapport). Le bilan FHI
                exige un calcul déjà effectué dans « Santé financière » ; le
                bilan Copilot exige un bilan déjà généré dans « Copilot ».
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReportButtons clientId={id} />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-brand-600" aria-hidden="true" />
              <CardTitle className="text-base">
                Pièces au coffre — {rows.length}
              </CardTitle>
              <PenLine className="ml-auto h-4 w-4 text-slate-300" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <EmptyState
                icon={<FolderLock className="h-6 w-6" aria-hidden="true" />}
                title="Le coffre est vide"
                description="Déposez une première pièce ci-dessus ou générez un rapport — tout est chiffré et journalisé."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <DocumentRow
                    key={row.document.id}
                    clientId={id}
                    canWrite={canWrite}
                    currentUserId={user.userId}
                    currentUserName={`${user.firstName} ${user.lastName}`}
                    document={row.document}
                    envelopes={row.signatures}
                    shares={row.shares}
                    activeShareCount={row.activeShareCount}
                    isSignedCopy={row.isSignedCopy}
                    portalSigners={portalSigners}
                    staffSigners={staffSigners}
                    templates={templates.map((template) => ({
                      id: template.id,
                      name: template.name,
                      fields: template.fields,
                    }))}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
