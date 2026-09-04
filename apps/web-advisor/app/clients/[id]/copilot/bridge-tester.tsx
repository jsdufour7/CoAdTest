"use client";

import { useActionState } from "react";

import { PlugZap } from "lucide-react";

import { Alert, Button } from "@coadvisor/ui";

import { probeBridgeAction } from "./actions";
import type { BridgeProbeState } from "./actions";

/** Bouton « Tester la passerelle » (sonde /health — serveur seulement). */
export function BridgeTester() {
  const [state, formAction, pending] = useActionState(
    probeBridgeAction,
    {} as BridgeProbeState,
  );

  const health = state.health;
  return (
    <div className="space-y-2">
      <form action={formAction}>
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          <PlugZap className="h-4 w-4" aria-hidden="true" />
          {pending ? "Test en cours…" : "Tester la passerelle"}
        </Button>
      </form>
      {health ? (
        <Alert variant={health.reachable ? "success" : health.configured ? "error" : "error"}>
          {health.configured === false ? (
            <span>
              Passerelle <strong>non configurée</strong> — {health.detail} Le
              Copilot utilise le composer local (secours).
            </span>
          ) : health.reachable ? (
            <span>
              Passerelle <strong>joignable</strong> (HTTP {health.statusCode},{" "}
              {health.latencyMs} ms) — {health.detail}
            </span>
          ) : (
            <span>
              Passerelle <strong>configurée mais injoignable</strong> —{" "}
              {health.detail} Le secours local prendra le relais
              automatiquement.
            </span>
          )}
        </Alert>
      ) : null}
    </div>
  );
}
