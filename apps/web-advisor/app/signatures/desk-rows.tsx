"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  Bell,
  Download,
  FileSignature,
  PenLine,
  Repeat,
  X,
} from "lucide-react";

import type { DeskEnvelopeRow } from "@coadvisor/documents";
import {
  SIGNATURE_STATUS_LABELS,
  SIGNER_KIND_LABELS,
  SIGNER_STATUS_LABELS,
} from "@coadvisor/documents/labels";
import { Alert, Badge, Button } from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";

import {
  cancelEnvelopeDeskAction,
  remindEnvelopeDeskAction,
  resendEnvelopeDeskAction,
  type SignatureDeskActionState,
} from "./actions";

const STATUS_BADGES: Record<string, BadgeVariant> = {
  REQUESTED: "warning",
  PARTIALLY_SIGNED: "warning",
  SIGNED: "success",
  DECLINED: "danger",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
};

const SIGNER_BADGES: Record<string, BadgeVariant> = {
  PENDING: "warning",
  SIGNED: "success",
  DECLINED: "danger",
};

function SignerChips({ item }: { item: DeskEnvelopeRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {item.signers.map((signer, index) => (
        <Badge
          key={`${signer.fullName}-${index}`}
          variant={SIGNER_BADGES[signer.status] ?? "neutral"}
        >
          {signer.fullName}
          {signer.isMe ? " (moi)" : ""} · {SIGNER_KIND_LABELS[signer.kind]}
          {" · "}
          {SIGNER_STATUS_LABELS[
            signer.status as keyof typeof SIGNER_STATUS_LABELS
          ] ?? signer.status}
        </Badge>
      ))}
    </span>
  );
}

function EnvelopeHead({ item }: { item: DeskEnvelopeRow }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant={STATUS_BADGES[item.status] ?? "neutral"}
        data-testid="desk-envelope-badge"
      >
        {SIGNATURE_STATUS_LABELS[
          item.status as keyof typeof SIGNATURE_STATUS_LABELS
        ] ?? item.status}
      </Badge>
      <Link
        href={`/clients/${item.clientId}/documents`}
        className="text-sm font-semibold text-brand-700 hover:underline"
        data-testid={`desk-client-link-${item.clientId}`}
      >
        {item.clientName}
      </Link>
      <span className="truncate text-sm text-slate-800">
        {item.documentLabel}
      </span>
      {item.resentFromId ? (
        <Badge variant="outline" title="Reparti d'une ronde close">
          <Repeat className="h-3 w-3" aria-hidden="true" /> Nouvel envoi
        </Badge>
      ) : null}
    </div>
  );
}

function Flash({ state }: { state: SignatureDeskActionState }) {
  if (state.error) return <Alert variant="error">{state.error}</Alert>;
  if (state.success) {
    return (
      <div className="space-y-1">
        <Alert variant="success">{state.success}</Alert>
        {state.externalLinks?.map((link) => (
          <p
            key={link.url}
            className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600"
            data-testid="desk-external-link"
          >
            {link.fullName} :{" "}
            <a href={link.url} className="text-brand-700 hover:underline">
              {link.url}
            </a>
          </p>
        ))}
      </div>
    );
  }
  return null;
}

