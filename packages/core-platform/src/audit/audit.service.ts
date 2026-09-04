import { requirePermission } from "@coadvisor/auth";
import { withTenantContext } from "@coadvisor/database";
import type { DbContext, Prisma } from "@coadvisor/database";
import type { RequestMeta, Role } from "@coadvisor/types";

export interface AuditEntry {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldData?: unknown;
  newData?: unknown;
}

/** Normalise en JSONB propre (strip undefined, fonctions, références). */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Enregistre une entrée d'audit DANS la transaction courante (ADR-004) :
 * l'entrée naît ou meurt avec la mutation auditée — jamais d'audit orphelin.
 * La table est INSERT/SELECT only pour le rôle applicatif (migration 0002).
 */
export async function recordAudit(
  tx: DbContext,
  entry: AuditEntry & RequestMeta,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      oldData: entry.oldData === undefined ? undefined : toJson(entry.oldData),
      newData: entry.newData === undefined ? undefined : toJson(entry.newData),
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}

export interface AuditActor {
  userId: string;
  role: Role;
}

export interface AuditLogFilters {
  /** Sous-chaîne d'action, ex. "documents." (insensible à la casse). */
  action?: string | undefined;
  /** Type d'entité exact, ex. "Document". */
  entityType?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

/** Lecture du journal — permission `audit:read` requise (ADMIN, COMPLIANCE_OFFICER). */
export async function listAuditLogs(
  actor: AuditActor,
  tenantId: string,
  limitOrFilters: number | (AuditLogFilters & { limit?: number }) = 50,
) {
  requirePermission(actor.role, "audit:read");
  const filters: AuditLogFilters & { limit: number } =
    typeof limitOrFilters === "number"
      ? { limit: limitOrFilters }
      : { limit: 50, ...limitOrFilters };

  return withTenantContext(tenantId, actor.userId, (tx) =>
    tx.auditLog.findMany({
      where: {
        action: filters.action
          ? { contains: filters.action, mode: "insensitive" }
          : undefined,
        entityType: filters.entityType ?? undefined,
        createdAt:
          filters.from || filters.to
            ? {
                gte: filters.from,
                lte: filters.to,
              }
            : undefined,
      },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
    }),
  );
}

/** Échappement CSV RFC 4180. */
function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

const AUDIT_CSV_HEADER = [
  "horodatage_utc",
  "action",
  "entite",
  "entite_id",
  "acteur_id",
  "ip",
  "agent_utilisateur",
  "details",
];

/**
 * Export CSV du journal filtré (mêmes filtres que la page Conformité) —
 * borné, horodaté et lui-même AUDITÉ. BOM UTF-8 pour Excel français.
 */
export async function exportAuditCsv(
  actor: AuditActor & { tenantId: string },
  filters: AuditLogFilters,
  meta: RequestMeta & { maxRows?: number } = {},
): Promise<{ fileName: string; csv: string; rowCount: number }> {
  const maxRows = Math.min(meta.maxRows ?? 2000, 10_000);
  const logs = await listAuditLogs(actor, actor.tenantId, {
    ...filters,
    limit: maxRows,
  });

  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "compliance.audit.exported",
      entityType: "AuditLog",
      newData: {
        action: filters.action ?? null,
        entityType: filters.entityType ?? null,
        from: filters.from?.toISOString() ?? null,
        to: filters.to?.toISOString() ?? null,
        rowCount: logs.length,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  const lines = [
    AUDIT_CSV_HEADER.join(","),
    ...logs.map((log) =>
      [
        csvCell(log.createdAt.toISOString()),
        csvCell(log.action),
        csvCell(log.entityType),
        csvCell(log.entityId ?? ""),
        csvCell(log.actorUserId ?? ""),
        csvCell(log.ipAddress ?? ""),
        csvCell(log.userAgent ?? ""),
        csvCell(
          log.newData !== null ? JSON.stringify(log.newData) : "",
        ),
      ].join(","),
    ),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    fileName: `journal-audit-${stamp}.csv`,
    // BOM UTF-8 en séquence d’échappement : Excel ouvre le CSV avec accents.
    csv: `\uFEFF${lines.join("\n")}`,
    rowCount: logs.length,
  };
}
