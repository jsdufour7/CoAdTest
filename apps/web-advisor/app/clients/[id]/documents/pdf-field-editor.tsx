"use client";

import { useEffect, useRef, useState } from "react";

import { Loader2, Trash2 } from "lucide-react";

import type { EnvelopeFieldPayload } from "./actions";

/** Champ en cours de placement dans l'éditeur (alias lisible). */
export type PdfEditorField = EnvelopeFieldPayload;

/** Teintes d'affichage par signataire (index modulo) — éditorial seulement. */
const SIGNER_COLORS = [
  { bg: "#eff6ff", border: "#2563eb", text: "#1e40af" },
  { bg: "#ecfdf5", border: "#059669", text: "#065f46" },
  { bg: "#fff7ed", border: "#d97706", text: "#92400e" },
  { bg: "#fdf2f8", border: "#db2777", text: "#9d174d" },
  { bg: "#f5f3ff", border: "#7c3aed", text: "#5b21b6" },
  { bg: "#ecfeff", border: "#0891b2", text: "#155e75" },
] as const;

const KIND_SHORT: Record<PdfEditorField["kind"], string> = {
  SIGNATURE: "Signature",
  INITIALS: "Paraphe",
  DATE: "Date",
};

/** Tailles par défaut d'une zone déposée (fractions de page). */
const DEFAULT_SIZE: Record<PdfEditorField["kind"], { w: number; h: number }> = {
  SIGNATURE: { w: 0.32, h: 0.075 },
  INITIALS: { w: 0.14, h: 0.05 },
  DATE: { w: 0.22, h: 0.045 },
};

const RENDER_WIDTH = 660;

interface PdfFieldEditorProps {
  /** URL du flux PDF (route de téléchargement existante, même session). */
  documentUrl: string;
  fields: PdfEditorField[];
  onChange: (fields: PdfEditorField[]) => void;
  /** Noms affichés, indexés comme `signerIndex`. */
  signerNames: string[];
  /** Signataire auquel les nouvelles zones sont assignées. */
  activeSignerIndex: number;
  /** Type de zone déposée au prochain clic. */
  pendingKind: PdfEditorField["kind"];
}

/**
 * Éditeur de placement des champs de signature (Sprint 7b) : rendu PDF
 * dans le navigateur (pdf.js), dépôt au clic, déplacement au glisser,
 * suppression au ✕. Les coordonnées sont normalisées (0-1, origine
 * haut-gauche) — le serveur les revalide à la création de l'enveloppe.
 */
