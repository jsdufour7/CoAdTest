"use client";

import { useActionState, useState } from "react";

import { CircleCheck, ImagePlus, Trash2 } from "lucide-react";

import { Alert, Button, TextField } from "@coadvisor/ui";
import {
  LANGUAGE_LABELS,
  MARKETPLACE_LANGUAGES,
  MARKETPLACE_SPECIALTIES,
  SPECIALTY_LABELS,
} from "@coadvisor/marketplace/labels";
import type { MyPublicProfile } from "@coadvisor/marketplace/labels";

import { saveProfileAction } from "./actions";
import type { ProfileMutationState } from "./actions";

const PHOTO_MAX_BYTES = 450 * 1024;

/**
 * Champ photo (Sprint 8) : la photo EXISTANTE vient du coffre
 * (photoUrl) ; un nouveau fichier est encodé en data URL, et le
 * retrait explicite passe par le champ caché « photoRemoved ».
 */
function PhotoField({ existingUrl }: { existingUrl: string | null }) {
  const [dataUrl, setDataUrl] = useState("");
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = dataUrl !== "" ? dataUrl : removed ? null : existingUrl;

  return (
    <div className="space-y-2">
      <span className="text-sm font-medium text-slate-700">Photo publique</span>
      <div className="flex items-center gap-3">
        {preview ? (
          <img
            src={preview}
            alt="Aperçu de la photo publique"
            className="h-16 w-16 rounded-full border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400">
            <ImagePlus className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
        <div className="space-y-1">
          <input
            type="file"
            accept="image/png,image/jpeg"
            aria-label="Téléverser une photo"
            className="block text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setError(null);
              if (!file) return;
              if (file.size > PHOTO_MAX_BYTES) {
                setError("Image trop lourde (maximum 450 Ko).");
                event.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setRemoved(false);
                setDataUrl(String(reader.result ?? ""));
              };
              reader.readAsDataURL(file);
            }}
          />
          <p className="text-xs text-slate-400">PNG ou JPEG, 450 Ko maximum.</p>
          {preview ? (
            <button
              type="button"
              onClick={() => {
                setDataUrl("");
                setRemoved(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Retirer la photo
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <input type="hidden" name="photoData" value={dataUrl} />
      <input type="hidden" name="photoRemoved" value={removed ? "1" : "0"} />
    </div>
  );
}

/** Formulaire « Mon profil public » — brouillon (indépendant de la visibilité). */
export function ProfileForm({ profile }: { profile: MyPublicProfile | null }) {
  const [state, formAction, pending] = useActionState(
    saveProfileAction,
    {} as ProfileMutationState,
  );

  const defaults = {
    displayName: profile?.displayName ?? "",
    headline: profile?.headline ?? "",
    bio: profile?.bio ?? "",
    regions: profile?.regions.join(", ") ?? "",
    languages: profile?.languages ?? ["fr"],
    specialties: profile?.specialties ?? [],
    yearsExperience: profile?.yearsExperience?.toString() ?? "",
    credentialsText: profile?.credentialsText ?? "",
  };

  return (
    /* key=updatedAt : après sauvegarde, la régénération serveur remonte
       les nouvelles valeurs par défaut (React 19 réinitialise sinon les
       champs non contrôlés sur leur valeur initiale). */
    <form
      key={profile?.updatedAt ?? "nouveau"}
      action={formAction}
      className="space-y-5"
    >
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? (
        <Alert variant="success">
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="h-4 w-4" aria-hidden="true" />
            Profil sauvegardé — la visibilité se gère dans la carte ci-dessus.
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* id explicite requis : sans lui, TextField n'associe pas le label (htmlFor). */}
        <TextField
          id="displayName"
          label="Nom public"
          defaultValue={defaults.displayName}
          placeholder="Ex. Marie Tremblay"
          required
          maxLength={80}
        />
        <TextField
          id="headline"
          label="Titre affiché"
          defaultValue={defaults.headline}
          placeholder="Ex. Planificatrice financière — retraite"
          maxLength={120}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bio" className="text-sm font-medium text-slate-700">
          Présentation publique
        </label>
        <textarea
          id="bio"
          name="bio"
          defaultValue={defaults.bio}
          required
          minLength={40}
          maxLength={1200}
          rows={5}
          placeholder="Votre approche, votre clientèle type, ce qui vous distingue…"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <p className="text-xs text-slate-400">
          40 à 1200 caractères — visible par toute personne qui consulte l'annuaire.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="regions"
          label="Régions desservies"
          defaultValue={defaults.regions}
          placeholder="Montréal, Laval"
          hint="Séparées par des virgules (6 maximum)."
          required
        />
        <TextField
          id="yearsExperience"
          label="Années d'expérience"
          type="number"
          min={0}
          max={60}
          defaultValue={defaults.yearsExperience}
          placeholder="12"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          Langues parlées
        </legend>
        <div className="flex flex-wrap gap-3">
          {MARKETPLACE_LANGUAGES.map((language) => (
            <label
              key={language}
              className="inline-flex items-center gap-2 text-sm text-slate-600"
            >
              <input
                type="checkbox"
                name="languages"
                value={language}
                defaultChecked={defaults.languages.includes(language)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {LANGUAGE_LABELS[language]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">
          Spécialités (utilisées par le matching — cochez vos vrais domaines)
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MARKETPLACE_SPECIALTIES.map((specialty) => (
            <label
              key={specialty}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600"
            >
              <input
                type="checkbox"
                name="specialties"
                value={specialty}
                defaultChecked={defaults.specialties.includes(specialty)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {SPECIALTY_LABELS[specialty]}
            </label>
          ))}
        </div>
      </fieldset>

      <TextField
        id="credentialsText"
        label="Titres et certifications (déclaratif)"
        defaultValue={defaults.credentialsText}
        placeholder="Ex. Pl. Fin. (IQPF) — informations déclaratives"
        hint="Affiché publiquement avec la mention « non vérifié par CoAdvisor »."
        maxLength={300}
      />

      <PhotoField existingUrl={profile?.photoUrl ?? null} />

      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button type="submit" loading={pending}>
          {pending ? "Sauvegarde…" : "Sauvegarder le profil"}
        </Button>
      </div>
    </form>
  );
}
