"use client";

import { useActionState, useEffect, useRef } from "react";

import { Alert, Button, cn, nativeSelectClass } from "@coadvisor/ui";

import { addNoteAction } from "../actions";
import type { MutationState } from "../actions";

const textareaClass = cn(
  "block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm",
  "placeholder:text-slate-400",
  "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
);

export function AddNoteForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    addNoteAction.bind(null, clientId),
    {} as MutationState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Réinitialise le formulaire après chaque ajout réussi.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm"
    >
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert variant="success">Note ajoutée au journal.</Alert>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="note-type"
          className="block text-sm font-medium text-slate-700"
        >
          Type de note
        </label>
        <select
          id="note-type"
          name="type"
          className={nativeSelectClass()}
          required
          defaultValue="OBSERVATION"
        >
          <option value="MEETING">Rencontre</option>
          <option value="PHONE">Téléphone</option>
          <option value="EMAIL">Courriel</option>
          <option value="OBSERVATION">Observation</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="note-content"
          className="block text-sm font-medium text-slate-700"
        >
          Contenu
        </label>
        <textarea
          id="note-content"
          name="content"
          className={textareaClass}
          rows={3}
          required
          maxLength={10_000}
          placeholder="Compte rendu de la rencontre, suivi à prévoir…"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          Ajouter la note
        </Button>
      </div>
    </form>
  );
}