export function PdfFieldEditor({
  documentUrl,
  fields,
  onChange,
  signerNames,
  activeSignerIndex,
  pendingKind,
}: PdfFieldEditorProps) {
  const [pdf, setPdf] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(
    null,
  );
  const [pageCount, setPageCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: import("pdfjs-dist").PDFDocumentProxy | null = null;
    (async () => {
      try {
        // Build « legacy » : compatible davantage de navigateurs
        // (Promise.withResolvers & cie polyfillés).
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        doc = await pdfjs.getDocument({ url: documentUrl }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch {
        if (!cancelled) {
          setLoadError(
            "Le PDF n'a pas pu être affiché — réessayez ou vérifiez le fichier.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      if (doc) void doc.destroy();
    };
  }, [documentUrl]);

  const placeField = (pageIndex: number, rawX: number, rawY: number) => {
    const size = DEFAULT_SIZE[pendingKind];
    const x = Math.min(Math.max(rawX - size.w / 2, 0), 1 - size.w);
    const y = Math.min(Math.max(rawY - size.h / 2, 0), 1 - size.h);
    onChange([
      ...fields,
      {
        signerIndex: activeSignerIndex,
        kind: pendingKind,
        pageIndex,
        x: Math.round(x * 1000) / 1000,
        y: Math.round(y * 1000) / 1000,
        width: size.w,
        height: size.h,
      },
    ]);
  };

  const moveField = (index: number, x: number, y: number) => {
    const next = fields.map((field, i) => {
      if (i !== index) return field;
      const clampedX = Math.min(Math.max(x, 0), 1 - field.width);
      const clampedY = Math.min(Math.max(y, 0), 1 - field.height);
      return {
        ...field,
        x: Math.round(clampedX * 1000) / 1000,
        y: Math.round(clampedY * 1000) / 1000,
      };
    });
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  if (loadError) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
        {loadError}
      </p>
    );
  }
  if (!pdf) {
    return (
      <p
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-xs text-slate-500"
        data-testid="pdf-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Chargement du PDF…
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="pdf-field-editor">
      <p className="text-[11px] text-slate-500">
        Cliquez sur le document pour déposer une zone «{" "}
        {KIND_SHORT[pendingKind]} » au nom de{" "}
        <strong>{signerNames[activeSignerIndex] ?? "…"}</strong> — glissez les
        zones pour les repositionner, ✕ pour les retirer. Document de{" "}
        {pageCount} page{pageCount > 1 ? "s" : ""}.
      </p>
      <div className="max-h-[560px] space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-slate-100 p-3">
        {Array.from({ length: pageCount }, (_, i) => (
          <PdfPageView
            key={i}
            pdf={pdf}
            pageNumber={i + 1}
            fields={fields}
            fieldIndices={fields
              .map((field, index) => ({ field, index }))
              .filter(({ field }) => field.pageIndex === i)
              .map(({ index }) => index)}
            signerNames={signerNames}
            onPlace={(x, y) => placeField(i, x, y)}
            onMove={moveField}
            onRemove={removeField}
          />
        ))}
      </div>
    </div>
  );
}

function PdfPageView({
  pdf,
  pageNumber,
  fields,
  fieldIndices,
  signerNames,
  onPlace,
  onMove,
  onRemove,
}: {
  pdf: import("pdfjs-dist").PDFDocumentProxy;
  pageNumber: number;
  fields: PdfEditorField[];
  fieldIndices: number[];
  signerNames: string[];
  onPlace: (x: number, y: number) => void;
  onMove: (index: number, x: number, y: number) => void;
  onRemove: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = RENDER_WIDTH / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise;
      if (!cancelled) setRatio(viewport.height / viewport.width);
    })().catch(() => {
      /* page ignorée si le rendu échoue */
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  const handlePlace = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onPlace(x, y);
  };

  return (
    <div className="mx-auto w-fit shadow-sm">
      <div
        ref={boxRef}
        data-testid={`pdf-page-${pageNumber}`}
        className="relative cursor-crosshair bg-white"
        style={{
          width: RENDER_WIDTH,
          height: ratio ? Math.round(RENDER_WIDTH * ratio) : 320,
        }}
        onPointerDown={handlePlace}
      >
        <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />
        <span className="absolute right-1.5 top-1.5 rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          p. {pageNumber}
        </span>
        {fieldIndices.map((fieldIndex) => {
          const field = fields[fieldIndex];
          if (!field) return null;
          return (
            <FieldChip
              key={fieldIndex}
              field={field}
              signerName={signerNames[field.signerIndex] ?? "?"}
              boxRef={boxRef}
              onMove={(x, y) => onMove(fieldIndex, x, y)}
              onRemove={() => onRemove(fieldIndex)}
            />
          );
        })}
      </div>
    </div>
  );
}

function FieldChip({
  field,
  signerName,
  boxRef,
  onMove,
  onRemove,
}: {
  field: PdfEditorField;
  signerName: string;
  boxRef: React.RefObject<HTMLDivElement | null>;
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
}) {
  const color = SIGNER_COLORS[field.signerIndex % SIGNER_COLORS.length]!;
  const drag = useRef<{
    startX: number;
    startY: number;
    fieldX: number;
    fieldY: number;
  } | null>(null);

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const box = boxRef.current;
    if (!box) return;
    drag.current = {
      startX: event.clientX,
      startY: event.clientY,
      fieldX: field.x,
      fieldY: field.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const duringDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const box = boxRef.current;
    if (!state || !box) return;
    const rect = box.getBoundingClientRect();
    const dx = (event.clientX - state.startX) / rect.width;
    const dy = (event.clientY - state.startY) / rect.height;
    onMove(state.fieldX + dx, state.fieldY + dy);
  };

  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div
      data-testid="field-chip"
      role="button"
      tabIndex={0}
      aria-label={`Zone ${KIND_SHORT[field.kind]} de ${signerName} — glisser pour repositionner`}
      className="absolute flex cursor-grab items-center justify-center overflow-hidden rounded border-2 text-[10px] font-semibold active:cursor-grabbing"
      style={{
        left: `${field.x * 100}%`,
        top: `${field.y * 100}%`,
        width: `${field.width * 100}%`,
        height: `${field.height * 100}%`,
        backgroundColor: color.bg,
        borderColor: color.border,
        color: color.text,
      }}
      onPointerDown={beginDrag}
      onPointerMove={duringDrag}
      onPointerUp={endDrag}
    >
      <span className="pointer-events-none truncate px-1">
        {KIND_SHORT[field.kind]} · {signerName}
      </span>
      <button
        type="button"
        aria-label={`Retirer la zone ${KIND_SHORT[field.kind]} de ${signerName}`}
        className="absolute right-0 top-0 rounded-bl bg-white/80 p-0.5 text-slate-500 hover:text-red-600"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}
