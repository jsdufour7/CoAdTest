"use client";

import { useEffect, useRef, useState } from "react";

import { Check, Loader2, PenLine, X as XIcon } from "lucide-react";

import {
  DEFAULT_SIGNATURE_STYLE_ID,
  resolveSignatureStyle,
} from "@coadvisor/signdoc/pure";

import { cn } from "../lib/cn";
import { useSigndocFontFaces } from "../lib/signdoc-fonts";
import type { AdoptedSignature } from "./adopt-signature-dialog";

/**
 * Lecteur « ouvrir et signer » (Sprint 7c — correctif 3) : le document
 * PDF est rendu DIRECTEMENT dans la page (pdf.js), avec les zones de
 * signature superposées en temps réel — la personne voit EXACTEMENT ce
 * qu'elle signe, où elle le signe, avant de valider. Partagé par les
 * trois canaux : portail particulier, cabinet, lien externe.
 */

export interface SigningViewerField {
  kind: "SIGNATURE" | "INITIALS" | "DATE";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SigningViewerCosignerField extends SigningViewerField {
  signerName: string;
  signerStatus: string;
  signerIndex: number;
}

/** Teintes éditoriales des zones des cosignataires (index stable). */
const COSIGNER_HUES = [
  { border: "#059669", bg: "rgba(236,253,245,0.75)", text: "#065f46" },
  { border: "#d97706", bg: "rgba(255,247,237,0.75)", text: "#92400e" },
  { border: "#db2777", bg: "rgba(253,242,248,0.75)", text: "#9d174d" },
  { border: "#7c3aed", bg: "rgba(245,243,255,0.75)", text: "#5b21b6" },
  { border: "#0891b2", bg: "rgba(236,254,255,0.75)", text: "#155e75" },
  { border: "#65a30d", bg: "rgba(247,254,231,0.75)", text: "#3f6212" },
] as const;

const RENDER_WIDTH = 720;

export interface SigningViewerProps {
  /** Flux PDF (route serveur de l'app — session ou jeton). */
  documentUrl: string;
  /** Chemin du worker pdf.js servi par l'app (poste public). */
  workerUrl?: string;
  myFields: SigningViewerField[];
  othersFields?: SigningViewerCosignerField[];
  /** Identity adoptée (preview live dans les zones), ou null. */
  adopted: AdoptedSignature | null;
  /** Clic sur une zone « à signer » vide → ouvrir l'adoption. */
  onRequestAdopt?: (() => void) | undefined;
  /** Consultation sans action (relecture, ronde close). */
  readOnly?: boolean;
  fontBaseUrl?: string;
}

export function SigningViewer({
  documentUrl,
  workerUrl = "/pdf.worker.min.mjs",
  myFields,
  othersFields = [],
  adopted,
  onRequestAdopt,
  readOnly = false,
  fontBaseUrl = "/fonts/signdoc",
}: SigningViewerProps) {
  useSigndocFontFaces(fontBaseUrl);
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
        // Build « legacy » : compatible davantage de moteurs.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
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
            "Le document n'a pas pu être affiché — réessayez dans un instant.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      if (doc) void doc.destroy();
    };
  }, [documentUrl, workerUrl]);

  if (loadError) {
    return (
      <p
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        data-testid="signing-viewer-error"
      >
        {loadError}
      </p>
    );
  }
  if (!pdf) {
    return (
      <p
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-xs text-slate-500"
        data-testid="signing-viewer-loading"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Ouverture du document…
      </p>
    );
  }

  return (
    <div
      className="max-h-[72vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-3"
      data-testid="signing-viewer"
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <SigningPage
          key={index}
          pdf={pdf}
          pageNumber={index + 1}
          myFields={myFields.filter((field) => field.pageIndex === index)}
          othersFields={othersFields.filter(
            (field) => field.pageIndex === index,
          )}
          adopted={adopted}
          onRequestAdopt={onRequestAdopt}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function SigningPage({
  pdf,
  pageNumber,
  myFields,
  othersFields,
  adopted,
  onRequestAdopt,
  readOnly,
}: {
  pdf: import("pdfjs-dist").PDFDocumentProxy;
  pageNumber: number;
  myFields: SigningViewerField[];
  othersFields: SigningViewerCosignerField[];
  adopted: AdoptedSignature | null;
  onRequestAdopt?: (() => void) | undefined;
  readOnly: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  const datePreview = new Date().toLocaleDateString("fr-CA", {
    dateStyle: "medium",
  });

  return (
    <div className="mx-auto w-fit shadow-sm">
      <div
        className="relative bg-white"
        style={{
          width: RENDER_WIDTH,
          height: ratio ? Math.round(RENDER_WIDTH * ratio) : 480,
        }}
        data-testid={`signing-page-${pageNumber}`}
      >
        <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />
        <span className="absolute right-1.5 top-1.5 rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          p. {pageNumber}
        </span>

        {othersFields.map((field, fieldIndex) => (
          <CosignerFieldBox key={`o-${fieldIndex}`} field={field} />
        ))}
        {myFields.map((field, fieldIndex) =>
          field.kind === "DATE" ? (
            <MyDateBox
              key={`m-${fieldIndex}`}
              field={field}
              preview={datePreview}
            />
          ) : (
            <MySignableBox
              key={`m-${fieldIndex}`}
              field={field}
              adopted={adopted}
              onRequestAdopt={onRequestAdopt}
              readOnly={readOnly}
            />
          ),
        )}
      </div>
    </div>
  );
}

function boxStyle(field: SigningViewerField): React.CSSProperties {
  return {
    left: `${field.x * 100}%`,
    top: `${field.y * 100}%`,
    width: `${field.width * 100}%`,
    height: `${field.height * 100}%`,
  };
}

/** Zone « Signé par : » du signataire — aperçu fidèle de l'estampille. */
function MySignableBox({
  field,
  adopted,
  onRequestAdopt,
  readOnly,
}: {
  field: SigningViewerField;
  adopted: AdoptedSignature | null;
  onRequestAdopt?: (() => void) | undefined;
  readOnly: boolean;
}) {
  const style = resolveSignatureStyle(
    adopted?.styleId ?? DEFAULT_SIGNATURE_STYLE_ID,
  ).style;
  const filled = adopted !== null;

  const inner = filled ? (
    field.kind === "SIGNATURE" ? (
      <span className="flex h-full w-full flex-col overflow-hidden rounded-[4px] bg-white/95 px-1 py-0.5">
        <span className="text-[8px] leading-none text-slate-400">
          Signé par :
        </span>
        <span className="flex flex-1 items-center justify-center overflow-hidden">
          {adopted.drawnPngDataUrl ? (
            /* aperçu local d'un data-URL — <img> natif suffit ici */
            <img
              src={adopted.drawnPngDataUrl}
              alt="Votre signature tracée"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span
              className="truncate text-[#0d1a3d]"
              style={{
                fontFamily: style.cssFamily,
                fontStyle: style.cssItalic ? "italic" : "normal",
                fontSize: "clamp(11px, 2.6vw, 22px)",
                lineHeight: 1.1,
              }}
            >
              {adopted.name}
            </span>
          )}
        </span>
        <span className="text-[7px] leading-none text-slate-400">
          ID : attribué à la signature
        </span>
      </span>
    ) : (
      <span className="flex h-full w-full items-center justify-center rounded-[4px] bg-white/95">
        <span
          className="truncate text-[#0d1a3d]"
          style={{
            fontFamily: style.cssFamily,
            fontStyle: style.cssItalic ? "italic" : "normal",
            fontSize: "clamp(10px, 2vw, 18px)",
            lineHeight: 1.1,
          }}
        >
          {adopted.initials}
        </span>
      </span>
    )
  ) : (
    <span
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[4px]",
        readOnly ? "bg-slate-50/60" : "bg-brand-50/80",
      )}
    >
      <PenLine
        className={cn(
          "h-3.5 w-3.5",
          readOnly ? "text-slate-400" : "text-brand-700",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "px-1 text-center text-[9px] font-medium leading-tight",
          readOnly ? "text-slate-400" : "text-brand-800",
        )}
      >
        {field.kind === "SIGNATURE"
          ? readOnly
            ? "Zone de signature"
            : "Cliquez pour signer"
          : readOnly
            ? "Zone de paraphe"
            : "Cliquez pour parapher"}
      </span>
    </span>
  );

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={readOnly ? undefined : onRequestAdopt}
      className={cn(
        "absolute border",
        filled ? "border-[#29509a]" : "border-dashed",
        !filled && (readOnly ? "border-slate-300" : "border-brand-500"),
        !readOnly &&
          "cursor-pointer transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-400",
      )}
      style={boxStyle(field)}
      aria-label={
        field.kind === "SIGNATURE"
          ? "Zone de signature — cliquez pour adopter votre signature"
          : "Zone de paraphe"
      }
      data-testid={`signing-field-${field.kind.toLowerCase()}`}
    >
      {inner}
    </button>
  );
}

