"use client";

import { useActionState } from "react";

import { CircleCheck, Plus } from "lucide-react";

import { Button } from "@coadvisor/ui";

import { createTaskFromSuggestionAction } from "./actions";
import type { CopilotMutationState } from "./actions";

/** « Créer une tâche » depuis une suggestion — se fige après création. */
export function CreateTaskFromSuggestionButton({
  clientId,
  title,
  rationale,
}: {
  clientId: string;
  title: string;
  rationale: string;
}) {
  const [state, formAction, pending] = useActionState(
    createTaskFromSuggestionAction.bind(null, clientId, title, rationale),
    {} as CopilotMutationState,
  );

  if (state.success) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
        <CircleCheck className="h-4 w-4" aria-hidden="true" />
        Tâche créée dans le dossier
      </span>
    );
  }

  return (
    <form action={formAction}>
      {state.error ? (
        <p className="mb-1 text-xs text-red-600">{state.error}</p>
      ) : null}
      <Button type="submit" variant="ghost" size="sm" loading={pending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Créer une tâche
      </Button>
    </form>
  );
}