/** « À signer par moi » — accès direct « ouvrir et signer ». */
export function DeskMyPendingCard({ item }: { item: DeskEnvelopeRow }) {
  return (
    <li
      className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4"
      data-testid={`desk-my-${item.envelopeId}`}
    >
      <EnvelopeHead item={item} />
      <p className="text-xs text-slate-500">
        Demandée par {item.requestedByName} · envoyée le{" "}
        {new Date(item.requestedAt).toLocaleDateString("fr-CA", {
          dateStyle: "medium",
        })}
        {item.expiresAt ? (
          <>
            {" "}
            · échéance{" "}
            {new Date(item.expiresAt).toLocaleDateString("fr-CA", {
              dateStyle: "medium",
            })}
          </>
        ) : null}
      </p>
      {item.message ? (
        <p className="rounded-md bg-white/70 px-2.5 py-1.5 text-xs italic text-slate-600">
          « {item.message} »
        </p>
      ) : null}
      <SignerChips item={item} />
      <div>
        {item.myTurn ? (
          <Link
            href={`/signatures/${item.myPendingSignerId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            data-testid="desk-open-sign"
          >
            <PenLine className="h-4 w-4" aria-hidden="true" />
            Ouvrir et signer dans le document
          </Link>
        ) : (
          <p className="text-xs text-amber-700">
            Enveloppe séquentielle — ce sera votre tour quand le signataire
            précédent aura complété.
          </p>
        )}
      </div>
    </li>
  );
}

/** « En circulation » — suivi rapide : relancer / annuler. */
export function DeskInFlightRow({ item }: { item: DeskEnvelopeRow }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SignatureDeskActionState>({});
  const [confirmCancel, setConfirmCancel] = useState(false);

  const run = (action: Promise<SignatureDeskActionState>) => {
    startTransition(async () => {
      setState(await action);
    });
  };

  return (
    <li
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"
      data-testid={`desk-flight-${item.envelopeId}`}
    >
      <EnvelopeHead item={item} />
      <p className="text-xs text-slate-500">
        Demandée par {item.requestedByName} · envoyée le{" "}
        {new Date(item.requestedAt).toLocaleDateString("fr-CA", {
          dateStyle: "medium",
        })}
        {item.expiresAt ? (
          <>
            {" "}
            · échéance{" "}
            {new Date(item.expiresAt).toLocaleDateString("fr-CA", {
              dateStyle: "medium",
            })}
          </>
        ) : null}
      </p>
      <SignerChips item={item} />
      <Flash state={state} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(remindEnvelopeDeskAction(item.envelopeId))}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
          data-testid={`desk-remind-${item.envelopeId}`}
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          Relancer
        </button>
        {!confirmCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmCancel(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
            data-testid={`desk-cancel-${item.envelopeId}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Annuler l'enveloppe
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs">
            <span className="font-medium text-red-700">Confirmer ?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(cancelEnvelopeDeskAction(item.envelopeId))}
              className="font-semibold text-red-700 hover:underline disabled:opacity-50"
              data-testid={`desk-cancel-confirm-${item.envelopeId}`}
            >
              Oui, annuler
            </button>
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="text-slate-500 hover:underline"
            >
              Non
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

/** Historique — télécharger la copie close, repartir par nouvel envoi. */
export function DeskHistoryRow({ item }: { item: DeskEnvelopeRow }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<SignatureDeskActionState>({});

  const run = (action: Promise<SignatureDeskActionState>) => {
    startTransition(async () => {
      setState(await action);
    });
  };

  return (
    <li
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"
      data-testid={`desk-history-${item.envelopeId}`}
    >
      <EnvelopeHead item={item} />
      <p className="text-xs text-slate-500">
        Clôturée le{" "}
        {item.terminalAt
          ? new Date(item.terminalAt).toLocaleDateString("fr-CA", {
              dateStyle: "medium",
            })
          : "—"}{" "}
        · demandée par {item.requestedByName}
      </p>
      <SignerChips item={item} />
      <Flash state={state} />
      <div className="flex flex-wrap items-center gap-3">
        {item.signedDocumentId ? (
          <a
            href={`/clients/${item.clientId}/documents/${item.signedDocumentId}/telecharger`}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            data-testid={`desk-download-${item.envelopeId}`}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {item.status === "SIGNED"
              ? "Télécharger le PDF signé + certificat"
              : "Télécharger la copie constatant le refus + certificat"}
          </a>
        ) : null}
        {item.status !== "SIGNED" ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={pending}
            disabled={pending}
            onClick={() => run(resendEnvelopeDeskAction(item.envelopeId, {}))}
            data-testid={`desk-resend-${item.envelopeId}`}
          >
            <FileSignature className="h-3.5 w-3.5" aria-hidden="true" />
            Nouvel envoi…
          </Button>
        ) : null}
      </div>
    </li>
  );
}
