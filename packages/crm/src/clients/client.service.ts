import { trackSafely } from "@coadvisor/analytics";
import { requirePermission } from "@coadvisor/auth";
import {
  assertClientQuota,
  BILLING_PLANS,
  computeTenantUsage,
  getPlan,
  resolveEffectivePlan,
} from "@coadvisor/billing";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";

import { parseOrThrow } from "../actor";
import type { CrmActor, RequestMeta } from "../actor";
import { addTimelineEntry } from "../timeline/timeline.service";
import { clientSearchSchema, createClientSchema } from "../schemas";

/** FR-CRM-001 — Créer un dossier client (audit + timeline atomiques). */
export async function createClient(
  rawInput: unknown,
  actor: CrmActor,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(createClientSchema, rawInput);

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    // Plafond « dossiers actifs » du palier (Sprint 8 — ADR-013) : la
    // mesure précède la création, dans la MÊME transaction.
    const plan = await resolveEffectivePlan(
      tx,
      actor.tenantId,
      (code) => getPlan(code) ?? BILLING_PLANS.decouverte,
      BILLING_PLANS.decouverte,
    );
    assertClientQuota(plan, await computeTenantUsage(tx, actor.tenantId));

    const client = await tx.client.create({
      data: {
        tenantId: actor.tenantId,
        advisorId: actor.userId,
        firstName: input.firstName,
        lastName: input.lastName,
        type: input.type,
        email: input.email ?? null,
        phone: input.phone ?? null,
        birthDate: input.birthDate ?? null,
      },
    });

    await addTimelineEntry(tx, actor.tenantId, {
      clientId: client.id,
      eventType: "FINANCIAL_EVENT",
      title: "Dossier client créé",
      source: "SYSTEM",
      createdBy: actor.userId,
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "client.created",
      entityType: "Client",
      entityId: client.id,
      newData: {
        firstName: client.firstName,
        lastName: client.lastName,
        type: client.type,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Mesure produit first-party (Sprint 8, ADR-014).
    await trackSafely(tx, {
      tenantId: actor.tenantId,
      app: "web-advisor",
      actorKind: "STAFF",
      actorId: actor.userId,
      name: "client.created",
      props: { clientId: client.id },
    });

    return client;
  });
}

export interface ListClientsOptions {
  query?: string | undefined;
  status?: "PROSPECT" | "ACTIVE" | "ARCHIVED" | undefined;
  limit?: number;
}

/** Liste des clients du cabinet — permission `clients:read`. */
export async function listClients(
  actor: CrmActor,
  options: ListClientsOptions = {},
) {
  requirePermission(actor.role, "clients:read");
  const search = parseOrThrow(clientSearchSchema, {
    q: options.query,
    status: options.status,
  });

  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.client.findMany({
      where: {
        status: search.status,
        ...(search.q
          ? {
              OR: [
                { firstName: { contains: search.q, mode: "insensitive" } },
                { lastName: { contains: search.q, mode: "insensitive" } },
                { email: { contains: search.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: options.limit ?? 50,
      include: {
        _count: { select: { tasks: { where: { status: "TODO" } }, notes: true } },
      },
    }),
  );
}

export async function countClients(actor: CrmActor): Promise<number> {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.client.count({ where: { status: { not: "ARCHIVED" } } }),
  );
}

/** Dossier client 360° — `clients:read`. null si inaccessible (RLS/refus). */
export async function getClient(actor: CrmActor, clientId: string) {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.client.findFirst({
      where: { id: clientId },
      include: {
        familyMembers: { orderBy: { createdAt: "asc" } },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            author: { select: { firstName: true, lastName: true } },
          },
        },
        timelineEvents: { orderBy: { eventDate: "desc" }, take: 30 },
        tasks: { orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 30 },
      },
    }),
  );
}
