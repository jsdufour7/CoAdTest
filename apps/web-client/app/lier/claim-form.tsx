"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

import { KeyRound } from "lucide-react";

import { Alert, Button, Input } from "@coadvisor/ui";

export interface ClaimState {
  error?: string;
}

export function ClaimForm({
  action,
  email,
  footer,
}: {
  action: (state: ClaimState, formData: FormData) => Promise<ClaimState>;
  email: string;
  footer?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="space-y-1.5">
        <label htmlFor="code" className="block text-sm font-medium text-slate-700">
          Code d&apos;invitation
        </label>
        <div className="relative">
          <KeyRound
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            id="code"
            name="code"
            required
            minLength={6}
            maxLength={12}
            autoComplete="off"
            placeholder="XXXXXXXX"
            className="pl-9 font-mono uppercase tracking-[0.25em]"
          />
        </div>
        <p className="text-xs text-slate-400">
          8 caractères, remis en main propre par votre conseiller.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span className="text-sm text-slate-700">
          J&apos;autorise la liaison de mon compte ({email}) au dossier tenu par
          mon conseiller, afin de consulter les informations de santé financière
          qu&apos;il y prépare pour moi. (Consentement explicite — Loi 25)
        </span>
      </label>

      <Button type="submit" className="w-full" loading={pending}>
        Lier mon dossier
      </Button>

      {footer}
    </form>
  );
}
