"use client";

import { useState, useTransition } from "react";

import { Download, PenLine } from "lucide-react";

import type { SigningView } from "@coadvisor/documents";
import { SIGNATURE_CONSENT_TEXT } from "@coadvisor/documents/labels";
import {
  AdoptSignatureDialog,
  Alert,
  Button,
  SigningViewer,
  type AdoptedSignature,
} from "@coadvisor/ui";

import { declinePortalSignerAction, signPortalSignerAction } from "../../actions";

/**
 * Panneau « ouvrir et signer » du particulier (Sprint 7c) : document
 * en temps réel, adoption façon DocuSign, validation ou refus motivé —
 * puis téléchargement de la copie close (avec certificat).
 */
export function PortalSigningPanel({
  signerId,
  view,
  readOnly = false,
}: {
  signerId: string;
  view: SigningView;
  readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [adopted, setAdopted] = useState<AdoptedSignature | null>(null);
  const [adoptionOpen, setAdoptionOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [state, setState] = useState<{ error?: string; success?: string }>({});

  const run = (action: Promise<{ error?: string; success?: string }>) => {
    startTransition(async () => {
      setState(await action);
    });
  };

  if (state.success) {
    return (
      <div className="space-y-3" data-testid="portal-signed-final">
        <Alert variant="success">{state.success}</Alert>
        <a
          href={`/espace/enveloppe/${signerId}/telecharger`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
          data-testid="portal-download-after-sign"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Télécharger la pièce (avec certificat une fois la ronde close)
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="portal-signing-panel">
      <SigningViewer
        documentUrl={`/espace/enveloppe/${signerId}/document`}
        myFields={view.myFields}
        othersFields={view.othersFields}
        adopted={adopted}
        readOnly={readOnly}
        onRequestAdopt={readOnly ? undefined : () => setAdoptionOpen(true)}
      />

      {readOnly ? null : adoptionOpen ? (
        <AdoptSignatureDialog
          defaultName={view.fullName}
          needsInitials={view.hasInitialsFields}
          disabled={pending}
          onAdopt={(signature) => {
            setAdopted(signature);
            setAdoptionOpen(false);
          }}
        />
      ) : adopted ? (
        <p
          className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
          data-testid="portal-adopted-ok"
        >
          Votre signature est adoptée et apparaît sur le document exactement
          comme elle sera apposée. Vérifiez chaque zone, puis validez.
        </p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Cliquez sur une zone en surbrillance du document pour adopter votre
          signature — vous voyez en temps réel ce que vous allez signer.
        </p>
      )}

      {!readOnly && (
        <>
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
            {SIGNATURE_CONSENT_TEXT}
          </p>

          {state.error ? <Alert variant="error">{state.error}</Alert> : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              loading={pending}
              disabled={pending || adopted === null}
              data-testid="portal-sign-submit"
              onClick={() =>
                adopted &&
                run(
                  signPortalSignerAction(signerId, {
                    signerName: adopted.name,
                    initials: adopted.initials,
                    signatureStyle: adopted.styleId,
                    drawnPngDataUrl: adopted.drawnPngDataUrl ?? undefined,
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
              data-testid="portal-decline-toggle"
            >
              Refuser de signer…
            </button>
          </div>

          {declineOpen ? (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <label className="block text-sm font-medium text-slate-700">
                Motif du refus (votre conseiller en sera avisé — 10 caractères
                minimum)
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  rows={2}
                  maxLength={500}
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  data-testid="portal-decline-reason"
                />
              </label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={pending}
                disabled={pending || declineReason.trim().length < 10}
                data-testid="portal-decline-submit"
                onClick={() =>
                  run(
                    declinePortalSignerAction(signerId, {
                      reason: declineReason.trim(),
                    }),
                  )
                }
              >
                Confirmer le refus
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
