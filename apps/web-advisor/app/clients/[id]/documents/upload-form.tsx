"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";

import { FileUp, Upload } from "lucide-react";

import { Alert, Button, nativeSelectClass, TextField } from "@coadvisor/ui";
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  MAX_UPLOAD_DISPLAY,
} from "@coadvisor/documents/labels";

import { uploadDocumentAction } from "./actions";
import type { VaultMutationState } from "./actions";

/** Formulaire de dépôt : glisser-déposer ou parcourir. */
export function UploadForm({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(
    uploadDocumentAction.bind(null, clientId),
    {} as VaultMutationState,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.success ? <Alert variant="success">{state.success}</Alert> : null}

      <div
        role="button"
        tabIndex={0}
        aria-label="Zone de dépôt de fichier"
        className={`flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-sm transition ${
          dragOver
            ? "border-brand-400 bg-brand-50 text-brand-700"
            : "border-slate-200 bg-slate-50/50 text-slate-500 hover:border-brand-300"
        }`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const dropped = event.dataTransfer.files?.[0];
          if (dropped && fileInputRef.current) {
            const transfer = new DataTransfer();
            transfer.items.add(dropped);
            fileInputRef.current.files = transfer.files;
            setFileName(dropped.name);
          }
        }}
      >
        <FileUp className="h-5 w-5" aria-hidden="true" />
        {fileName ? (
          <span className="font-medium text-slate-700">{fileName}</span>
        ) : (
          <span>
            <strong className="font-semibold text-brand-700">Choisir un fichier</strong>{" "}
            ou le glisser ici — {MAX_UPLOAD_DISPLAY} max
          </span>
        )}
        <input
          ref={fileInputRef}
          id="vault-file"
          type="file"
          name="file"
          required
          className="hidden"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id="label"
          label="Libellé affiché"
          name="label"
          placeholder={fileName ? fileName.replace(/\.[a-z0-9]{1,8}$/i, "") : "Ex. Avis de cotisation 2025"}
          maxLength={120}
          containerClassName="sm:col-span-2"
        />
        <div className="space-y-1.5">
          <label htmlFor="category" className="block text-sm font-medium text-slate-700">
            Catégorie
          </label>
          <select id="category" name="category" className={nativeSelectClass()} defaultValue="AUTRE">
            {DOCUMENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {DOCUMENT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          <Upload className="h-4 w-4" aria-hidden="true" />
          {pending ? "Chiffrement et dépôt…" : "Déposer au coffre"}
        </Button>
      </div>
    </form>
  );
}
