"use client";

import { useState, useTransition } from "react";

import { PenLine } from "lucide-react";

import { Alert, Button, Input, SignaturePad } from "@coadvisor/ui";
import { SIGNATURE_CONSENT_TEXT } from "@coadvisor/documents/labels";

import { declineExternalAction, signExternalAction } from "../actions";
import type { ExternalSignState } from "../actions";

/**
 * Formulaire du signataire externe (Sprint 7b) : nom tapé + initiales
 * (si paraphes prévus) + tracé facultatif, ou refus motivé.
 */
export function ExternalSignForm({
  token,
  defaultName,
  hasInitialsFields,
}: {
  token: string;
  defaultName: string;
  hasInitialsFields: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [typedName, setTypedName] = useState(defaultName);
  const [initials, setInitials] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [state, setState] = useState<ExternalSignState>({});

  const run = (action: Promise<ExternalSignState>) => {
    startTransition(async () => {
      setState(await action);
    });
  };

  if (state.success) {
    return (
      <Alert variant="success" data-testid="external-success">
        {state.success}
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Votre nom complet (signature électronique)
          <Input
            value={typedName}
            onChange={(event) => setTypedName(event.target.value)}
            minLength={2}
            maxLength={120}
            className="mt-1"
            data-testid="external-typed-name"
          />
        </label>
        {hasInitialsFields ? (
          <label className="block text-sm font-medium text-slate-700">
            Vos initiales (paraphes)
            <Input
              value={initials}
              onChange={(event) => setInitials(event.target.value)}
              maxLength={8}
              placeholder="Dérivées du nom si vide"
              className="mt-1"
              data-testid="external-initials"
            />
          </label>
        ) : null}
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50/60">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-slate-600">
          Tracer ma signature (facultatif — sinon le nom tapé est apposé)
        </summary>
        <div className="border-t border-slate-100 p-3">
          <SignaturePad onInk={setDrawn} disabled={pending} />
        </div>
      </details>

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
        {SIGNATURE_CONSENT_TEXT}
      </p>

      {state.error ? (
        <Alert variant="error">{state.error}</Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          loading={pending}
          disabled={pending || typedName.trim().length < 2}
          data-testid="external-sign-submit"
          onClick={() =>
            run(
              signExternalAction(token, {
                signerName: typedName.trim(),
                initials: initials.trim() === "" ? undefined : initials.trim(),
                drawnPngDataUrl: drawn ?? undefined,
              }),
            )
          }
        >
          <PenLine className="h-4 w-4" aria-hidden="true" />
          Signer le document
        </Button>
        <button
          type="button"
          className="text-xs font-medium text-red-600 hover:underline"
          onClick={() => setDeclineOpen((open) => !open)}
          data-testid="external-decline-toggle"
        >
          Refuser de signer…
        </button>
      </div>

      {declineOpen ? (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <label className="block text-sm font-medium text-slate-700">
            Motif du refus (le professionnel en sera avisé — 10 caractères
            minimum)
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              rows={2}
              maxLength={500}
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              data-testid="external-decline-reason"
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={pending}
            disabled={pending || declineReason.trim().length < 10}
            data-testid="external-decline-submit"
            onClick={() =>
              run(declineExternalAction(token, { reason: declineReason.trim() }))
            }
          >
            Confirmer le refus
          </Button>
        </div>
      ) : null}
    </div>
  );
}
