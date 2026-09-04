"use client";

import { useActionState } from "react";

import { Copy, KeyRound } from "lucide-react";

import { Alert, Button } from "@coadvisor/ui";

import { invitePortalAction } from "./actions";
import type { SanteMutationState } from "./actions";

/** Invitation portail : le code généré s'affiche UNE SEULE fois ici. */
export function PortalInviteButton({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    invitePortalAction.bind(null, clientId),
    {} as SanteMutationState,
  );

  return (
    <div className="space-y-3">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.inviteCode ? (
        <Alert variant="success">
          <div className="space-y-2">
            <p className="font-medium">
              Code d&apos;invitation généré — copiez-le maintenant, il ne sera plus affiché.
            </p>
            <p className="flex items-center gap-2">
              <code className="rounded-md bg-white/70 px-3 py-1.5 font-mono text-lg tracking-[0.2em] text-slate-900">
                {state.inviteCode}
              </code>
              <Copy className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </p>
            <p className="text-xs">
              Remettez ce code à votre client : il le saisira sur coadvisor.ca/lier
              avec son consentement explicite (Loi 25). Toute invitation précédente est révoquée.
            </p>
          </div>
        </Alert>
      ) : null}
      <form action={formAction}>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Générer un code d&apos;invitation
        </Button>
      </form>
    </div>
  );
}
