import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Rendu PDF serveur (`pdf-lib`, zéro dépendance native) — gabarit
 * unique CoAdvisor : bandeau brand, pied de page réglementaire
 * paginé, blocs simples composables. WinAnsi couvre le français.
 * Version contrat : `pdfrender-1.0`.
 */

export const PDF_RENDER_VERSION = "pdfrender-1.0";

const BRAND = rgb(0x1e / 255, 0x38 / 255, 0xaf / 255); // brand-800
const BRAND_ACCENT = rgb(0x25 / 255, 0x54 / 255, 0xeb / 255); // brand-600
const INK = rgb(0x1e / 255, 0x29 / 255, 0x3b / 255); // slate-800
const MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255); // slate-500
const LIGHT_LINE = rgb(0xe2 / 255, 0xe8 / 255, 0xf0 / 255); // slate-200

export type PdfBlock =
  | { type: "h2"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "kv"; pairs: Array<[string, string]> }
  | { type: "bullets"; items: string[] }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
      columnRatio?: number[];
    }
  | { type: "spacer"; height?: number };

export interface RenderPdfInput {
  title: string;
  subtitle?: string;
  blocks: PdfBlock[];
  /** Mention réglementaire répétée en pied de chaque page. */
  footerNote: string;
  /** Signature technique du rapport (moteurs + versions). */
  engineTag: string;
}

const PAGE_WIDTH = 595.28; // A4 portrait
const PAGE_HEIGHT = 841.9;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function wrapText(
  text: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
      } else {
        if (current.length > 0) lines.push(current);
        // Mot plus long que la ligne : coupure sèche.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
          let fit = rest.length - 1;
          while (fit > 1 && font.widthOfTextAtSize(rest.slice(0, fit), size) > width) {
            fit -= 1;
          }
          lines.push(rest.slice(0, fit));
          rest = rest.slice(fit);
        }
        current = rest;
      }
    }
    if (current.length > 0) lines.push(current);
  }
  return lines;
}