/** Champ date — renseigné automatiquement à l'horodatage serveur. */
function MyDateBox({
  field,
  preview,
}: {
  field: SigningViewerField;
  preview: string;
}) {
  return (
    <div
      className="absolute rounded-[4px] border border-slate-300 bg-white/90 px-1"
      style={boxStyle(field)}
      data-testid="signing-field-date"
    >
      <span className="flex h-full items-center text-[10px] text-[#0d1a3d]">
        {preview}
      </span>
    </div>
  );
}

/** Zone d'un cosignataire — statut lisible d'un coup d'œil. */
function CosignerFieldBox({ field }: { field: SigningViewerCosignerField }) {
  const hue = COSIGNER_HUES[field.signerIndex % COSIGNER_HUES.length]!;
  const signed = field.signerStatus === "SIGNED";
  const declined = field.signerStatus === "DECLINED";
  return (
    <div
      className="absolute rounded-[4px] border"
      style={{
        ...boxStyle(field),
        borderColor: declined ? "#b91c1c" : hue.border,
        backgroundColor: hue.bg,
      }}
      data-testid={`cosigner-field-${field.kind.toLowerCase()}`}
    >
      <span className="flex h-full w-full flex-col justify-center px-1 leading-tight">
        <span
          className="flex items-center gap-0.5 truncate text-[8px] font-semibold"
          style={{ color: declined ? "#b91c1c" : hue.text }}
        >
          {signed ? (
            <Check className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          ) : declined ? (
            <XIcon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
          ) : null}
          {field.signerName}
        </span>
        <span
          className="truncate text-[8px]"
          style={{ color: declined ? "#b91c1c" : hue.text }}
        >
          {signed ? "Signé" : declined ? "Refusé" : "En attente"}
        </span>
      </span>
    </div>
  );
}
