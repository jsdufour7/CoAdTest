"use client";

import { Lock, Mail } from "lucide-react";
import { useActionState } from "react";
import type { ReactNode } from "react";

import { Alert } from "./alert";
import { Button } from "./button";
import { TextField } from "./text-field";

export interface AuthFormState {
  error?: string;
}

export interface LoginFormProps {
  /** Server action (prevState, formData) passée par l'application hôte. */
  action: (
    state: AuthFormState,
    formData: FormData,
  ) => Promise<AuthFormState>;
  footer?: ReactNode;
}

/**
 * Formulaire de connexion partagé des 3 applications.
 * La logique d'authentification vit dans l'app (server action →
 * @coadvisor/auth) ; ce composant reste purement présentationnel.
 */
export function LoginForm({ action, footer }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

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
        autoComplete="current-password"
        icon={<Lock />}
        required
      />

      <Button type="submit" className="w-full" loading={pending}>
        Se connecter
      </Button>

      {footer}
    </form>
  );
}
