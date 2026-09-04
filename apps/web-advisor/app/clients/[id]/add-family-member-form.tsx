"use client";

import { useActionState, useEffect, useRef } from "react";

import { Alert, Button, nativeSelectClass, TextField } from "@coadvisor/ui";

import { addFamilyMemberAction } from "../actions";
import type { MutationState } from "../actions";

export function AddFamilyMemberForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    addFamilyMemberAction.bind(null, clientId),
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
      className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5"
    >
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert variant="success">Membre ajouté à l'entourage.</Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="member-firstName"
          name="firstName"
          label="Prénom"
          required
          maxLength={80}
          autoComplete="off"
        />
        <TextField
          id="member-lastName"
          name="lastName"
          label="Nom"
          required
          maxLength={80}
          autoComplete="off"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="member-role"
          className="block text-sm font-medium text-slate-700"
        >
          Lien
        </label>
        <select
          id="member-role"
          name="role"
          className={nativeSelectClass()}
          required
          defaultValue="SPOUSE"
        >
          <option value="SPOUSE">Conjoint·e</option>
          <option value="CHILD">Enfant</option>
          <option value="PARENT">Parent</option>
          <option value="DEPENDENT">Personne à charge</option>
          <option value="OTHER">Autre</option>
        </select>
      </div>

      <TextField
        id="member-birthDate"
        name="birthDate"
        label="Date de naissance"
        type="date"
      />

      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Ajouter
        </Button>
      </div>
    </form>
  );
}
