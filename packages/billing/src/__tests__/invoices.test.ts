import { describe, expect, it } from "vitest";

import {
  computeInvoiceAmounts,
  TPS_RATE,
  TVQ_RATE,
} from "../invoices";
import { BILLING_PLANS } from "../plans";

describe("computeInvoiceAmounts — taxes de vente du Québec", () => {
  it("palier seul : sous-total = prix, TPS 5 %, TVQ 9,975 %", () => {
    const amounts = computeInvoiceAmounts(BILLING_PLANS.essentiel, 0);
    expect(amounts.lines).toHaveLength(1);
    expect(amounts.subtotalCents).toBe(5900);
    expect(amounts.tpsCents).toBe(Math.round(5900 * TPS_RATE)); // 295
    expect(amounts.tvqCents).toBe(Math.round(5900 * TVQ_RATE)); // 589
    expect(amounts.totalCents).toBe(
      amounts.subtotalCents + amounts.tpsCents + amounts.tvqCents,
    );
    expect(amounts.totalCents).toBe(6784);
  });

  it("sièges additionnels : une ligne par siège, taxée de concert", () => {
    const amounts = computeInvoiceAmounts(BILLING_PLANS.cabinet, 3);
    expect(amounts.lines).toHaveLength(2);
    expect(amounts.lines[1]?.quantity).toBe(3);
    expect(amounts.lines[1]?.totalCents).toBe(3 * 2900);
    expect(amounts.subtotalCents).toBe(19900 + 8700);
    expect(amounts.totalCents).toBe(
      amounts.subtotalCents +
        Math.round(amounts.subtotalCents * TPS_RATE) +
        Math.round(amounts.subtotalCents * TVQ_RATE),
    );
  });

  it("palier gratuit : total à zéro (aucune facture émise par le service)", () => {
    const amounts = computeInvoiceAmounts(BILLING_PLANS.decouverte, 0);
    expect(amounts.subtotalCents).toBe(0);
    expect(amounts.totalCents).toBe(0);
  });
});

describe("renderInvoicePdf — brochet de fumée (polices WinAnsi)", () => {
  it("produit un vrai PDF une page, même avec des libellés accentués", async () => {
    const { renderInvoicePdf } = await import("../invoices");
    const amounts = computeInvoiceAmounts(BILLING_PLANS.pro, 0);
    const pdf = await renderInvoicePdf({
      number: "CA-2026-0042",
      tenantName: "Cabinet Héritage Létourneau — Groupe « Nord »",
      periodStart: new Date("2026-08-01T00:00:00Z"),
      periodEnd: new Date("2026-09-01T00:00:00Z"),
      issuedAt: new Date("2026-08-02T12:00:00Z"),
      status: "PAID",
      amounts,
      currency: "CAD",
      engineVersion: "billing-1.0",
    });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});
