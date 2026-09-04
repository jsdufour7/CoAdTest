"use client";

import { useActionState, useState, useTransition } from "react";

import {
  BadgeCheck,
  Bell,
  Copy,
  Download,
  FileSignature,
  FileText,
  Link2,
  PenLine,
  Share2,
  Trash2,
  X,
} from "lucide-react";

import { Alert, Badge, Button, Input } from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";
import {
  DOCUMENT_CATEGORY_LABELS,
  formatBytes,
  SIGNATURE_STATUS_LABELS,
  SIGNER_KIND_LABELS,
  SIGNER_STATUS_LABELS,
  SIGNING_MODE_LABELS,
  type VaultDocumentSummary,
} from "@coadvisor/documents/labels";

import {
  cancelEnvelopeAction,
  createLinkShareAction,
  deleteDocumentAction,
  remindEnvelopeAction,
  resendEnvelopeAction,
  revokeShareAction,
  shareToPortalAction,
  type VaultMutationState,
} from "./actions";
import {
  EnvelopeWizard,
  ExternalLinksNotice,
  type PortalSignerOption,
  type StaffSignerOption,
  type TemplateOption,
} from "./envelope-wizard";

export interface EnvelopeSignerRow {
  id: string;
  kind: "PORTAL_USER" | "STAFF" | "EXTERNAL";
  userId?: string | null;
  email: string;
  fullName: string;
  sortOrder: number;
  status: "PENDING" | "SIGNED" | "DECLINED";
  signedAt: Date | null;
  declineReason: string | null;
  /** Dossier client derrière un signataire portail (puce cliquable 7c). */
  clientId?: string | null;
  /** Ligne de contre-signature du membre connecté. */
  isMe?: boolean;
}

export interface EnvelopeRow {
  id: string;
  status:
    | "REQUESTED"
    | "PARTIALLY_SIGNED"
    | "SIGNED"
    | "DECLINED"
    | "EXPIRED"
    | "CANCELLED";
  signingMode: "SEQUENTIAL" | "PARALLEL";
  requestedAt: Date;
  expiresAt: Date | null;
  reminderCount: number;
  signedDocumentId: string | null;
  signers: EnvelopeSignerRow[];
}

interface ShareRow {
  id: string;
  channel: "PORTAL" | "LINK";
  expiresAt: Date | null;
  revokedAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
  createdAt: Date;
}

const ENVELOPE_BADGES: Record<EnvelopeRow["status"], BadgeVariant> = {
  REQUESTED: "warning",
  PARTIALLY_SIGNED: "warning",
  SIGNED: "success",
  DECLINED: "danger",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
};

const SIGNER_BADGES: Record<EnvelopeSignerRow["status"], BadgeVariant> = {
  PENDING: "warning",
  SIGNED: "success",
  DECLINED: "danger",
};

const SIGNER_DOT_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#0891b2",
] as const;

const ACTIVE_STATUSES = new Set(["REQUESTED", "PARTIALLY_SIGNED"]);

