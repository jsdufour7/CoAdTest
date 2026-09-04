"use client";

import { useMemo, useState } from "react";

import { PenLine, Type } from "lucide-react";

import { deriveInitials, SIGNATURE_STYLES } from "@coadvisor/signdoc/pure";

import { cn } from "../lib/cn";
import { useSigndocFontFaces } from "../lib/signdoc-fonts";
import { Button } from "./button";
import { Input } from "./input";
import { SignaturePad } from "./signature-pad";

/**
 * Signature adoptée (Sprint 7c — « façon DocuSign ») : nom + style
 * typographique du registre Signdoc, ou tracé à l'écran. Le serveur
 * estampille le document avec la MÊME police (faisceau client-serveur
 * par identifiant de style).
 */
export interface AdoptedSignature {
  name: string;
  initials: string;
  styleId: string;
  drawnPngDataUrl: string | null;
}

export interface AdoptSignatureDialogProps {
  /** Nom pré-rempli (ex. : nom du compte). */
  defaultName: string;
  /** Des paraphes sont prévus → champ initiales affiché. */
  needsInitials: boolean;
  /** Base de la route de service des TTF (ex. : « /fonts/signdoc »). */
  fontBaseUrl?: string;
  disabled?: boolean;
  onAdopt: (signature: AdoptedSignature) => void;
}

/**
 * Choix du style de signature — grille de styles avec aperçu en temps
 * réel du NOM RÉEL du signataire (comme la boîte « Adopt Your
 * Signature » de DocuSign, cf. capture produit de l'équipe).
 */
export function AdoptSignatureDialog({
  defaultName,
  needsInitials,
  fontBaseUrl = "/fonts/signdoc",
  disabled = false,
  onAdopt,
}: AdoptSignatureDialogProps) {
  useSigndocFontFaces(fontBaseUrl);
  const [name, setName] = useState(defaultName);
  const [initials, setInitials] = useState(() =>
    deriveInitials(defaultName),
  );
  const [initialsTouched, setInitialsTouched] = useState(false);
  const [mode, setMode] = useState<"typed" | "drawn">("typed");
  const [styleId, setStyleId] = useState<string>("sacramento");
  const [drawn, setDrawn] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameOk = trimmed.length >= 2;
  const ready = nameOk && (mode === "typed" || drawn !== null);
  const activeStyle = useMemo(
    () =>
      SIGNATURE_STYLES.find((style) => style.id === styleId) ??
      SIGNATURE_STYLES[0]!,
    [styleId],
  );

  const submit = () => {
    if (!ready) return;
    onAdopt({
      name: trimmed,
      initials: (initialsTouched ? initials.trim() : deriveInitials(trimmed)) || "?",
      styleId,
      drawnPngDataUrl: mode === "drawn" ? drawn : null,
    });
  };

  return (
    <div
      className="space-y-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4"
      data-testid="adopt-signature-dialog"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Adoptez votre signature
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Telle qu'elle apparaîtra sur le document — choisissez un style
            ou tracez-la vous-même.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Votre nom complet
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!initialsTouched) {
                setInitials(deriveInitials(event.target.value));
              }
            }}
            minLength={2}
            maxLength={120}
            disabled={disabled}
            className="mt-1"
            data-testid="adopt-name"
          />
        </label>
        {needsInitials ? (
          <label className="block text-sm font-medium text-slate-700">
            Vos initiales (paraphes)
            <Input
              value={initials}
              onChange={(event) => {
                setInitialsTouched(true);
                setInitials(event.target.value);
              }}
              maxLength={8}
              disabled={disabled}
              className="mt-1"
              data-testid="adopt-initials"
            />
          </label>
        ) : null}
      </div>

      <div
        role="tablist"
        aria-label="Mode de signature"
        className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "typed"}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition",
            mode === "typed"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
          onClick={() => setMode("typed")}
          data-testid="adopt-tab-typed"
        >
          <Type className="h-3.5 w-3.5" aria-hidden="true" /> Style tapé
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "drawn"}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition",
            mode === "drawn"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
          onClick={() => setMode("drawn")}
          data-testid="adopt-tab-drawn"
        >
          <PenLine className="h-3.5 w-3.5" aria-hidden="true" /> Tracée
        </button>
      </div>

      {mode === "typed" ? (
        <div
          role="radiogroup"
          aria-label="Style de signature"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SIGNATURE_STYLES.map((style) => (
            <label
              key={style.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border-2 bg-white px-3 py-2 transition",
                styleId === style.id
                  ? "border-brand-600 ring-2 ring-brand-100"
                  : "border-slate-200 hover:border-slate-300",
              )}
            >
              <input
                type="radio"
                name="signature-style"
                value={style.id}
                checked={styleId === style.id}
                onChange={() => setStyleId(style.id)}
                className="h-4 w-4 accent-brand-700"
                data-testid={`adopt-style-${style.id}`}
              />
              <span className="min-w-0">
                <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  {style.label}
                </span>
                <span
                  className="block truncate text-xl leading-7 text-slate-900"
                  style={{
                    fontFamily: style.cssFamily,
                    fontStyle: style.cssItalic ? "italic" : "normal",
                  }}
                >
                  {trimmed || "Votre nom"}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <SignaturePad onInk={setDrawn} disabled={disabled} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          disabled={disabled || !ready}
          onClick={submit}
          data-testid="adopt-submit"
        >
          {mode === "typed" ? (
            <span
              className="text-base"
              style={{
                fontFamily: activeStyle.cssFamily,
                fontStyle: activeStyle.cssItalic ? "italic" : "normal",
              }}
            >
              {trimmed || "…"}
            </span>
          ) : (
            "Utiliser ce tracé"
          )}
        </Button>
        {!nameOk ? (
          <p className="text-xs text-amber-700">
            Tapez votre nom complet pour choisir un style.
          </p>
        ) : null}
      </div>
    </div>
  );
}
