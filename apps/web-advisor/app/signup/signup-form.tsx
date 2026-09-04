"use client";

import { Building, Lock, Mail } from "lucide-react";
import { useActionState } from "react";

import type { AuthFormState } from "@coadvisor/types";
import { Alert, Button, TextField } from "@coadvisor/ui";

import { signupAction } from "./actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(
    (prev: AuthFormState, formData: FormData) => signupAction(prev, formData),
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <TextField
        id="firmName"
        label="Nom du cabinet"
        autoComplete="organization"
        icon={<Building />}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="firstName"
          label="Prénom"
          autoComplete="given-name"
          required
        />
        <TextField
          id="lastName"
          label="Nom"
          autoComplete="family-name"
          required
        />
      </div>

      <TextField
        id="email"
        label="Courriel"
        type="email"
        autoComplete="email"
        icon={<Mail />}
        required
      />

      <TextField
        id="password"
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        icon={<Lock />}
        hint="Minimum 12 caractères, avec majuscule, minuscule et chiffre."
        required
      />

      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Créer mon espace
      </Button>
    </form>
  );
}
