"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import { Lock, Mail, User } from "lucide-react";

import { Alert, Button, TextField } from "@coadvisor/ui";
import type { AuthFormState } from "@coadvisor/ui";

export interface SignupFormProps {
  action: (
    state: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  footer?: ReactNode;
}

/** Inscription portail particulier — validation serveur (zod + politique mdp). */
export function SignupForm({ action, footer }: SignupFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="firstName"
          label="Prénom"
          autoComplete="given-name"
          icon={<User />}
          required
          maxLength={80}
        />
        <TextField
          id="lastName"
          label="Nom"
          autoComplete="family-name"
          icon={<User />}
          required
          maxLength={80}
        />
      </div>

      <TextField
        id="email"
        label="Courriel"
        type="email"
        autoComplete="email"
        icon={<Mail />}
        required
        maxLength={160}
      />

      <TextField
        id="password"
        label="Mot de passe"
        type="password"
        autoComplete="new-password"
        icon={<Lock />}
        hint="Au moins 12 caractères, avec majuscule, minuscule, chiffre et symbole."
        required
      />

      <Button type="submit" className="w-full" loading={pending}>
        Créer mon compte
      </Button>

      {footer}
    </form>
  );
}
