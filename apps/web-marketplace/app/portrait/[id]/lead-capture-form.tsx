"use client";

import { useActionState } from "react";

import { CheckCircle2 } from "lucide-react";
import { Alert, Button, TextField } from "@coadvisor/ui";

import { captureLeadAction } from "./actions";
import type { LeadFormState } from "./actions";

interface LeadCaptureFormProps {
  assessmentId: string;
  readToken: string;
  cabinetSlug?: string;
  attributed: boolean;
}

export function LeadCaptureForm({
  assessmentId,
  readToken,
  cabinetSlug,
  attributed,
}: LeadCaptureFormProps) {
  const [state, formAction, pending] = useActionState(
    captureLeadAction.bind(null, assessmentId, readToken, cabinetSlug),
    {} as LeadFormState,
  );

  if (state.success) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="font-medium text-emerald-900">Demande envoyée ✔</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            {attributed
              ? "Votre portrait et vos coordonnées ont été transmis au cabinet référent. Un conseiller vous contactera prochainement."
              : "Un professionnel de l'écosystème TwoDots.ca pourra vous contacter pour approfondir votre portrait."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <div className="grid grid-cols-2 gap-3">
        <TextField id="firstName" label="Prénom" autoComplete="given-name" required />
        <TextField id="lastName" label="Nom" autoComplete="family-name" required />
      </div>
      <TextField
        id="email"
        label="Courriel"
        type="email"
        autoComplete="email"
        required
      />
      <TextField
        id="phone"
        label="Téléphone (facultatif)"
        type="tel"
        autoComplete="tel"
      />

      <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3.5">
        <input
          id="consent"
          name="consent"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <label htmlFor="consent" className="text-xs leading-relaxed text-slate-600">
          Je consens à ce que mon portrait financier et mes coordonnées soient
          transmis {attributed ? "au cabinet référent" : "à un professionnel de l'écosystème TwoDots.ca"}{" "}
          afin d'être contacté·e au sujet de ma situation financière. Je peux
          retirer ce consentement en tout temps. (Loi 25)
        </label>
      </div>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        Être contacté par un professionnel
      </Button>
    </form>
  );
}
