"use client";

import { useActionState } from "react";

import { RefreshCw } from "lucide-react";

import { Alert, Button } from "@coadvisor/ui";

import { recalculateFhiAction } from "./actions";
import type { SanteMutationState } from "./actions";

/** Bouton « Calculer / Recalculer l'indice » — snapshot immuable côté serveur. */
export function RecalculateButton({
  clientId,
  label,
}: {
  clientId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    recalculateFhiAction.bind(null, clientId),
    {} as SanteMutationState,
  );

  return (
    <div className="space-y-3">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert variant="success">
          Indice recalculé — un nouveau snapshot a été ajouté à l&apos;historique.
        </Alert>
      ) : null}
      <form action={formAction}>
        <Button type="submit" loading={pending}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {label}
        </Button>
      </form>
    </div>
  );
}
