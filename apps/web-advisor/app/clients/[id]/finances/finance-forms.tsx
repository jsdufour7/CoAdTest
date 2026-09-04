"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { Alert, Button, Input, nativeSelectClass } from "@coadvisor/ui";

import {
  addEntryAction,
  upsertFinancialContextAction,
  upsertRetirementPlanAction,
} from "./actions";
import type { MutationState } from "./actions";

type EntryKind = "ASSET" | "LIABILITY" | "INCOME" | "EXPENSE" | "INSURANCE" | "GOAL";

function LabeledField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-slate-600"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Feedback({ state, successLabel }: { state: MutationState; successLabel: string }) {
  if (state.error) {
    return <Alert variant="error">{state.error}</Alert>;
  }
  if (state.success) {
    return <Alert variant="success">{successLabel}</Alert>;
  }
  return null;
}

const checkboxClass =
  "h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500";

const FREQUENCY_OPTIONS = [
  { value: "WEEKLY", label: "Hebdomadaire" },
  { value: "BIWEEKLY", label: "Aux deux semaines" },
  { value: "MONTHLY", label: "Mensuel" },
  { value: "ANNUAL", label: "Annuel" },
] as const;

function FrequencySelect({ id }: { id: string }) {
  return (
    <LabeledField label="Fréquence" htmlFor={id}>
      <select id={id} name="frequency" required className={nativeSelectClass()} defaultValue="MONTHLY">
        {FREQUENCY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </LabeledField>
  );
}

/** Formulaire d'ajout factorisé : action liée + remise à zéro au succès. */
function useEntryForm(kind: EntryKind, clientId: string) {
  const [state, formAction, pending] = useActionState(
    addEntryAction.bind(null, kind, clientId),
    {} as MutationState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);
  return { state, formAction, pending, formRef };
}

const formShell =
  "space-y-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm";

export function AddIncomeForm({ clientId }: { clientId: string }) {
  const { state, formAction, pending, formRef } = useEntryForm("INCOME", clientId);
  return (
    <form ref={formRef} action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Revenu ajouté." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Source" htmlFor="income-label">
          <Input id="income-label" name="label" required maxLength={120} placeholder="Salaire — Emploi" />
        </LabeledField>
        <LabeledField label="Montant ($)" htmlFor="income-amount">
          <Input id="income-amount" name="amount" type="number" min="0" step="0.01" required placeholder="75 000" />
        </LabeledField>
        <FrequencySelect id="income-frequency" />
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="taxable" defaultChecked className={checkboxClass} />
            Revenu imposable
          </label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>Ajouter le revenu</Button>
      </div>
    </form>
  );
}

export function AddExpenseForm({ clientId }: { clientId: string }) {
  const { state, formAction, pending, formRef } = useEntryForm("EXPENSE", clientId);
  return (
    <form ref={formRef} action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Dépense ajoutée." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Catégorie" htmlFor="expense-category">
          <select id="expense-category" name="category" required className={nativeSelectClass()} defaultValue="HOUSING">
            <option value="HOUSING">Logement</option>
            <option value="FOOD">Alimentation</option>
            <option value="TRANSPORT">Transport</option>
            <option value="UTILITIES">Services publics</option>
            <option value="INSURANCE">Assurances</option>
            <option value="LEISURE">Loisirs</option>
            <option value="SAVINGS">Épargne (cotisations)</option>
            <option value="OTHER">Autre</option>
          </select>
        </LabeledField>
        <LabeledField label="Précision (optionnel)" htmlFor="expense-label">
          <Input id="expense-label" name="label" maxLength={120} placeholder="Épicerie, hypothèque…" />
        </LabeledField>
        <LabeledField label="Montant ($)" htmlFor="expense-amount">
          <Input id="expense-amount" name="amount" type="number" min="0" step="0.01" required placeholder="1 850" />
        </LabeledField>
        <FrequencySelect id="expense-frequency" />
      </div>
      <p className="text-xs text-slate-400">
        Astuce : classez les cotisations d&apos;épargne en catégorie « Épargne » pour qu&apos;elles alimentent le ratio d&apos;épargne du FHI.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>Ajouter la dépense</Button>
      </div>
    </form>
  );
}

export function AddAssetForm({ clientId }: { clientId: string }) {
  const { state, formAction, pending, formRef } = useEntryForm("ASSET", clientId);
  return (
    <form ref={formRef} action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Actif ajouté." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Type" htmlFor="asset-type">
          <select id="asset-type" name="type" required className={nativeSelectClass()} defaultValue="CASH">
            <option value="CASH">Comptant / liquidités</option>
            <option value="INVESTMENT">Placements</option>
            <option value="REAL_ESTATE">Immobilier</option>
            <option value="BUSINESS">Entreprise</option>
            <option value="OTHER">Autre</option>
          </select>
        </LabeledField>
        <LabeledField label="Description" htmlFor="asset-label">
          <Input id="asset-label" name="label" required maxLength={120} placeholder="REER — Fonds indiciels" />
        </LabeledField>
        <LabeledField label="Institution (optionnel)" htmlFor="asset-institution">
          <Input id="asset-institution" name="institution" maxLength={120} placeholder="Institution financière" />
        </LabeledField>
        <LabeledField label="Valeur actuelle ($)" htmlFor="asset-value">
          <Input id="asset-value" name="value" type="number" min="0" step="0.01" required placeholder="118 000" />
        </LabeledField>
        <div className="flex items-end pb-1.5 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="registered" className={checkboxClass} />
            Compte enregistré (REER, CELI, RÉER collectif…)
          </label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>Ajouter l&apos;actif</Button>
      </div>
    </form>
  );
}

export function AddLiabilityForm({ clientId }: { clientId: string }) {
  const { state, formAction, pending, formRef } = useEntryForm("LIABILITY", clientId);
  return (
    <form ref={formRef} action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Dette ajoutée." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Type" htmlFor="liability-type">
          <select id="liability-type" name="type" required className={nativeSelectClass()} defaultValue="MORTGAGE">
            <option value="MORTGAGE">Hypothèque</option>
            <option value="LOAN">Prêt (auto, personnel…)</option>
            <option value="CREDIT_CARD">Carte de crédit</option>
            <option value="LINE_OF_CREDIT">Marge de crédit</option>
          </select>
        </LabeledField>
        <LabeledField label="Description" htmlFor="liability-label">
          <Input id="liability-label" name="label" required maxLength={120} placeholder="Hypothèque résidence" />
        </LabeledField>
        <LabeledField label="Solde ($)" htmlFor="liability-balance">
          <Input id="liability-balance" name="balance" type="number" min="0" step="0.01" required placeholder="312 000" />
        </LabeledField>
        <LabeledField label="Taux d'intérêt (% — optionnel)" htmlFor="liability-rate">
          <Input id="liability-rate" name="interestRate" type="number" min="0" step="0.001" placeholder="4,990" />
        </LabeledField>
        <LabeledField label="Paiement mensuel ($)" htmlFor="liability-payment">
          <Input id="liability-payment" name="monthlyPayment" type="number" min="0" step="0.01" required placeholder="1 750" />
        </LabeledField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>Ajouter la dette</Button>
      </div>
    </form>
  );
}

export function AddInsuranceForm({ clientId }: { clientId: string }) {
  const { state, formAction, pending, formRef } = useEntryForm("INSURANCE", clientId);
  return (
    <form ref={formRef} action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Assurance ajoutée." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Type" htmlFor="insurance-type">
          <select id="insurance-type" name="type" required className={nativeSelectClass()} defaultValue="LIFE">
            <option value="LIFE">Assurance vie</option>
            <option value="DISABILITY">Assurance invalidité</option>
            <option value="CRITICAL_ILLNESS">Maladies graves</option>
            <option value="PROPERTY">Assurance de biens</option>
          </select>
        </LabeledField>
        <LabeledField label="Assureur (optionnel)" htmlFor="insurance-provider">
          <Input id="insurance-provider" name="provider" maxLength={120} placeholder="Assureur" />
        </LabeledField>
        <LabeledField label="Couverture ($)" htmlFor="insurance-coverage">
          <Input id="insurance-coverage" name="coverage" type="number" min="0" step="0.01" required placeholder="500 000" />
        </LabeledField>
        <LabeledField label="Prime mensuelle ($)" htmlFor="insurance-premium">
          <Input id="insurance-premium" name="premium" type="number" min="0" step="0.01" required placeholder="68" />
        </LabeledField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>Ajouter l&apos;assurance</Button>
      </div>
    </form>
  );
}

export function AddGoalForm({ clientId }: { clientId: string }) {
  const { state, formAction, pending, formRef } = useEntryForm("GOAL", clientId);
  return (
    <form ref={formRef} action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Objectif ajouté." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Objectif" htmlFor="goal-name">
          <Input id="goal-name" name="name" required maxLength={160} placeholder="Retraite à 65 ans" />
        </LabeledField>
        <LabeledField label="Montant cible ($)" htmlFor="goal-target">
          <Input id="goal-target" name="targetAmount" type="number" min="0" step="0.01" required placeholder="1 400 000" />
        </LabeledField>
        <LabeledField label="Date cible (optionnel)" htmlFor="goal-date">
          <Input id="goal-date" name="targetDate" type="date" />
        </LabeledField>
        <LabeledField label="Priorité" htmlFor="goal-priority">
          <select id="goal-priority" name="priority" required className={nativeSelectClass()} defaultValue="MEDIUM">
            <option value="LOW">Basse</option>
            <option value="MEDIUM">Moyenne</option>
            <option value="HIGH">Haute</option>
          </select>
        </LabeledField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>Ajouter l&apos;objectif</Button>
      </div>
    </form>
  );
}

export function RetirementPlanForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: { retirementAge: number; targetAnnualIncome: number } | null;
}) {
  const [state, formAction, pending] = useActionState(
    upsertRetirementPlanAction.bind(null, clientId),
    {} as MutationState,
  );
  return (
    <form action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Plan de retraite enregistré." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Âge de retraite visé" htmlFor="retirement-age">
          <Input
            id="retirement-age"
            name="retirementAge"
            type="number"
            min="50"
            max="80"
            step="1"
            required
            defaultValue={initial?.retirementAge ?? 65}
          />
        </LabeledField>
        <LabeledField label="Revenu annuel visé à la retraite ($)" htmlFor="retirement-income">
          <Input
            id="retirement-income"
            name="targetAnnualIncome"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={initial?.targetAnnualIncome ?? ""}
            placeholder="68 000"
          />
        </LabeledField>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          {initial ? "Mettre à jour" : "Enregistrer le plan"}
        </Button>
      </div>
    </form>
  );
}

