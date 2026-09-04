"use client";

import { useActionState } from "react";

import { CircleCheck, Send } from "lucide-react";

import { Alert, Button, TextField } from "@coadvisor/ui";

import { submitContactAction } from "./actions";
import type { ContactMutationState } from "./actions";

/** Formulaire de prise de contact (prospect → conseiller listé). */
export function ContactForm({
  profileId,
  advisorName,
  assessmentId,
  portraitToken,
}: {
  profileId: string;
  advisorName: string;
  assessmentId?: string;
  portraitToken?: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitContactAction.bind(null, profileId, advisorName),
    {} as ContactMutationState,
  );

  if (state.success) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-sm leading-relaxed text-emerald-800">
        <p className="flex items-center gap-2 font-semibold">
          <CircleCheck className="h-5 w-5" aria-hidden="true" />
          Votre demande a été transmise à {state.advisorName}.
        </p>
        <p className="mt-2">
          Il ou elle vous répondra personnellement aux coordonnées fournies.
          Vos informations ne sont visibles que par ce conseiller et son
          cabinet — rien n'est revendu, rien n'est automatisé.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* id explicite requis : sans lui, TextField n'associe pas le label (htmlFor). */}
        <TextField id="firstName" label="Prénom" required maxLength={80} />
        <TextField id="lastName" label="Nom" required maxLength={80} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="email"
          label="Courriel"
          type="email"
          required
          maxLength={190}
        />
        <TextField
          id="phone"
          label="Téléphone (optionnel)"
          type="tel"
          maxLength={30}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="message" className="text-sm font-medium text-slate-700">
          Votre message
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={20}
          maxLength={1000}
          rows={4}
          placeholder="Décrivez votre situation et ce que vous cherchez (ex. planifier ma retraite dans 10 ans, revoir mes assurances…)"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
        <input
          type="checkbox"
          name="consent"
          required
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          Je consens à ce que mes coordonnées et mon message soient transmis à{" "}
          <strong>{advisorName}</strong> et à son cabinet pour être contacté·e
          (Loi 25 — consentement horodaté). Aucune autre utilisation, aucune
          revente.
        </span>
      </label>

      {assessmentId && portraitToken ? (
        <>
          <input type="hidden" name="assessmentId" value={assessmentId} />
          <input type="hidden" name="portraitToken" value={portraitToken} />
          <p className="text-xs text-slate-400">
            Votre portrait financier accompagne la demande — l'adéquation est
            recalculée côté serveur.
          </p>
        </>
      ) : null}

      <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
        <Send className="h-4 w-4" aria-hidden="true" />
        {pending ? "Transmission…" : "Envoyer ma demande"}
      </Button>
    </form>
  );
}
