import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";
import { z } from "zod";

import { parseOrThrow } from "../actor";
import type { CrmActor, RequestMeta } from "../actor";

/**
 * Liens inter-clients certifiés par le professionnel (Sprint 7c —
 * correctif 4, ADR-012) : couple, famille, affaires, procuration.
 *
 * Règles d'affaires :
 * - créé et révoqué UNIQUEMENT par un membre du cabinet (RLS 0019 +
 *   permission `clients:write` + audit in-transaction) ;
 * - les DEUX fiches doivent relever du même tenant (le ménage vit
 *   dans le cabinet) ;
 * - la paire est ordonnée (a < b) et unique — la relation est
 *   symétrique par construction, navigable dans les deux sens ;
 * - aucune exposition au portail ni au contexte public externe.
 */

export const CLIENT_LINK_TYPES = [
  "CONJOINT",
  "FAMILLE",
  "AFFAIRES",
  "PROCURATION",
  "AUTRE",
] as const;
export type ClientLinkTypeValue = (typeof CLIENT_LINK_TYPES)[number];

export const CLIENT_LINK_TYPE_LABELS: Record<ClientLinkTypeValue, string> = {
  CONJOINT: "Conjoint·e",
  FAMILLE: "Famille",
  AFFAIRES: "Associé·e / affaires",
  PROCURATION: "Procuration",
  AUTRE: "Autre lien",
};

const linkCreateSchema = z.object({
  otherClientId: z.string().uuid("Le dossier à lier est invalide."),
  type: z.enum(CLIENT_LINK_TYPES, {
    message: "Le type de lien est invalide.",
  }),
  note: z
    .string()
    .trim()
    .max(300, "La note ne peut pas dépasser 300 caractères.")
    .optional(),
});

export interface ClientLinkRow {
  id: string;
  type: ClientLinkTypeValue;
  note: string | null;
  /** L'AUTRE fiche (vue symétrique). */
  otherClientId: string;
  otherClientName: string;
  createdAt: Date;
  createdByName: string;
}

/** Liens certifiés d'une fiche (les deux sens — affichage fiche). */
export async function listClientLinks(
  actor: CrmActor,
  clientId: string,
): Promise<ClientLinkRow[]> {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const rows = await tx.clientLink.findMany({
      where: { OR: [{ clientIdA: clientId }, { clientIdB: clientId }] },
      orderBy: { createdAt: "desc" },
    });
    const otherIds = rows.map((row) =>
      row.clientIdA === clientId ? row.clientIdB : row.clientIdA,
    );
    const [others, creators] = await Promise.all([
      tx.client.findMany({
        where: { id: { in: otherIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      tx.user.findMany({
        where: { id: { in: rows.map((row) => row.createdById) } },
        select: { id: true, firstName: true, lastName: true },
      }).catch(() => []),
    ]);
    const nameById = new Map(
      others.map((row) => [row.id, `${row.firstName} ${row.lastName}`] as const),
    );
    const creatorById = new Map(creators.map((row) => [row.id, row]));
    return rows.map((row) => {
      const otherClientId =
        row.clientIdA === clientId ? row.clientIdB : row.clientIdA;
      const creator = creatorById.get(row.createdById);
      return {
        id: row.id,
        type: row.type as ClientLinkTypeValue,
        note: row.note,
        otherClientId,
        otherClientName: nameById.get(otherClientId) ?? "Dossier lié",
        createdAt: row.createdAt,
        createdByName: creator
          ? `${creator.firstName} ${creator.lastName}`
          : "Membre du cabinet",
      };
    });
  });
}

/** Certifie un lien entre deux fiches du cabinet (audit + idempotent FR). */
export async function createClientLink(
  actor: CrmActor,
  clientId: string,
  rawInput: unknown,
  meta: RequestMeta = {},
): Promise<ClientLinkRow> {
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(linkCreateSchema, rawInput);
  if (input.otherClientId === clientId) {
    throw new ValidationError("Un dossier ne peut pas être lié à lui-même.");
  }
  const [clientIdA, clientIdB] =
    clientId < input.otherClientId
      ? [clientId, input.otherClientId]
      : [input.otherClientId, clientId];

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const other = await tx.client.findFirst({
      where: { id: input.otherClientId },
      select: { id: true, firstName: true, lastName: true, status: true },
    });
    if (!other) {
      throw new ValidationError("Le dossier à lier est introuvable dans votre cabinet.");
    }
    const existing = await tx.clientLink.findFirst({
      where: { clientIdA, clientIdB },
    });
    if (existing) {
      throw new ValidationError(
        "Ces deux dossiers sont déjà liés — modifiez le lien existant plutôt que d'en créer un second.",
      );
    }

    const created = await tx.clientLink.create({
      data: {
        tenantId: actor.tenantId,
        clientIdA,
        clientIdB,
        type: input.type,
        note: input.note ?? null,
        createdById: actor.userId,
      },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "crm.client_link.created",
      entityType: "ClientLink",
      entityId: created.id,
      newData: {
        clientIdA,
        clientIdB,
        type: input.type,
        note: input.note ?? null,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const creator = await tx.user
      .findUnique({
        where: { id: actor.userId },
        select: { firstName: true, lastName: true },
      })
      .catch(() => null);

    return {
      id: created.id,
      type: input.type,
      note: input.note ?? null,
      otherClientId: input.otherClientId,
      otherClientName: `${other.firstName} ${other.lastName}`,
      createdAt: created.createdAt,
      createdByName: creator
        ? `${creator.firstName} ${creator.lastName}`
        : "Membre du cabinet",
    };
  });
}

/** Révoque un lien certifié (oldData auditée — preuve du retrait). */
export async function deleteClientLink(
  actor: CrmActor,
  linkId: string,
  meta: RequestMeta = {},
): Promise<void> {
  requirePermission(actor.role, "clients:write");
  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const link = await tx.clientLink.findFirst({ where: { id: linkId } });
    if (!link) {
      throw new ValidationError("Ce lien est introuvable (déjà retiré ?).");
    }
    await tx.clientLink.delete({ where: { id: linkId } });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "crm.client_link.deleted",
      entityType: "ClientLink",
      entityId: linkId,
      oldData: {
        clientIdA: link.clientIdA,
        clientIdB: link.clientIdB,
        type: link.type,
        note: link.note,
        createdById: link.createdById,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });
}
