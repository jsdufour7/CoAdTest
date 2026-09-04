"use client";

import { useActionState } from "react";

import { CircleCheck, NotebookPen } from "lucide-react";

import { Alert, Button } from "@coadvisor/ui";

import { savePrepAsNoteAction } from "./actions";
import type { CopilotMutationState } from "./actions";

/**
 * « Sauvegarder au journal » — la préparation devient une note MEETING.
 * Un artefact périmé (régénéré entre-temps, autre onglet…) affiche
 * l'erreur EN LIGNE plutôt que de faire échouer la page entière.
 */
export function SavePrepButton({
  clientId,
  artifactId,
}: {
  clientId: string;
  artifactId: string;
}) {
  const [state, formAction, pending] = useActionState(
    savePrepAsNoteAction.bind(null, clientId, artifactId),
    {} as CopilotMutationState,
  );

  if (state.success) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <CircleCheck className="h-4 w-4" aria-hidden="true" />
        Préparation sauvegardée au journal
      </span>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
        Sauvegarder au journal (note de rencontre)
      </Button>
    </form>
  );
}