/** Ligne d'une pièce du coffre + panneaux d'actions (partage, enveloppes, retrait). */
export function DocumentRow({
  clientId,
  canWrite,
  currentUserId,
  document,
  envelopes,
  shares,
  activeShareCount,
  isSignedCopy = false,
  portalSigners,
  staffSigners,
  templates,
}: {
  clientId: string;
  canWrite: boolean;
  currentUserId: string;
  /** Conservé pour compatibilité d'appel (contre-signature dédiée 7c). */
  currentUserName?: string;
  document: VaultDocumentSummary & { id: string };
  envelopes: EnvelopeRow[];
  shares: ShareRow[];
  activeShareCount: number;
  isSignedCopy?: boolean;
  portalSigners: PortalSignerOption[];
  staffSigners: StaffSignerOption[];
  templates: TemplateOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [externalLinks, setExternalLinks] = useState<Array<{
    email: string;
    fullName: string;
    url: string;
  }> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const run = (action: Promise<VaultMutationState>) => {
    startTransition(async () => {
      const result = await action;
      if (result.error) {
        setError(result.error);
        setNotice(null);
      } else {
        setError(null);
        setNotice(result.success ?? null);
        if (result.externalLinks && result.externalLinks.length > 0) {
          setExternalLinks(result.externalLinks);
        }
      }
      setConfirmDelete(false);
    });
  };

  const latest = envelopes[0] ?? null;
  const hasActive = envelopes.some((envelope) =>
    ACTIVE_STATUSES.has(envelope.status),
  );
  const hasSigned = envelopes.some(
    (envelope) => envelope.status === "SIGNED",
  );
  const myStaffLines = envelopes.flatMap((envelope) =>
    ACTIVE_STATUSES.has(envelope.status)
      ? envelope.signers
          .filter(
            (signer) =>
              signer.kind === "STAFF" &&
              signer.status === "PENDING" &&
              signer.userId === currentUserId,
          )
          .map((signer) => ({ envelope, signer }))
      : [],
  );
  const canRequest =
    canWrite &&
    document.mimeType === "application/pdf" &&
    !hasActive &&
    !hasSigned;

  return (
    <li className="py-3.5" data-testid={`document-row-${document.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">
              {document.label}
            </p>
            <Badge variant="outline">
              {DOCUMENT_CATEGORY_LABELS[document.category] ?? document.category}
            </Badge>
            {/* Badge d'état À CÔTÉ de la pièce (jamais dans son nom). */}
            {isSignedCopy ? (
              <Badge variant="success" data-testid="certified-copy-badge">
                <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                Copie certifiée
              </Badge>
            ) : null}
            {latest ? (
              <Badge
                variant={ENVELOPE_BADGES[latest.status]}
                data-testid="envelope-badge"
              >
                {latest.status === "SIGNED" ? (
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                ) : null}
                {SIGNATURE_STATUS_LABELS[latest.status]}
              </Badge>
            ) : null}
            {activeShareCount > 0 ? (
              <Badge variant="brand">
                {activeShareCount} partage{activeShareCount > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatBytes(document.sizeBytes)} · déposée le{" "}
            {new Date(document.createdAt).toLocaleDateString("fr-CA", {
              dateStyle: "medium",
            })}{" "}
            · empreinte{" "}
            <code
              className="rounded bg-slate-100 px-1 text-[10px] text-slate-600"
              title={document.sha256}
            >
              SHA-256 …{document.sha256.slice(-12)}
            </code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={`/clients/${clientId}/documents/${document.id}/telecharger`}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Télécharger
          </a>
        </div>
      </div>

      {/* Contre-signature du membre connecté — dédiée « ouvrir et signer ». */}
      {myStaffLines.map(({ envelope, signer }) => (
        <StaffSignNotice
          key={signer.id}
          envelope={envelope}
          signer={signer}
        />
      ))}

      {canWrite ? (
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* Partage */}
          <details className="group min-w-0 rounded-lg border border-slate-200 bg-slate-50/60">
            <summary className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              <Share2 className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
              Partager
            </summary>
            <div className="space-y-2 border-t border-slate-200 p-3">
              <SharePanel
                clientId={clientId}
                documentId={document.id}
                run={run}
                pending={pending}
              />
              {shares.filter((s) => s.revokedAt === null).length > 0 ? (
                <ul className="space-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                  {shares
                    .filter((s) => s.revokedAt === null)
                    .map((share) => (
                      <li
                        key={share.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span>
                          {share.channel === "PORTAL"
                            ? "Portail"
                            : `Lien (échéance ${
                                share.expiresAt
                                  ? new Date(share.expiresAt).toLocaleDateString(
                                      "fr-CA",
                                    )
                                  : "—"
                              })`}
                          {share.accessCount > 0
                            ? ` · ${share.accessCount} accès`
                            : ""}
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(revokeShareAction(clientId, share.id))}
                          className="text-red-600 hover:underline disabled:opacity-50"
                        >
                          Révoquer
                        </button>
                      </li>
                    ))}
                </ul>
              ) : null}
            </div>
          </details>

          {/* Enveloppes de signature */}
          <details
            className="group min-w-0 rounded-lg border border-slate-200 bg-slate-50/60"
            open={envelopes.length > 0 && !hasSigned}
          >
            <summary className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
              <PenLine className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
              Signature{envelopes.length > 0 ? ` (${envelopes.length})` : ""}
            </summary>
            <div className="space-y-2.5 border-t border-slate-200 p-3">
              {envelopes.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Aucune enveloppe pour cette pièce.
                </p>
              ) : (
                <ul className="space-y-2">
                  {envelopes.map((envelope) => (
                    <EnvelopePanel
                      key={envelope.id}
                      clientId={clientId}
                      envelope={envelope}
                      run={run}
                      pending={pending}
                    />
                  ))}
                </ul>
              )}
              {canRequest ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setWizardOpen((open) => !open)}
                  data-testid="open-envelope-wizard"
                >
                  <FileSignature className="h-3.5 w-3.5" aria-hidden="true" />
                  Nouvelle enveloppe…
                </Button>
              ) : null}
            </div>
          </details>

          {/* Copie(s) close(s) — signée(s) OU constatant un refus (7c). */}
          {envelopes.some(
            (envelope) =>
              (envelope.status === "SIGNED" ||
                envelope.status === "DECLINED") &&
              envelope.signedDocumentId,
          ) ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Copie close avec certificat
              </p>
              {envelopes
                .filter(
                  (envelope) =>
                    (envelope.status === "SIGNED" ||
                      envelope.status === "DECLINED") &&
                    envelope.signedDocumentId,
                )
                .map((envelope) => (
                  <a
                    key={envelope.id}
                    href={`/clients/${clientId}/documents/${envelope.signedDocumentId}/telecharger`}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                    data-testid="signed-copy-link"
                  >
                    <Download className="h-3 w-3" aria-hidden="true" />
                    {envelope.status === "SIGNED"
                      ? "PDF signé + certificat"
                      : "PDF constatant le refus + certificat"}{" "}
                    ({envelope.signers.length} signataire
                    {envelope.signers.length > 1 ? "s" : ""})
                  </a>
                ))}
            </div>
          ) : null}

          {/* Retrait */}
          <div className="flex min-w-0 items-center justify-end">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Retirer
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px]">
                <span className="font-medium text-red-700">
                  Confirmer le retrait ?
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(deleteDocumentAction(clientId, document.id))}
                  className="font-semibold text-red-700 hover:underline disabled:opacity-50"
                >
                  Oui, retirer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-slate-500 hover:underline"
                  aria-label="Annuler"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
        </div>
      ) : null}

      {wizardOpen && canRequest ? (
        <div className="mt-3">
          <EnvelopeWizard
            clientId={clientId}
            documentId={document.id}
            documentLabel={document.label}
            portalSigners={portalSigners}
            staffSigners={staffSigners}
            templates={templates}
            onDone={(state) => {
              if (state.error) {
                setError(state.error);
                setNotice(null);
              } else {
                setError(null);
                setNotice(state.success ?? null);
                if (state.externalLinks && state.externalLinks.length > 0) {
                  setExternalLinks(state.externalLinks);
                }
                setWizardOpen(false);
              }
            }}
          />
        </div>
      ) : null}

      {externalLinks && externalLinks.length > 0 ? (
        <div className="mt-2">
          <ExternalLinksNotice links={externalLinks} />
        </div>
      ) : null}
      {notice ? (
        <Alert variant="success" className="mt-2 py-2 text-xs">
          {notice}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="error" className="mt-2 py-2 text-xs">
          {error}
        </Alert>
      ) : null}
    </li>
  );
}

function EnvelopePanel({
  clientId,
  envelope,
  run,
  pending,
}: {
  clientId: string;
  envelope: EnvelopeRow;
  run: (action: Promise<VaultMutationState>) => void;
  pending: boolean;
}) {
  const active = ACTIVE_STATUSES.has(envelope.status);
  return (
    <li
      className="space-y-1.5 rounded-md border border-slate-200 bg-white p-2.5"
      data-testid={`envelope-${envelope.id}`}
    >
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant={ENVELOPE_BADGES[envelope.status]}>
          {SIGNATURE_STATUS_LABELS[envelope.status]}
        </Badge>
        <span className="text-slate-500">
          {SIGNING_MODE_LABELS[envelope.signingMode]}
        </span>
        <span className="text-slate-400">
          · envoyée le{" "}
          {new Date(envelope.requestedAt).toLocaleDateString("fr-CA")}
        </span>
        {envelope.expiresAt && active ? (
          <span className="text-slate-400">
            · échéance{" "}
            {new Date(envelope.expiresAt).toLocaleDateString("fr-CA")}
          </span>
        ) : null}
      </div>
      <ul className="space-y-1">
        {envelope.signers.map((signer, index) => (
          <li
            key={signer.id}
            className="flex flex-wrap items-center gap-1.5 text-[11px]"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor:
                  SIGNER_DOT_COLORS[index % SIGNER_DOT_COLORS.length],
              }}
            />
            {signer.clientId ? (
              <a
                href={`/clients/${signer.clientId}`}
                className="font-medium text-brand-700 hover:underline"
                data-testid={`signer-client-link-${signer.clientId}`}
                title="Ouvrir la fiche client de ce signataire"
              >
                {signer.fullName}
              </a>
            ) : (
              <span className="font-medium text-slate-700">
                {signer.fullName}
              </span>
            )}
            <span className="text-slate-400">
              ({SIGNER_KIND_LABELS[signer.kind]})
            </span>
            <Badge variant={SIGNER_BADGES[signer.status]}>
              {SIGNER_STATUS_LABELS[signer.status]}
            </Badge>
            {signer.signedAt ? (
              <span className="text-slate-400">
                le{" "}
                {new Date(signer.signedAt).toLocaleDateString("fr-CA", {
                  dateStyle: "medium",
                })}
              </span>
            ) : null}
            {signer.status === "DECLINED" && signer.declineReason ? (
              <span className="w-full text-red-600">
                Motif : « {signer.declineReason} »
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {active ? (
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(remindEnvelopeAction(clientId, envelope.id))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50"
            data-testid={`remind-${envelope.id}`}
          >
            <Bell className="h-3 w-3" aria-hidden="true" />
            Relancer
            {envelope.reminderCount > 0 ? ` (${envelope.reminderCount})` : ""}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(cancelEnvelopeAction(clientId, envelope.id))}
            className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Annuler l'enveloppe
          </button>
        </div>
      ) : null}
      {!active && envelope.status !== "SIGNED" ? (
        <div className="flex items-center gap-2 pt-0.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(resendEnvelopeAction(clientId, envelope.id, {}))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline disabled:opacity-50"
            data-testid={`resend-${envelope.id}`}
          >
            <PenLine className="h-3 w-3" aria-hidden="true" />
            Nouvel envoi (mêmes signataires et zones — après discussion)
          </button>
        </div>
      ) : null}
    </li>
  );
}

/** Rappel de contre-signature — la signature se fait « dans le document ». */
function StaffSignNotice({
  envelope,
  signer,
}: {
  envelope: EnvelopeRow;
  signer: EnvelopeSignerRow;
}) {
  const waitingOn =
    envelope.signingMode === "SEQUENTIAL"
      ? envelope.signers.filter(
          (s) => s.status === "PENDING" && s.sortOrder < signer.sortOrder,
        ).length
      : 0;

  return (
    <div
      className="mt-2.5 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3"
      data-testid="staff-sign-block"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
        <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
        Votre contre-signature est attendue sur cette pièce
        {envelope.signingMode === "SEQUENTIAL"
          ? " (enveloppe séquentielle)"
          : ""}
        .
      </p>
      {waitingOn > 0 ? (
        <p className="text-[11px] text-amber-700">
          Tour en attente : {waitingOn} signataire
          {waitingOn > 1 ? "s" : ""} avant vous — vous pourrez signer lorsque
          ce sera votre tour.
        </p>
      ) : (
        <a
          href={`/signatures/${signer.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
          data-testid="staff-open-sign"
        >
          <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
          Ouvrir et signer dans le document
        </a>
      )}
    </div>
  );
}

function SharePanel({
  clientId,
  documentId,
  run,
  pending,
}: {
  clientId: string;
  documentId: string;
  run: (action: Promise<VaultMutationState>) => void;
  pending: boolean;
}) {
  const [state, formAction, linkPending] = useActionState(
    (prev: VaultMutationState, formData: FormData) =>
      createLinkShareAction(clientId, documentId, prev, formData),
    {} as VaultMutationState,
  );
  const [copied, setCopied] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(shareToPortalAction(clientId, documentId))}
        className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-brand-50 disabled:opacity-50"
      >
        <Share2 className="h-3 w-3 text-brand-600" aria-hidden="true" />
        Partager au portail particulier
      </button>

      <form action={formAction} className="space-y-1.5">
        <Input
          name="recipientEmail"
          type="email"
          placeholder="Courriel du destinataire (facultatif)"
          aria-label="Courriel du destinataire du lien"
        />
        <button
          type="submit"
          disabled={linkPending}
          className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-brand-50 disabled:opacity-50"
        >
          <Link2 className="h-3 w-3 text-brand-600" aria-hidden="true" />
          Créer un lien public (7 jours)
        </button>
      </form>

      {state.error ? (
        <p className="text-[11px] text-red-600">{state.error}</p>
      ) : null}
      {state.shareToken ? (
        <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="text-[11px] font-medium text-amber-800">
            {state.success} Copiez-le maintenant — il ne sera plus affiché.
          </p>
          <div className="flex items-center gap-1">
            <code className="min-w-0 flex-1 truncate rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-amber-900">
              {state.shareToken}
            </code>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-white"
              onClick={() => {
                void navigator.clipboard
                  .writeText(state.shareToken ?? "")
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
              }}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              {copied ? "Copié !" : "Copier"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