export async function renderPdf(input: RenderPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(input.title);
  pdf.setProducer(`CoAdvisor pdfrender (${PDF_RENDER_VERSION})`);
  pdf.setCreator("CoAdvisor — TwoDots.ca");

  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT;

  const drawFooter = (pageNumber: number, totalPages: number) => {
    page.drawLine({
      start: { x: MARGIN, y: 52 },
      end: { x: PAGE_WIDTH - MARGIN, y: 52 },
      thickness: 0.5,
      color: LIGHT_LINE,
    });
    const noteLines = wrapText(input.footerNote, italic, 7.5, CONTENT_WIDTH - 110);
    noteLines.slice(0, 2).forEach((line, index) => {
      page.drawText(line, {
        x: MARGIN,
        y: 40 - index * 9,
        size: 7.5,
        font: italic,
        color: MUTED,
      });
    });
    page.drawText(`${pageNumber} / ${totalPages}`, {
      x: PAGE_WIDTH - MARGIN - bold.widthOfTextAtSize(`${pageNumber} / ${totalPages}`, 8),
      y: 40,
      size: 8,
      font: bold,
      color: MUTED,
    });
    page.drawText(input.engineTag, {
      x: PAGE_WIDTH - MARGIN - body.widthOfTextAtSize(input.engineTag, 7),
      y: 59,
      size: 7,
      font: body,
      color: MUTED,
    });
  };

  // Bandeau titre de la première page.
  const headerHeight = input.subtitle ? 86 : 68;
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - headerHeight,
    width: PAGE_WIDTH,
    height: headerHeight,
    color: BRAND,
  });
  page.drawText("CoAdvisor", {
    x: MARGIN,
    y: PAGE_HEIGHT - 34,
    size: 11,
    font: bold,
    color: rgb(0x93 / 255, 0xbb / 255, 0xfd / 255),
  });
  page.drawText(input.title, {
    x: MARGIN,
    y: PAGE_HEIGHT - 56,
    size: 17,
    font: bold,
    color: rgb(1, 1, 1),
  });
  if (input.subtitle) {
    page.drawText(input.subtitle, {
      x: MARGIN,
      y: PAGE_HEIGHT - 74,
      size: 9.5,
      font: body,
      color: rgb(0xdb / 255, 0xe8 / 255, 0xfe / 255),
    });
  }
  y = PAGE_HEIGHT - headerHeight - 26;

  const ensureSpace = (needed: number) => {
    if (y - needed < 72) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  const writeLines = (
    lines: string[],
    opts: { size: number; font: typeof body; color: typeof INK; indent?: number; lineOver?: number },
  ) => {
    const lineHeight = opts.size * (opts.lineOver ?? 1.35);
    for (const line of lines) {
      ensureSpace(lineHeight + 2);
      page.drawText(line, {
        x: MARGIN + (opts.indent ?? 0),
        y: y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color,
      });
      y -= lineHeight;
    }
  };

  for (const block of input.blocks) {
    switch (block.type) {
      case "h2": {
        ensureSpace(34);
        y -= 6;
        writeLines(wrapText(block.text, bold, 12.5, CONTENT_WIDTH), {
          size: 12.5,
          font: bold,
          color: BRAND,
        });
        page.drawLine({
          start: { x: MARGIN, y: y + 2 },
          end: { x: PAGE_WIDTH - MARGIN, y: y + 2 },
          thickness: 0.8,
          color: BRAND_ACCENT,
        });
        y -= 8;
        break;
      }
      case "paragraph": {
        writeLines(wrapText(block.text, body, 10, CONTENT_WIDTH), {
          size: 10,
          font: body,
          color: INK,
        });
        y -= 6;
        break;
      }
      case "kv": {
        for (const [label, value] of block.pairs) {
          const labelText = `${label}`;
          const valueLines = wrapText(value, bold, 10, CONTENT_WIDTH - 190);
          const labelLines = wrapText(labelText, body, 10, 180);
          const height =
            Math.max(valueLines.length, labelLines.length) * 13.5 + 4;
          ensureSpace(height);
          labelLines.forEach((line, index) => {
            page.drawText(line, {
              x: MARGIN,
              y: y - 10 - index * 13.5,
              size: 10,
              font: body,
              color: MUTED,
            });
          });
          valueLines.forEach((line, index) => {
            page.drawText(line, {
              x: MARGIN + 190,
              y: y - 10 - index * 13.5,
              size: 10,
              font: bold,
              color: INK,
            });
          });
          y -= height;
        }
        y -= 8;
        break;
      }
      case "bullets": {
        for (const item of block.items) {
          const lines = wrapText(item, body, 10, CONTENT_WIDTH - 16);
          const height = lines.length * 13.5;
          ensureSpace(height + 2);
          page.drawCircle({
            x: MARGIN + 4,
            y: y - 7.5,
            size: 1.6,
            color: BRAND_ACCENT,
          });
          lines.forEach((line, index) => {
            page.drawText(line, {
              x: MARGIN + 14,
              y: y - 10 - index * 13.5,
              size: 10,
              font: body,
              color: INK,
            });
          });
          y -= height;
        }
        y -= 8;
        break;
      }
      case "table": {
        const ratio = block.columnRatio ?? block.headers.map(() => 1);
        const totalRatio = ratio.reduce((a, b) => a + b, 0);
        const widths = ratio.map((r) => (CONTENT_WIDTH * r) / totalRatio);
        const rowHeight = 18;
        const drawRow = (cells: string[], font: typeof body, isHeader: boolean) => {
          ensureSpace(rowHeight + 2);
          if (isHeader) {
            page.drawRectangle({
              x: MARGIN,
              y: y - rowHeight + 4,
              width: CONTENT_WIDTH,
              height: rowHeight,
              color: rgb(0xef / 255, 0xf5 / 255, 1), // brand-50
            });
          }
          let x = MARGIN + 4;
          cells.forEach((cell, column) => {
            const cellWidth = (widths[column] ?? 60) - 8;
            const truncated = wrapText(cell, font, 9, cellWidth)[0] ?? "";
            page.drawText(truncated, {
              x,
              y: y - rowHeight + 8,
              size: 9,
              font,
              color: isHeader ? BRAND : INK,
            });
            x += widths[column] ?? 60;
          });
          y -= rowHeight;
          page.drawLine({
            start: { x: MARGIN, y: y + 4 },
            end: { x: PAGE_WIDTH - MARGIN, y: y + 4 },
            thickness: 0.4,
            color: LIGHT_LINE,
          });
        };
        drawRow(block.headers, bold, true);
        for (const row of block.rows) drawRow(row, body, false);
        y -= 10;
        break;
      }
      case "spacer": {
        y -= block.height ?? 12;
        break;
      }
    }
  }

  // Pied de page final sur toutes les pages (numérotation totale).
  const pages = pdf.getPages();
  pages.forEach((eachPage, index) => {
    page = eachPage;
    drawFooter(index + 1, pages.length);
  });

  return pdf.save();
}
