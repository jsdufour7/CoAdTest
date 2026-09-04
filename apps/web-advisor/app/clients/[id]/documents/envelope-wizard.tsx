"use client";

import { useMemo, useState, useTransition } from "react";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileSignature,
  Loader2,
  MailPlus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { Alert, Badge, Button, Input, nativeSelectClass } from "@coadvisor/ui";
import {
  MAX_SIGNERS_PER_ENVELOPE,
  SIGNATURE_FIELD_KIND_LABELS,
  SIGNER_KIND_LABELS,
  SIGNING_MODE_LABELS,
} from "@coadvisor/documents/labels";

import {
  createEnvelopeAction,
  type EnvelopeFieldPayload,
  type VaultMutationState,
} from "./actions";
import { PdfFieldEditor } from "./pdf-field-editor";

/** Signataire choisi dans l'assistant (avant envoi au serveur). */
interface WizardSigner {
  kind: "PORTAL_USER" | "STAFF" | "EXTERNAL";
  /** Identifiant utilisateur (PORTAL_USER / STAFF). */
  userId?: string;
  email: string;
  fullName: string;
}

export interface PortalSignerOption {
  userId: string;
  fullName: string;
  email: string;
}

export interface StaffSignerOption {
  userId: string;
  fullName: string;
}

export interface TemplateOption {
  id: string;
  name: string;
  /** Champs normalisés (JSON en base) — revalidés sommairement ici. */
  fields: unknown;
}

const SIGNER_DOT_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#0891b2",
] as const;

function isFieldArray(raw: unknown): raw is EnvelopeFieldPayload[] {
  return (
    Array.isArray(raw) &&
    raw.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { signerIndex?: unknown }).signerIndex === "number" &&
        typeof (item as { pageIndex?: unknown }).pageIndex === "number" &&
        typeof (item as { x?: unknown }).x === "number",
    )
  );
}

/**
 * Assistant d'enveloppe de signature (Sprint 7b) : composition des
 * signataires (portail, cabinet, externe), ordre séquentiel/parallèle,
 * échéance, mot aux signataires, placement des zones sur le PDF et
 * gabarits réutilisables.
 */
