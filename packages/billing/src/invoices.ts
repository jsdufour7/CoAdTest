import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { DbContext } from "@coadvisor/database";

import type { BillingPlan } from "./plans";

/**
 * Facturation CAD (ADR-013) : taxes de vente du Québec appliquées au
 * palier + sièges additionnels. engineVersion « billing-1.0 ».
 */
export const TPS_RATE = 0.05; // TPS fédérale
export const TVQ_RATE = 0.09975; // TVQ québécoise

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface InvoiceAmounts {
  lines: InvoiceLineItem[];
  subtotalCents: number;
  tpsCents: number;
  tvqCents: number;
  totalCents: number;
}

const round = (value: number): number => Math.round(value);

/** Détail d'une période mensuelle : palier + sièges additionnels. */
export function computeInvoiceAmounts(
  plan: BillingPlan,
  seatsExtra: number,
): InvoiceAmounts {
  const lines: InvoiceLineItem[] = [
    {
      description: `CoAdvisor ${plan.name} — abonnement mensuel`,
      quantity: 1,
      unitCents: plan.priceCentsPerMonth,
      totalCents: plan.priceCentsPerMonth,
    },
  ];
  if (seatsExtra > 0) {
    const seatCents = seatsExtra * plan.limits.extraSeatCentsPerMonth;
    lines.push({
      description: `Sièges additionnels (${seatsExtra} × ${Math.round(
        plan.limits.extraSeatCentsPerMonth / 100,
      )} $)`,
      quantity: seatsExtra,
      unitCents: plan.limits.extraSeatCentsPerMonth,
      totalCents: seatCents,
    });
  }
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
  const tpsCents = round(subtotalCents * TPS_RATE);
  const tvqCents = round(subtotalCents * TVQ_RATE);
  return {
    lines,
    subtotalCents,
    tpsCents,
    tvqCents,
    totalCents: subtotalCents + tpsCents + tvqCents,
  };
}

/** Numérotation lisible et monotone : CA-2026-0001, -0002… */
export async function nextInvoiceNumber(
  tx: DbContext,
  now = new Date(),
): Promise<string> {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const count = await tx.billingInvoice.count({
    where: { issuedAt: { gte: yearStart } },
  });
  return `CA-${now.getFullYear()}-${String(count + 1).padStart(4, "0")}`;
}

export interface InvoicePdfInput {
  number: string;
  tenantName: string;
  periodStart: Date;
  periodEnd: Date;
  issuedAt: Date;
  status: "OPEN" | "PAID" | "VOID";
  amounts: InvoiceAmounts;
  currency: string;
  engineVersion: string;
}

const NAVY = rgb(0.07, 0.18, 0.35);
const BLUE = rgb(0.12, 0.36, 0.66);
const GREY = rgb(0.42, 0.46, 0.52);
const LIGHT = rgb(0.95, 0.97, 0.99);
const RED = rgb(0.72, 0.16, 0.16);

function money(cents: number, currency: string): string {
  return `${(cents / 100).toLocaleString("fr-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} $ ${currency}`;
}

function frDate(date: Date): string {
  return date.toLocaleDateString("fr-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** PDF de facture une page (rendu serveur, aucune donnée externe). */
export async function renderInvoicePdf(
  input: InvoicePdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Facture ${input.number}`);
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();

  // Bandeau
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: NAVY });
  page.drawText("CoAdvisor", { x: 48, y: height - 58, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Écosystème TwoDots.ca", { x: 48, y: height - 76, size: 9, font, color: rgb(0.8, 0.86, 0.94) });
  page.drawText("FACTURE", { x: width - 160, y: height - 58, size: 20, font: bold, color: rgb(1, 1, 1) });

  let y = height - 130;
  const statusLabel =
    input.status === "PAID" ? "PAYÉE" : input.status === "OPEN" ? "OUVERTE" : "ANNULÉE";
  const statusColor = input.status === "PAID" ? BLUE : input.status === "OPEN" ? GREY : RED;
  page.drawText(`N° ${input.number}`, { x: 48, y, size: 12, font: bold, color: NAVY });
  page.drawText(statusLabel, { x: width - 130, y, size: 12, font: bold, color: statusColor });
  y -= 18;
  page.drawText(`Émise le ${frDate(input.issuedAt)}`, { x: 48, y, size: 10, font, color: GREY });
  y -= 14;
  page.drawText(
    `Période : du ${frDate(input.periodStart)} au ${frDate(input.periodEnd)}`,
    { x: 48, y, size: 10, font, color: GREY },
  );
  y -= 30;
  page.drawText("Facturé à :", { x: 48, y, size: 10, font: bold, color: NAVY });
  y -= 14;
  page.drawText(input.tenantName, { x: 48, y, size: 11, font, color: rgb(0, 0, 0) });

  // Table des lignes
  y -= 40;
  const colX = { desc: 48, qty: 340, unit: 395, total: 477 };
  page.drawRectangle({ x: 40, y: y - 6, width: width - 80, height: 22, color: LIGHT });
  page.drawText("Description", { x: colX.desc, y, size: 9, font: bold, color: NAVY });
  page.drawText("Qté", { x: colX.qty, y, size: 9, font: bold, color: NAVY });
  page.drawText("P. unitaire", { x: colX.unit, y, size: 9, font: bold, color: NAVY });
  page.drawText("Total", { x: colX.total, y, size: 9, font: bold, color: NAVY });
  y -= 24;
  for (const line of input.amounts.lines) {
    page.drawText(line.description.slice(0, 58), { x: colX.desc, y, size: 9, font, color: rgb(0, 0, 0) });
    page.drawText(String(line.quantity), { x: colX.qty, y, size: 9, font, color: rgb(0, 0, 0) });
    page.drawText(money(line.unitCents, input.currency), { x: colX.unit, y, size: 9, font, color: rgb(0, 0, 0) });
    page.drawText(money(line.totalCents, input.currency), { x: colX.total, y, size: 9, font, color: rgb(0, 0, 0) });
    y -= 16;
  }

  // Totaux
  y -= 14;
  const totals: [string, number, boolean][] = [
    ["Sous-total", input.amounts.subtotalCents, false],
    ["TPS (5 %)", input.amounts.tpsCents, false],
    ["TVQ (9,975 %)", input.amounts.tvqCents, false],
    ["TOTAL", input.amounts.totalCents, true],
  ];
  for (const [label, cents, strong] of totals) {
    if (strong) {
      page.drawRectangle({ x: width - 240, y: y - 6, width: 200, height: 20, color: LIGHT });
    }
    page.drawText(label, { x: width - 230, y, size: strong ? 11 : 9, font: strong ? bold : font, color: NAVY });
    page.drawText(money(cents, input.currency), {
      x: width - 140,
      y,
      size: strong ? 11 : 9,
      font: strong ? bold : font,
      color: strong ? BLUE : rgb(0, 0, 0),
    });
    y -= strong ? 24 : 16;
  }

  // Pied de page
  page.drawText(
    "CoAdvisor — TwoDots.ca · TPS 00000 0000 RT0001 · TVQ 0000000000 TQ0001 (numéros de démonstration)",
    { x: 48, y: 72, size: 8, font, color: GREY },
  );
  page.drawText(`Document généré par CoAdvisor · ${input.engineVersion}`, {
    x: 48,
    y: 60,
    size: 8,
    font,
    color: GREY,
  });
  return doc.save();
}
