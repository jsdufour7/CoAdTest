"use client";

import { useActionState, useRef, useState } from "react";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Alert, Button, cn, nativeSelectClass, TextField } from "@coadvisor/ui";

import { submitAssessmentAction } from "./actions";
import type { AnalyseFormState } from "./actions";

const labelClass = "block text-sm font-medium text-slate-700";

interface Step {
  title: string;
  description: string;
  content: React.ReactNode;
}

function MoneyField({
  id,
  label,
  hint,
  required = true,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <TextField
      id={id}
      label={label}
      type="number"
      min={0}
      step="any"
      inputMode="decimal"
      placeholder="0"
      hint={hint}
      required={required}
      icon={<span className="text-sm">$</span>}
    />
  );
}

const STEPS: Step[] = [
  {
    title: "Votre profil",
    description: "Quelques informations de base — aucune coordonnée requise.",
    content: (
      <>
        <TextField
          id="age"
          label="Votre âge"
          type="number"
          min={18}
          max={100}
          required
          inputMode="numeric"
        />
        <div className="space-y-1.5">
          <label htmlFor="householdType" className={labelClass}>
            Votre situation
          </label>
          <select
            id="householdType"
            name="householdType"
            className={nativeSelectClass()}
            required
            defaultValue="COUPLE"
          >
            <option value="SINGLE">Personne seule</option>
            <option value="COUPLE">Couple sans enfant</option>
            <option value="FAMILY">Famille (avec enfants)</option>
          </select>
        </div>
        <TextField
          id="dependents"
          label="Personnes à votre charge"
          type="number"
          min={0}
          max={10}
          step={1}
          required
          inputMode="numeric"
          defaultValue={0}
          hint="Enfants ou autres personnes qui dépendent de vos revenus."
        />
      </>
    ),
  },
  {
    title: "Revenus et dépenses",
    description: "Des montants approximatifs suffisent — arrondissez.",
    content: (
      <>
        <MoneyField
          id="annualIncome"
          label="Revenu annuel brut (personnel)"
          hint="Avant impôts, toutes sources confondues de votre côté."
        />
        <MoneyField
          id="otherAnnualIncome"
          label="Autres revenus annuels du ménage"
          hint="Conjoint·e, revenus locatifs, pensions… (0 si aucun)"
        />
        <MoneyField
          id="housingMonthly"
          label="Logement (mensuel)"
          hint="Loyer ou paiement hypothécaire."
        />
        <MoneyField
          id="otherMonthlyExpenses"
          label="Autres dépenses mensuelles"
          hint="Épicerie, transport, services, loisirs…"
        />
      </>
    ),
  },
  {
    title: "Vos actifs",
    description: "Ce que vous avez accumulé à ce jour.",
    content: (
      <>
        <MoneyField
          id="liquidSavings"
          label="Épargne liquide"
          hint="Comptes bancaires et épargne accessible rapidement."
        />
        <MoneyField
          id="investments"
          label="Placements"
          hint="CELI, placements non enregistrés, actions…"
        />
        <MoneyField
          id="retirementSavings"
          label="Épargne-retraite"
          hint="REER, RVER, fonds de pension…"
        />
        <MoneyField
          id="homeValue"
          label="Valeur de votre propriété (facultatif)"
          required={false}
          hint="Laissez vide si vous êtes locataire."
        />
      </>
    ),
  },
  {
    title: "Vos dettes",
    description: "Ce que vous devez encore rembourser.",
    content: (
      <>
        <MoneyField
          id="consumerDebt"
          label="Dettes à la consommation"
          hint="Soldes de cartes de crédit, marges, prêts auto/personnels. (0 si aucun)"
        />
        <MoneyField
          id="monthlyDebtPayments"
          label="Paiements mensuels sur ces dettes"
          hint="Hors hypothèque. (0 si aucun)"
        />
        <MoneyField
          id="mortgageBalance"
          label="Solde hypothécaire restant (facultatif)"
          required={false}
        />
      </>
    ),
  },
  {
    title: "Retraite, protection et objectifs",
    description: "Dernière étape — votre portrait est à un clic.",
    content: (
      <>
        <TextField
          id="retirementAge"
          label="Âge de retraite visé"
          type="number"
          min={50}
          max={80}
          required
          inputMode="numeric"
          defaultValue={65}
        />
        <MoneyField
          id="monthlySavings"
          label="Épargne mensuelle actuelle"
          hint="Ce que vous mettez de côté chaque mois (REER, CELI…). (0 si rien)"
        />
        <div className="space-y-1.5">
          <label htmlFor="lifeInsurance" className={labelClass}>
            Assurance vie / invalidité
          </label>
          <select
            id="lifeInsurance"
            name="lifeInsurance"
            className={nativeSelectClass()}
            required
            defaultValue="NONE"
          >
            <option value="NONE">Aucune</option>
            <option value="PARTIAL">Partielle (ex. via l'employeur)</option>
            <option value="ADEQUATE">Adéquate pour mes besoins</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="primaryGoal" className={labelClass}>
            Votre objectif financier principal
          </label>
          <select
            id="primaryGoal"
            name="primaryGoal"
            className={nativeSelectClass()}
            required
            defaultValue="RETIREMENT"
          >
            <option value="RETIREMENT">Préparer ma retraite</option>
            <option value="HOME">Acheter une propriété</option>
            <option value="EDUCATION">Financer des études</option>
            <option value="DEBT_REPAYMENT">Rembourser mes dettes</option>
            <option value="EMERGENCY_FUND">Bâtir un coussin de sécurité</option>
            <option value="OTHER">Autre objectif</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="goalHorizonYears"
            label="Horizon (années)"
            type="number"
            min={1}
            max={40}
            step={1}
            required
            inputMode="numeric"
            defaultValue={10}
          />
          <MoneyField
            id="goalAmount"
            label="Montant visé (facultatif)"
            required={false}
          />
        </div>
      </>
    ),
  },
];

export function QuestionnaireForm({ cabinetSlug }: { cabinetSlug?: string }) {
  const [state, formAction, pending] = useActionState(
    submitAssessmentAction,
    {} as AnalyseFormState,
  );
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const isLast = step === STEPS.length - 1;

  /** Valide uniquement les champs de l'étape courante avant d'avancer. */
  function goNext() {
    const fields = formRef.current?.querySelectorAll<HTMLElement>(
      `[data-step="${step}"] input, [data-step="${step}"] select`,
    );
    for (const field of Array.from(fields ?? [])) {
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement
      ) {
        if (!field.reportValidity()) return;
      }
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {cabinetSlug ? (
        <input type="hidden" name="cabinetSlug" value={cabinetSlug} />
      ) : null}

      {/* Progression */}
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>
            Étape {step + 1} sur {STEPS.length} — {STEPS[step]?.title}
          </span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)} %</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      {/* Étapes — toutes montées, seule l'active est visible */}
      {STEPS.map((s, index) => (
        <fieldset
          key={s.title}
          data-step={index}
          className={cn("space-y-4", index !== step && "hidden")}
        >
          <legend className="sr-only">{s.title}</legend>
          <p className="text-sm text-slate-500">{s.description}</p>
          {s.content}
        </fieldset>
      ))}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-5">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(s - 1, 0))}
          disabled={step === 0 || pending}
        >
          <ArrowLeft className="h-4 w-4" />
          Précédent
        </Button>
        {isLast ? (
          <Button type="submit" size="lg" loading={pending}>
            <Check className="h-4 w-4" />
            Voir mon portrait financier
          </Button>
        ) : (
          <Button type="button" onClick={goNext} disabled={pending}>
            Suivant
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