export function EnvelopeWizard({
  clientId,
  documentId,
  documentLabel,
  portalSigners,
  staffSigners,
  templates,
  onDone,
}: {
  clientId: string;
  documentId: string;
  documentLabel: string;
  portalSigners: PortalSignerOption[];
  staffSigners: StaffSignerOption[];
  templates: TemplateOption[];
  onDone: (state: VaultMutationState) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [signers, setSigners] = useState<WizardSigner[]>([]);
  const [signingMode, setSigningMode] = useState<"SEQUENTIAL" | "PARALLEL">(
    "SEQUENTIAL",
  );
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<EnvelopeFieldPayload[]>([]);
  const [activeSignerIndex, setActiveSignerIndex] = useState(0);
  const [pendingKind, setPendingKind] =
    useState<EnvelopeFieldPayload["kind"]>("SIGNATURE");
  const [saveTemplateAs, setSaveTemplateAs] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Sélecteurs d'ajout
  const [portalPick, setPortalPick] = useState("");
  const [staffPick, setStaffPick] = useState("");
  const [extEmail, setExtEmail] = useState("");
  const [extName, setExtName] = useState("");
  const [templatePick, setTemplatePick] = useState("");

  const signerNames = useMemo(
    () => signers.map((signer) => signer.fullName),
    [signers],
  );

  const alreadyPicked = (userId: string) =>
    signers.some((signer) => signer.userId === userId);

  const addPortalSigner = () => {
    const option = portalSigners.find((o) => o.userId === portalPick);
    if (!option || alreadyPicked(option.userId)) return;
    setSigners((prev) => [
      ...prev,
      {
        kind: "PORTAL_USER",
        userId: option.userId,
        fullName: option.fullName,
        email: option.email,
      },
    ]);
    setPortalPick("");
  };

  const addStaffSigner = () => {
    const option = staffSigners.find((o) => o.userId === staffPick);
    if (!option || alreadyPicked(option.userId)) return;
    setSigners((prev) => [
      ...prev,
      {
        kind: "STAFF",
        userId: option.userId,
        fullName: option.fullName,
        email: "",
      },
    ]);
    setStaffPick("");
  };

  const addExternalSigner = () => {
    const email = extEmail.trim().toLowerCase();
    const fullName = extName.trim();
    if (!email || !fullName) return;
    if (
      signers.some(
        (signer) => signer.kind === "EXTERNAL" && signer.email === email,
      )
    ) {
      setLocalError("Ce courriel figure déjà parmi les signataires.");
      return;
    }
    setLocalError(null);
    setSigners((prev) => [
      ...prev,
      { kind: "EXTERNAL", email, fullName },
    ]);
    setExtEmail("");
    setExtName("");
  };

  const reorder = (index: number, delta: -1 | 1) => {
    setSigners((prev) => {
      const next = [...prev];
      const target = index + delta;
      const current = next[index];
      const swap = next[target];
      if (!current || !swap) return prev;
      next[index] = swap;
      next[target] = current;
      return next;
    });
    setActiveSignerIndex((prev) => {
      if (prev === index) return index + delta;
      if (prev === index + delta) return index;
      return prev;
    });
  };

  const removeSigner = (index: number) => {
    setSigners((prev) => prev.filter((_, i) => i !== index));
    // Les champs de ce signataire tombent ; les index se décalent.
    setFields((prev) =>
      prev
        .filter((field) => field.signerIndex !== index)
        .map((field) =>
          field.signerIndex > index
            ? { ...field, signerIndex: field.signerIndex - 1 }
            : field,
        ),
    );
    setActiveSignerIndex((prev) => Math.max(0, Math.min(prev, signers.length - 2)));
  };

  const applyTemplate = () => {
    const template = templates.find((t) => t.id === templatePick);
    if (!template || !isFieldArray(template.fields)) return;
    const needed =
      Math.max(...template.fields.map((field) => field.signerIndex), -1) + 1;
    if (needed > signers.length) {
      setLocalError(
        `Le gabarit « ${template.name} » exige ${needed} signataire(s) — composez d'abord la liste.`,
      );
      return;
    }
    setLocalError(null);
    setFields(
      template.fields.map((field) => ({
        signerIndex: field.signerIndex,
        kind: field.kind,
        pageIndex: field.pageIndex,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
      })),
    );
  };

  /** Préréglage déterministe : signature au bas de la dernière page. */
  const presetSignature = () => {
    setFields((prev) => [
      ...prev,
      {
        signerIndex: activeSignerIndex,
        kind: "SIGNATURE",
        pageIndex: 0,
        x: 0.08,
        y: 0.86,
        width: 0.4,
        height: 0.08,
      },
    ]);
  };

  const submit = () => {
    setLocalError(null);
    if (signers.length === 0) {
      setLocalError("Ajoutez au moins un signataire.");
      return;
    }
    if (fields.length === 0) {
      setLocalError("Placez au moins une zone de signature sur le document.");
      return;
    }
    for (let i = 0; i < signers.length; i += 1) {
      const has = fields.some(
        (field) => field.signerIndex === i && field.kind === "SIGNATURE",
      );
      if (!has) {
        setLocalError(
          `« ${signers[i]?.fullName ?? "Ce signataire"} » n'a aucune zone Signature — placez-en au moins une par signataire.`,
        );
        setActiveSignerIndex(i);
        setPendingKind("SIGNATURE");
        return;
      }
    }
    startTransition(async () => {
      const result = await createEnvelopeAction(clientId, documentId, {
        signers: signers.map((signer) =>
          signer.kind === "PORTAL_USER"
            ? { kind: "PORTAL_USER", portalUserId: signer.userId! }
            : signer.kind === "STAFF"
              ? { kind: "STAFF", staffUserId: signer.userId! }
              : {
                  kind: "EXTERNAL",
                  email: signer.email,
                  fullName: signer.fullName,
                },
        ),
        signingMode,
        message: message.trim() === "" ? undefined : message.trim(),
        expiresInDays,
        fields,
        saveTemplateAs: saveTemplateAs.trim() === "" ? undefined : saveTemplateAs.trim(),
      });
      onDone(result);
    });
  };

  return (
    <div
      className="space-y-4 rounded-lg border border-brand-200 bg-brand-50/40 p-3"
      data-testid="envelope-wizard"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
        <FileSignature className="h-4 w-4" aria-hidden="true" />
        Nouvelle enveloppe de signature — « {documentLabel} »
      </p>

      {/* ── 1. Signataires ─────────────────────────────────────────── */}
      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          1 · Signataires ({signers.length}/{MAX_SIGNERS_PER_ENVELOPE})
        </p>

        {signers.length > 0 ? (
          <ul className="space-y-1" data-testid="wizard-signer-list">
            {signers.map((signer, index) => (
              <li
                key={`${signer.kind}-${signer.userId ?? signer.email}`}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
              >
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      SIGNER_DOT_COLORS[index % SIGNER_DOT_COLORS.length],
                  }}
                />
                <button
                  type="button"
                  onClick={() => setActiveSignerIndex(index)}
                  className={`min-w-0 flex-1 truncate text-left font-medium ${
                    activeSignerIndex === index
                      ? "text-brand-800 underline"
                      : "text-slate-700"
                  }`}
                  title="Activer ce signataire pour le placement des zones"
                >
                  {index + 1}. {signer.fullName}
                </button>
                <Badge variant="outline">{SIGNER_KIND_LABELS[signer.kind]}</Badge>
                {signer.kind === "EXTERNAL" ? (
                  <span className="hidden text-[10px] text-slate-400 sm:inline">
                    {signer.email}
                  </span>
                ) : null}
                <span className="flex items-center gap-0.5 text-slate-400">
                  <button
                    type="button"
                    aria-label={`Monter ${signer.fullName}`}
                    disabled={index === 0}
                    onClick={() => reorder(index, -1)}
                    className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Descendre ${signer.fullName}`}
                    disabled={index === signers.length - 1}
                    onClick={() => reorder(index, 1)}
                    className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Retirer ${signer.fullName}`}
                    onClick={() => removeSigner(index)}
                    className="rounded p-0.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {signers.length < MAX_SIGNERS_PER_ENVELOPE ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {/* Portail */}
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <Users className="h-3 w-3 text-brand-600" aria-hidden="true" />
                Compte portail (couple…)
              </p>
              <div className="flex gap-1">
                <select
                  aria-label="Choisir un compte portail"
                  className={nativeSelectClass()}
                  value={portalPick}
                  onChange={(event) => setPortalPick(event.target.value)}
                >
                  <option value="">Choisir…</option>
                  {portalSigners
                    .filter((option) => !alreadyPicked(option.userId))
                    .map((option) => (
                      <option key={option.userId} value={option.userId}>
                        {option.fullName}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={portalPick === ""}
                  onClick={addPortalSigner}
                >
                  Ajouter
                </Button>
              </div>
              {portalSigners.length === 0 ? (
                <p className="mt-1 text-[10px] text-slate-400">
                  Aucun lien portail actif — invitez le client depuis sa fiche.
                </p>
              ) : null}
            </div>

            {/* Cabinet */}
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <UserPlus className="h-3 w-3 text-brand-600" aria-hidden="true" />
                Contre-signature du cabinet
              </p>
              <div className="flex gap-1">
                <select
                  aria-label="Choisir un membre du cabinet"
                  className={nativeSelectClass()}
                  value={staffPick}
                  onChange={(event) => setStaffPick(event.target.value)}
                >
                  <option value="">Choisir…</option>
                  {staffSigners
                    .filter((option) => !alreadyPicked(option.userId))
                    .map((option) => (
                      <option key={option.userId} value={option.userId}>
                        {option.fullName}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={staffPick === ""}
                  onClick={addStaffSigner}
                >
                  Ajouter
                </Button>
              </div>
            </div>

            {/* Externe */}
            <div className="rounded-md border border-slate-200 bg-white p-2">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
                <MailPlus className="h-3 w-3 text-brand-600" aria-hidden="true" />
                Externe (sans compte — courriel)
              </p>
              <div className="space-y-1">
                <Input
                  aria-label="Nom complet du signataire externe"
                  placeholder="Nom complet"
                  value={extName}
                  onChange={(event) => setExtName(event.target.value)}
                />
                <div className="flex gap-1">
                  <Input
                    aria-label="Courriel du signataire externe"
                    type="email"
                    placeholder="courriel@exemple.ca"
                    value={extEmail}
                    onChange={(event) => setExtEmail(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={extEmail.trim() === "" || extName.trim() === ""}
                    onClick={addExternalSigner}
                  >
                    Ajouter
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── 2. Ordre et échéance ───────────────────────────────────── */}
      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          2 · Ordre, échéance et mot aux signataires
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-[11px] font-medium text-slate-600">
            Ordre de signature
            <select
              className={nativeSelectClass()}
              value={signingMode}
              onChange={(event) =>
                setSigningMode(event.target.value as "SEQUENTIAL" | "PARALLEL")
              }
              data-testid="wizard-signing-mode"
            >
              {(["SEQUENTIAL", "PARALLEL"] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {SIGNING_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] font-medium text-slate-600">
            Échéance
            <select
              className={nativeSelectClass()}
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(Number(event.target.value))}
            >
              {[7, 14, 30, 60, 90].map((days) => (
                <option key={days} value={days}>
                  {days} jours
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-[11px] font-medium text-slate-600">
          Mot aux signataires (facultatif)
          <textarea
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            rows={2}
            maxLength={500}
            placeholder="Ex. : merci de signer avant notre prochaine rencontre."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <p className="text-[10px] text-slate-400">
          Relance automatique aux 72 h tant que l'enveloppe est ouverte ;
          à l'échéance, elle expire d'elle-même.
        </p>
      </section>

      {/* ── 3. Zones sur le document ───────────────────────────────── */}
      <section className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          3 · Zones sur le document ({fields.length})
        </p>

        {templates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              aria-label="Choisir un gabarit"
              className={nativeSelectClass()}
              value={templatePick}
              onChange={(event) => setTemplatePick(event.target.value)}
            >
              <option value="">Appliquer un gabarit…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={templatePick === ""}
              onClick={applyTemplate}
            >
              Appliquer
            </Button>
          </div>
        ) : null}

        {signers.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-500">Zone à déposer :</span>
              {(["SIGNATURE", "INITIALS", "DATE"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  data-testid={`kind-pick-${kind}`}
                  onClick={() => setPendingKind(kind)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    pendingKind === kind
                      ? "bg-brand-600 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {SIGNATURE_FIELD_KIND_LABELS[kind]}
                </button>
              ))}
              <button
                type="button"
                data-testid="preset-signature-bottom"
                onClick={presetSignature}
                className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
              >
                + Signature de {signerNames[activeSignerIndex] ?? "…"} (bas de page 1)
              </button>
            </div>
            <PdfFieldEditor
              documentUrl={`/clients/${clientId}/documents/${documentId}/telecharger`}
              fields={fields}
              onChange={setFields}
              signerNames={signerNames}
              activeSignerIndex={activeSignerIndex}
              pendingKind={pendingKind}
            />
          </>
        ) : (
          <p className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-[11px] text-slate-500">
            Composez d'abord la liste des signataires (étape 1) — les zones
            leur sont assignées une à une.
          </p>
        )}
      </section>

      {/* ── 4. Gabarit + envoi ─────────────────────────────────────── */}
      <section className="space-y-2 border-t border-brand-100 pt-3">
        <label className="block text-[11px] font-medium text-slate-600">
          Enregistrer ce placement comme gabarit (facultatif)
          <Input
            placeholder="Ex. : Mandat à deux signataires"
            maxLength={80}
            value={saveTemplateAs}
            onChange={(event) => setSaveTemplateAs(event.target.value)}
          />
        </label>

        {localError ? <Alert variant="error">{localError}</Alert> : null}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={submit}
            disabled={pending || signers.length === 0}
            data-testid="wizard-submit"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSignature className="h-4 w-4" aria-hidden="true" />
            )}
            Envoyer l'enveloppe à {signers.length} signataire
            {signers.length > 1 ? "s" : ""}
          </Button>
          <p className="text-[10px] text-slate-400">
            Les avis partent par courriel selon l'ordre choisi.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Affichage unique des liens externes retournés à la création. */
export function ExternalLinksNotice({
  links,
}: {
  links: Array<{ email: string; fullName: string; url: string }>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (links.length === 0) return null;
  return (
    <div
      className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3"
      data-testid="external-links"
    >
      <p className="text-xs font-semibold text-amber-800">
        Liens de signature externes — copiez-les maintenant (ils ne seront
        plus affichés) :
      </p>
      <ul className="space-y-1">
        {links.map((link) => (
          <li
            key={link.url}
            className="flex flex-wrap items-center gap-2 text-[11px] text-amber-900"
          >
            <span className="font-medium">
              {link.fullName} ({link.email})
            </span>
            <code className="max-w-[280px] truncate rounded bg-white/70 px-1.5 py-0.5">
              {link.url}
            </code>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded bg-white/80 px-1.5 py-0.5 font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-white"
              onClick={() => {
                void navigator.clipboard.writeText(link.url).then(() => {
                  setCopied(link.url);
                  setTimeout(() => setCopied(null), 2000);
                });
              }}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
              {copied === link.url ? "Copié !" : "Copier"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
