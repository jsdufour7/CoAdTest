"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../lib/cn";

/**
 * Canevas de signature tracée (Sprint 7b) — souris/tactile. À chaque
 * fin de trait, le PNG (data URL) est remonté au parent ; le service
 * borne la taille côté serveur. Partagé par les trois surfaces.
 */
export interface SignaturePadProps {
  /**
   * Appelé à chaque fin de trait/effacement avec le PNG courant
   * (data URL) ou null si la zone est vide.
   */
  onInk: (dataUrl: string | null) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function SignaturePad({
  onInk,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Tracez votre signature dans la zone",
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  const emit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!hasInkRef.current || !canvas) {
      onInk(null);
      return;
    }
    onInk(canvas.toDataURL("image/png"));
  }, [onInk]);

  // Taille réelle du canvas (DPR) pour des traits nets.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(200, Math.floor(rect.width * dpr));
      canvas.height = Math.max(120, Math.floor(160 * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.2;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeStyle = "#1e3a5f";
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pointFromEvent = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const begin = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointFromEvent(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFromEvent(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasInkRef.current) {
      hasInkRef.current = true;
      setHasInk(true);
    }
  };

  const end = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    emit();
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    hasInkRef.current = false;
    setHasInk(false);
    onInk(null);
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "relative h-40 w-full rounded-lg border-2 border-dashed bg-white",
          disabled ? "border-slate-200 opacity-60" : "border-slate-300",
        )}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          className={cn(
            "h-full w-full rounded-lg",
            disabled ? "cursor-not-allowed" : "cursor-crosshair",
            "touch-none",
          )}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!hasInk ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400"
          >
            Tracez votre signature ici
          </span>
        ) : null}
        {hasInk && !disabled ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Effacer la signature tracée"
            className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-medium text-brand-700 shadow-sm ring-1 ring-slate-200 hover:text-brand-800"
          >
            Effacer
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Souris ou doigt — le tracé est versé comme preuve visuelle (optionnel ;
        le nom tapé demeure la signature légale).
      </p>
    </div>
  );
}
