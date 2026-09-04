"use client";

import { useActionState } from "react";

import { Eye, EyeOff } from "lucide-react";

import { Alert, Button } from "@coadvisor/ui";

import { setListingAction } from "./actions";
import type { ProfileMutationState } from "./actions";

/**
 * Interrupteur de visibilité publique — l'activation exige le
 * consentement explicite (Loi 25, horodaté + audité côté serveur).
 */
export function ListingToggle({ isListed }: { isListed: boolean }) {
  const [state, formAction, pending] = useActionState(
    setListingAction,
    {} as ProfileMutationState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert variant="success">
          {isListed
            ? "Votre profil a été retiré de l'annuaire public."
            : "Votre profil est maintenant visible dans l'annuaire public."}
        </Alert>
      ) : null}

      {!isListed ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          <input
            type="checkbox"
            name="consent"
            required
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            Je consens à rendre mon profil professionnel <strong>visible
            publiquement</strong> sur la place de marché CoAdvisor (nom, titre,
            présentation, régions, langues, spécialités, photo et titres
            déclarés). Je peux retirer cette visibilité à tout moment; mon
            consentement sera horodaté et journalisé (Loi 25).
          </span>
        </label>
      ) : null}

      <input type="hidden" name="target" value={isListed ? "unlist" : "list"} />
      <Button
        type="submit"
        variant={isListed ? "secondary" : "primary"}
        loading={pending}
      >
        {isListed ? (
          <>
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            Retirer ma visibilité publique
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" aria-hidden="true" />
            Me rendre visible sur la place publique
          </>
        )}
      </Button>
    </form>
  );
}
