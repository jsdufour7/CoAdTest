/**
 * `pnpm db:seed:demo` (segment Sprint 8 — monétisation) : abonnement
 * ESSENTIEL actif du Cabinet Démo, deux factures d'historique et
 * ~30 jours d'événements produit réalistes (dashboard Statistiques et
 * vue plateforme vivante dès l'ouverture). Idempotent.
 */
import { createHash } from "node:crypto";

import { prisma, withSystemContext } from "@coadvisor/database";

import { computeInvoiceAmounts } from "../src/invoices";
import { BILLING_PLANS } from "../src/plans";
import { addMonths } from "../src/service";

const DEMO_TENANT_SLUG = "cabinet-demo";
const SEED_VERSION = "billing-seed-1.0";

/** PRNG déterministe (mulberry32) — la démo génère des données stables. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pseudonym = (raw: string): string =>
  createHash("sha256").update(`product-events:${raw}`).digest("hex");

async function main(): Promise<void> {
  await withSystemContext(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { slug: DEMO_TENANT_SLUG },
      select: { id: true },
    });
    if (!tenant) throw new Error("Lancez d'abord pnpm db:seed (tenant cabinet-demo).");
    const advisor = await tx.user.findUnique({
      where: { email: "demo@coadvisor.ca" },
      select: { id: true },
    });
    const portalUser = await tx.user.findUnique({
      where: { email: "jean.bouchard@exemple.ca" },
      select: { id: true },
    });
    if (!advisor) throw new Error("Utilisatrice démo introuvable — db:seed requis.");

    // ── Abonnement ESSENTIEL actif (idempotent) ──
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const existingSub = await tx.billingSubscription.findUnique({
      where: { tenantId: tenant.id },
    });
    let subscriptionId = existingSub?.id ?? null;
    if (!existingSub) {
      const created = await tx.billingSubscription.create({
        data: {
          tenantId: tenant.id,
          planCode: "essentiel",
          status: "ACTIVE",
          provider: "SIMULATOR",
          currentPeriodStart: monthStart,
          currentPeriodEnd: addMonths(monthStart, 1),
          createdAt: addMonths(monthStart, -3),
          engineVersion: "billing-1.0",
        },
        select: { id: true },
      });
      subscriptionId = created.id;
      await tx.tenant.update({
        where: { id: tenant.id },
        data: { subscriptionPlan: "essentiel" },
      });
      console.log("✔ Abonnement Essentiel (simulateur) créé pour le Cabinet Démo.");
    } else {
      console.log("• Abonnement déjà présent — inchangé.");
    }

    // ── Historique de 2 factures payées (idempotent) ──
    const invoiceCount = await tx.billingInvoice.count({
      where: { tenantId: tenant.id },
    });
    if (invoiceCount === 0 && subscriptionId) {
      const essentiel = BILLING_PLANS.essentiel;
      const amounts = computeInvoiceAmounts(essentiel, 0);
      const year = new Date().getFullYear();
      for (let offset = 2; offset >= 1; offset -= 1) {
        const periodStart = addMonths(monthStart, -offset);
        const number = `CA-${year}-${String(3 - offset).padStart(4, "0")}`;
        await tx.billingInvoice.create({
          data: {
            tenantId: tenant.id,
            subscriptionId,
            number,
            planCode: "essentiel",
            seatsBilled: 0,
            amountCents: amounts.totalCents,
            status: "PAID",
            periodStart,
            periodEnd: addMonths(periodStart, 1),
            issuedAt: periodStart,
            paidAt: periodStart,
            lines: JSON.parse(JSON.stringify(amounts.lines)),
            engineVersion: "billing-1.0",
          },
        });
        console.log(`✔ Facture d'historique ${number} créée.`);
      }
    } else {
      console.log("• Factures d'historique déjà présentes — inchangées.");
    }

    // ── ~30 jours d'événements produit (idempotent) ──
    const eventsCount = await tx.productEvent.count({
      where: { tenantId: tenant.id },
    });
    if (eventsCount > 0) {
      console.log("• Événements produit déjà présents — inchangés.");
      return;
    }
    const rand = mulberry32(20260802);
    const now = Date.now();
    const day = 86_400_000;
    const events: {
      tenantId: string;
      occurredAt: Date;
      app: string;
      actorKind: "STAFF" | "PORTAL" | "ANONYMOUS" | "SYSTEM";
      actorId: string | null;
      sessionHash: string;
      name: string;
      props: object;
    }[] = [];
    const sessionOf = (n: number) => pseudonym(`demo-sess-${n}`);
    for (let d = 29; d >= 0; d -= 1) {
      const base = now - d * day;
      const at = (hours: number, minutes: number) =>
        new Date(base - (base % day) + hours * 3_600_000 + minutes * 60_000);
      const staffLogin = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < staffLogin; i += 1) {
        events.push({
          tenantId: tenant.id,
          occurredAt: at(8 + i, Math.floor(rand() * 50)),
          app: "web-advisor",
          actorKind: "STAFF",
          actorId: advisor.id,
          sessionHash: sessionOf(d * 3 + i),
          name: "auth.staff_login",
          props: {},
        });
      }
      if (portalUser && rand() < 0.7) {
        events.push({
          tenantId: tenant.id,
          occurredAt: at(19, Math.floor(rand() * 40)),
          app: "web-client",
          actorKind: "PORTAL",
          actorId: portalUser.id,
          sessionHash: sessionOf(900 + d),
          name: "portal.login",
          props: {},
        });
      }
      const uploads = Math.floor(rand() * 3);
      for (let i = 0; i < uploads; i += 1) {
        events.push({
          tenantId: tenant.id,
          occurredAt: at(10 + i, Math.floor(rand() * 50)),
          app: "web-advisor",
          actorKind: "STAFF",
          actorId: advisor.id,
          sessionHash: sessionOf(d * 3),
          name: "document.uploaded",
          props: { category: "RELEVE" },
        });
      }
      if (rand() < 0.35) {
        const cohort = Math.floor(d / 7);
        events.push({
          tenantId: tenant.id,
          occurredAt: at(11, Math.floor(rand() * 50)),
          app: "web-advisor",
          actorKind: "STAFF",
          actorId: advisor.id,
          sessionHash: sessionOf(d * 3 + 1),
          name: "client.created",
          props: { cohort },
        });
      }
      // Funnel signature réaliste : ~une enveloppe tous les 2 jours.
      if (d % 2 === 0) {
        const envelopeId = crypto.randomUUID();
        events.push({
          tenantId: tenant.id,
          occurredAt: at(9, 15),
          app: "web-advisor",
          actorKind: "STAFF",
          actorId: advisor.id,
          sessionHash: sessionOf(d * 3),
          name: "signature.envelope_sent",
          props: { envelopeId },
        });
        const draw = rand();
        if (draw < 0.62) {
          events.push({
            tenantId: tenant.id,
            occurredAt: at(14, 20),
            app: "web-client",
            actorKind: "PORTAL",
            actorId: portalUser?.id ?? advisor.id,
            sessionHash: sessionOf(900 + d),
            name: "signature.signed",
            props: { envelopeId },
          });
        } else if (draw < 0.82) {
          events.push({
            tenantId: tenant.id,
            occurredAt: at(15, 5),
            app: "web-client",
            actorKind: "PORTAL",
            actorId: portalUser?.id ?? advisor.id,
            sessionHash: sessionOf(900 + d),
            name: "signature.declined",
            props: { envelopeId },
          });
          events.push({
            tenantId: tenant.id,
            occurredAt: at(16, 30),
            app: "web-advisor",
            actorKind: "STAFF",
            actorId: advisor.id,
            sessionHash: sessionOf(d * 3 + 2),
            name: "signature.envelope_resent",
            props: { envelopeId: crypto.randomUUID(), resentFromId: envelopeId },
          });
        }
      }
      if (rand() < 0.25) {
        events.push({
          tenantId: tenant.id,
          occurredAt: at(13, 45),
          app: "web-advisor",
          actorKind: "STAFF",
          actorId: advisor.id,
          sessionHash: sessionOf(d * 3),
          name: "report.generated",
          props: { kind: "DOSSIER" },
        });
      }
      if (rand() < 0.2) {
        events.push({
          tenantId: tenant.id,
          occurredAt: at(7, 30),
          app: "web-marketplace",
          actorKind: "ANONYMOUS",
          actorId: null,
          sessionHash: sessionOf(700 + d),
          name: "assessment.submitted",
          props: {},
        });
      }
      if (rand() < 0.12) {
        events.push({
          tenantId: tenant.id,
          occurredAt: at(8, 5),
          app: "web-marketplace",
          actorKind: "ANONYMOUS",
          actorId: null,
          sessionHash: sessionOf(800 + d),
          name: "contact_request.submitted",
          props: {},
        });
      }
    }
    // Deux événements de pilotage sprint.
    events.push({
      tenantId: tenant.id,
      occurredAt: new Date(now - 26 * day),
      app: "web-advisor",
      actorKind: "STAFF",
      actorId: advisor.id,
      sessionHash: sessionOf(4026),
      name: "marketplace.profile_listed",
      props: {},
    });
    await tx.productEvent.createMany({
      data: events.map((event) => ({ ...event })),
    });
    console.log(`✔ ${events.length} événements produit générés (${SEED_VERSION}).`);
  });
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
