"use client";

import Link from "next/link";

import { Download, Hourglass, PenLine } from "lucide-react";

import { Badge } from "@coadvisor/ui";
import type { BadgeVariant } from "@coadvisor/ui";
import {
  SIGNATURE_FIELD_KIND_LABELS,
  SIGNER_STATUS_LABELS,
  SIGNING_MODE_LABELS,
  formatBytes,
} from "@coadvisor/documents/labels";

/** Vue sérialisable d'une ligne d'enveloppe à signer (miroir du service). */
export interface PortalEnvelopeCardData {
  signerId: string;
  envelopeId: string;
  envelopeStatus: "REQUESTED" | "PARTIALLY_SIGNED";
  signingMode: "SEQUENTIAL" | "PARALLEL";
  message: string | null;
  expiresAt: Date | null;
  requestedAt: Date;
  requestedByName: string;
  myTurn: boolean;
  myFields: Array<{
    kind: "SIGNATURE" | "INITIALS" | "DATE";
    pageIndex: number;
  }>;
  hasInitialsFields: boolean;
  cosigners: Array<{ fullName: string; status: string }>;
  document: {
    id: string;
    label: string;
    category: string;
    sizeBytes: number;
    mimeType: string;
    createdAt: Date;
  };
}

const COSIGNER_BADGES: Record<string, BadgeVariant> = {
  PENDING: "warning",
  SIGNED: "success",
  DECLINED: "danger",
};

/**
 * Carte d'une enveloppe en attente au portail (Sprint 7b/7c) :
 * résumé + cosignataires, puis « Ouvrir et signer » — le processus se
 * déroule DANS le document (page dédiée, rendu temps réel).
 */
export function PortalEnvelopeCard({
  envelope,
}: {
  envelope: PortalEnvelopeCardData;
}) {
  const signatureCount = envelope.myFields.filter(
    (field) => field.kind === "SIGNATURE",
  ).length;
  const initialsCount = envelope.myFields.filter(
    (field) => field.kind === "INITIALS",
  ).length;
  const dateCount = envelope.myFields.filter(
    (field) => field.kind === "DATE",
  ).length;

  return (
    <li
      className="space-y-2.5 rounded-lg border border-amber-200 bg-amber-50/50 px-3.5 py-3"
      data-testid={`portal-envelope-${envelope.envelopeId}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-800">
            {envelope.document.label}
          </p>
          <p className="text-xs text-slate-500">
            Demande de {envelope.requestedByName} ·{" "}
            {new Date(envelope.requestedAt).toLocaleDateString("fr-CA", {
              dateStyle: "medium",
            })}{" "}
            · {formatBytes(envelope.document.sizeBytes)}
            {envelope.expiresAt ? (
              <>
                {" "}
                · à signer avant le{" "}
                {new Date(envelope.expiresAt).toLocaleDateString("fr-CA", {
                  dateStyle: "medium",
                })}
              </>
            ) : null}
          </p>
        </div>
        <a
          href={`/espace/documents/${envelope.document.id}/telecharger`}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          Lire d'abord
        </a>
      </div>

      {envelope.envelopeStatus === "PARTIALLY_SIGNED" ||
      envelope.cosigners.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">
            {SIGNING_MODE_LABELS[envelope.signingMode]}
          </Badge>
          {envelope.cosigners.map((cosigner, index) => (
            <Badge
              key={`${cosigner.fullName}-${index}`}
              variant={COSIGNER_BADGES[cosigner.status] ?? "neutral"}
            >
              {cosigner.fullName} ·{" "}
              {SIGNER_STATUS_LABELS[
                cosigner.status as keyof typeof SIGNER_STATUS_LABELS
              ] ?? cosigner.status}
            </Badge>
          ))}
        </div>
      ) : null}

      {envelope.message ? (
        <p className="rounded-md bg-white/70 px-2.5 py-1.5 text-xs italic text-slate-600">
          « {envelope.message} »
        </p>
      ) : null}

      <p className="text-[11px] text-slate-500">
        Zones prévues à votre nom :{" "}
        {signatureCount > 0
          ? `${signatureCount} ${SIGNATURE_FIELD_KIND_LABELS.SIGNATURE.toLowerCase()}${signatureCount > 1 ? "s" : ""}`
          : ""}
        {initialsCount > 0
          ? `${signatureCount > 0 ? ", " : ""}${initialsCount} ${SIGNATURE_FIELD_KIND_LABELS.INITIALS.toLowerCase()}${initialsCount > 1 ? "s" : ""}`
          : ""}
        {dateCount > 0
          ? `${signatureCount + initialsCount > 0 ? ", " : ""}${dateCount} ${SIGNATURE_FIELD_KIND_LABELS.DATE.toLowerCase()}${dateCount > 1 ? "s" : ""}`
          : ""}{" "}
        — apposées à l'écran même du document.
      </p>

      {!envelope.myTurn ? (
        <p className="flex items-center gap-1.5 rounded-md bg-white/70 px-2.5 py-2 text-xs text-amber-800">
          <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
          Enveloppe séquentielle — un autre signataire doit signer avant vous ;
          vous pouvez déjà relire le document.
        </p>
      ) : null}

      <Link
        href={`/espace/enveloppe/${envelope.signerId}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
        data-testid="portal-open-sign"
      >
        <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
        {envelope.myTurn ? "Ouvrir et signer" : "Relire le document"}
      </Link>
    </li>
  );
}
