"use client";

import { useActionState } from "react";

import { UserPlus } from "lucide-react";
import { Alert, Button } from "@coadvisor/ui";

import { convertLeadAction } from "../actions";
import type { LeadActionState } from "../actions";

export function ConvertLeadButton({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(
    convertLeadAction.bind(null, leadId),
    {} as LeadActionState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <Button type="submit" loading={pending}>
        <UserPlus className="h-4 w-4" />
        Convertir en client
      </Button>
      <p className="text-xs text-slate-500">
        Crée un dossier client pré-rempli (audit + timeline) et marque le lead
        comme converti.
      </p>
    </form>
  );
}
