"use client";

import { useActionState } from "react";

import { Alert, Button, TextField } from "@coadvisor/ui";

import { completeSimCheckoutAction } from "../actions";
import type { SimCheckoutState } from "../actions";

const initialState: SimCheckoutState = {};

export function SimCheckoutForm({
  planCode,
  seatsExtra,
}: {
  planCode: string;
  seatsExtra: number;
}) {
  const [state, formAction, pending] = useActionState(
    completeSimCheckoutAction,
    initialState,
  );
  return (
    <form action={formAction} className="space-y-3 pt-4" data-testid="form-checkout-sim">
      <input type="hidden" name="plan" value={planCode} />
      <input type="hidden" name="sieges" value={seatsExtra} />
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      <TextField
        id="cardName"
        label="Nom sur la carte"
        name="cardName"
        placeholder="Marie Tremblay"
        required
        autoComplete="cc-name"
      />
      <TextField
        id="cardNumber"
        label="Numéro de carte (test)"
        name="cardNumber"
        placeholder="4242 4242 4242 4242"
        inputMode="numeric"
        required
        autoComplete="cc-number"
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          id="cardExpiry"
          label="Expiration (MM/AA)"
          name="cardExpiry"
          placeholder="12/30"
          required
          autoComplete="cc-exp"
        />
        <TextField
          id="cardCvc"
          label="CVC"
          name="cardCvc"
          placeholder="123"
          inputMode="numeric"
          required
          autoComplete="cc-csc"
        />
      </div>
      <Button
        type="submit"
        loading={pending}
        className="w-full"
        data-testid="pay-sim-submit"
      >
        Payer et activer le palier
      </Button>
    </form>
  );
}
