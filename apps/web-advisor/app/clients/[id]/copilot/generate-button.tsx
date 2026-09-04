"use client";

import { useActionState } from "react";

import { Sparkles } from "lucide-react";

import { Alert, Button, Input } from "@coadvisor/ui";

import { generateArtifactAction } from "./actions";
import type { CopilotMutationState } from "./actions";
import type { CopilotArtifactKind } from "@coadvisor/ai";

/** Bouton de génération d'artefact + consigne optionnelle + provenance. */
export function GenerateButton({
  clientId,
  kind,
  label,
  regenerate,
}: {
  clientId: string;
  kind: CopilotArtifactKind;
  label: string;
  /** true si un artefact existe déjà (libellé « Régénérer »). */
  regenerate?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    generateArtifactAction.bind(null, kind, clientId),
    {} as CopilotMutationState,
  );

  return (
    <div className="space-y-3">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert variant="success">
          Artefact généré avec <strong>{state.provider}</strong> ({state.model})
          {state.fellBack
            ? " — la passerelle était indisponible, le secours local a pris le relais."
            : "."}
        </Alert>
      ) : null}
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <Input
            name="instructions"
            placeholder="Consigne additionnelle (optionnel) — ex. insister sur la retraite"
            aria-label="Consigne additionnelle"
          />
        </div>
        <Button type="submit" loading={pending}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {pending
            ? "Génération…"
            : regenerate
              ? `Régénérer ${label}`
              : `Générer ${label}`}
        </Button>
      </form>
    </div>
  );
}
