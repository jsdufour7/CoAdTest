"use client";

import { useActionState, useEffect, useRef } from "react";

import { Alert, Button, nativeSelectClass, TextField } from "@coadvisor/ui";

import { addTaskAction } from "../actions";
import type { MutationState } from "../actions";

export function AddTaskForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    addTaskAction.bind(null, clientId),
    {} as MutationState,
  );
  const formRef = useRef<HTMLFormElement>(null);

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
        <Alert variant="success">Tâche planifiée.</Alert>
      ) : null}

      <TextField
        id="task-title"
        name="title"
        label="Titre"
        required
        maxLength={200}
        placeholder="Ex. : Rappeler pour le rendez-vous REER"
        autoComplete="off"
      />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label
            htmlFor="task-priority"
            className="block text-sm font-medium text-slate-700"
          >
            Priorité
          </label>
          <select
            id="task-priority"
            name="priority"
            className={nativeSelectClass()}
            required
            defaultValue="MEDIUM"
          >
            <option value="LOW">Basse</option>
            <option value="MEDIUM">Moyenne</option>
            <option value="HIGH">Haute</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>
        <TextField
          id="task-dueDate"
          name="dueDate"
          label="Échéance"
          type="date"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          Ajouter la tâche
        </Button>
      </div>
    </form>
  );
}
