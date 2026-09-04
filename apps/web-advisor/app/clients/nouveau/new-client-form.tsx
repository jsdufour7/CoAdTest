"use client";

import { useActionState } from "react";

import { Alert, Button, nativeSelectClass, TextField } from "@coadvisor/ui";

import { createClientAction } from "../actions";
import type { MutationState } from "../actions";

export function NewClientForm() {
  const [state, formAction, pending] = useActionState(
    createClientAction,
    {} as MutationState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="grid grid-cols-2 gap-3">
        <TextField id="firstName" label="Prénom" autoComplete="off" required />
        <TextField id="lastName" label="Nom" autoComplete="off" required />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="type" className="block text-sm font-medium text-slate-700">
          Type de client
        </label>
        <select id="type" name="type" className={nativeSelectClass()} required>
          <option value="INDIVIDUAL">Individuel</option>
          <option value="FAMILY">Famille</option>
          <option value="CORPORATE">Entreprise</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField id="email" label="Courriel" type="email" autoComplete="off" />
        <TextField id="phone" label="Téléphone" type="tel" autoComplete="off" />
      </div>

      <TextField
        id="birthDate"
        label="Date de naissance"
        type="date"
        hint="Optionnel — utile pour les projections et la retraite."
      />

      <Button type="submit" size="lg" loading={pending}>
        Créer le dossier
      </Button>
    </form>
  );
}
