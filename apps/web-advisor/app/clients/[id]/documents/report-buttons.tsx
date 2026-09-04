"use client";

import { useActionState } from "react";

import { Alert, Button } from "@coadvisor/ui";
import type { ReportKind } from "@coadvisor/documents";

import { generateReportAction } from "./actions";
import type { VaultMutationState } from "./actions";

const REPORT_BUTTONS: Array<{ kind: ReportKind; label: string }> = [
  { kind: "FHI", label: "Bilan santé financière (PDF)" },
  { kind: "DOSSIER", label: "Dossier client — synthèse (PDF)" },
  { kind: "COPILOT", label: "Bilan Copilot validé (PDF)" },
];

function ReportButton({
  clientId,
  kind,
  label,
}: {
  clientId: string;
  kind: ReportKind;
  label: string;
}) {
  const [state, formAction, pending] = useActionState(
    generateReportAction.bind(null, clientId, kind),
    {} as VaultMutationState,
  );

  return (
    <form action={formAction} className="space-y-2">
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Génération en cours…" : label}
      </Button>
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}
    </form>
  );
}

/** Trois rapports serveur (ADR-010) : chaque bouton garde son propre état. */
export function ReportButtons({ clientId }: { clientId: string }) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      {REPORT_BUTTONS.map((button) => (
        <ReportButton
          key={button.kind}
          clientId={clientId}
          kind={button.kind}
          label={button.label}
        />
      ))}
    </div>
  );
}
