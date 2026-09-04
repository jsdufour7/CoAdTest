import { requirePermission } from "@coadvisor/auth";
import { withTenantContext } from "@coadvisor/database";
import type { DbContext } from "@coadvisor/database";

import type { CrmActor } from "../actor";

export interface TimelineEntry {
  clientId: string;
  eventType:
    | "LIFE_EVENT"
    | "FINANCIAL_EVENT"
    | "MEETING"
    | "COMPLIANCE"
    | "DOCUMENT"
    | "GOAL";
  title: string;
  description?: string;
  source?: "MANUAL" | "SYSTEM" | "IMPORT";
  createdBy?: string;
  eventDate?: Date;
}

/**
 * Chronologie Financial Life OS (FR-CRM-002) — chaque événement important
 * devient une entrée. Jamais de suppression : l'historique est préservé
 * (Playbook Règle 3).
 */
export async function addTimelineEntry(
  tx: DbContext,
  tenantId: string,
  entry: TimelineEntry,
): Promise<void> {
  await tx.timelineEvent.create({
    data: {
      tenantId,
      clientId: entry.clientId,
      eventType: entry.eventType,
      title: entry.title,
      description: entry.description ?? null,
      source: entry.source ?? "MANUAL",
      createdBy: entry.createdBy ?? null,
      eventDate: entry.eventDate ?? new Date(),
    },
  });
}

/** Timeline d'un dossier client — permission `clients:read`. */
export async function listTimeline(
  actor: CrmActor,
  clientId: string,
  limit = 30,
) {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.timelineEvent.findMany({
      where: { clientId },
      orderBy: { eventDate: "desc" },
      take: limit,
    }),
  );
}