export function FinancialContextForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: {
    registeredAccountsUsage: string;
    hasWill: boolean;
    beneficiariesStatus: string;
  } | null;
}) {
  const [state, formAction, pending] = useActionState(
    upsertFinancialContextAction.bind(null, clientId),
    {} as MutationState,
  );
  return (
    <form action={formAction} className={formShell}>
      <Feedback state={state} successLabel="Contexte fiscalité / succession enregistré." />
      <div className="grid gap-3 sm:grid-cols-2">
        <LabeledField label="Utilisation des comptes enregistrés" htmlFor="ctx-registered">
          <select
            id="ctx-registered"
            name="registeredAccountsUsage"
            required
            className={nativeSelectClass()}
            defaultValue={initial?.registeredAccountsUsage ?? "UNKNOWN"}
          >
            <option value="UNKNOWN">Inconnu</option>
            <option value="NONE">Aucune cotisation</option>
            <option value="PARTIAL">Cotisations partielles</option>
            <option value="FULL">Maximisée</option>
          </select>
        </LabeledField>
        <LabeledField label="Bénéficiaires désignés" htmlFor="ctx-beneficiaries">
          <select
            id="ctx-beneficiaries"
            name="beneficiariesStatus"
            required
            className={nativeSelectClass()}
            defaultValue={initial?.beneficiariesStatus ?? "UNKNOWN"}
          >
            <option value="UNKNOWN">Inconnu</option>
            <option value="YES">À jour</option>
            <option value="OUTDATED">À réviser</option>
            <option value="NO">Aucun</option>
          </select>
        </LabeledField>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="hasWill"
              defaultChecked={initial?.hasWill ?? false}
              className={checkboxClass}
            />
            Le client a un testament
          </label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          Enregistrer le contexte
        </Button>
      </div>
    </form>
  );
}
