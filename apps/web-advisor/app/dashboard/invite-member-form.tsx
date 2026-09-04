"use client";

import { useActionState } from "react";

import {
  Alert,
  Button,
  nativeSelectClass,
  TextField,
} from "@coadvisor/ui";

import { inviteMemberAction } from "./actions";
import type { InviteFormState } from "./actions";

const initialState: InviteFormState = {};

export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(
    inviteMemberAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      {state.success ? (
        <Alert variant="success" title={`Invitation créée — ${state.invitedEmail}`}>
          Mot de passe temporaire à transmettre :{" "}
          <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-xs">
            {state.temporaryPassword}
          </code>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <TextField id="invite-firstName" label="Prénom" required />
        <TextField id="invite-lastName" label="Nom" required />
      </div>

      <TextField
        id="invite-email"
        label="Courriel"
        type="email"
        required
      />

      <div className="space-y-1.5">
        <label
          htmlFor="invite-role"
          className="block text-sm font-medium text-slate-700"
        >
          Rôle
        </label>
        <select
          id="invite-role"
          name="role"
          className={nativeSelectClass()}
          required
        >
          <option value="ADVISOR">Conseiller</option>
          <option value="ASSISTANT">Assistant·e</option>
          <option value="COMPLIANCE_OFFICER">Responsable conformité</option>
        </select>
      </div>

      <Button type="submit" className="w-full" loading={pending}>
        Envoyer l’invitation
      </Button>
    </form>
  );
}
