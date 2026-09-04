"use client";

import { useEffect } from "react";

import { SIGNATURE_STYLES } from "@coadvisor/signdoc/pure";

/**
 * Injecte les @font-face des polices de signature Signdoc (OFL) pour
 * l'aperçu navigateur — servies par la route /fonts/signdoc/[style]
 * de l'application hôte. Idempotent (marqueur data-attribut).
 */
export function useSigndocFontFaces(fontBaseUrl: string): void {
  useEffect(() => {
    const MARK = "data-signdoc-fonts";
    if (document.querySelector(`style[${MARK}]`)) return;
    const rules = SIGNATURE_STYLES.filter((style) => style.fontFile)
      .map((style) => {
        const family = style.cssFamily.split(",")[0]?.replace(/'/g, "") ?? "";
        return `@font-face{font-family:'${family}';src:url('${fontBaseUrl}/${style.id}') format('truetype');font-display:swap;}`;
      })
      .join("\n");
    if (rules === "") return;
    const tag = document.createElement("style");
    tag.setAttribute(MARK, "true");
    tag.textContent = rules;
    document.head.appendChild(tag);
  }, [fontBaseUrl]);
}
