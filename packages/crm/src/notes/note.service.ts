import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";

import { parseOrThrow } from "../actor";
import type { CrmActor, RequestMeta } from "../actor";
import { addTimelineEntry } from "../timeline/timeline.service";
import { addNoteSchema } from "../schemas";

/**
 * Ajoute une note au dossier (audit obligatoire — Compliance).
 * Une note de type MEETING génère aussi une entrée timeline MEETING.
 */
export async function addNote(
  rawInput: unknown,
  actor: CrmActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(addNoteSchema, rawInput);

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const note = await tx.note.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        authorId: actor.userId,
        type: input.type,
        content: input.content,
      },
    });

    if (input.type === "MEETING") {
      await addTimelineEntry(tx, actor.tenantId, {
        clientId,
        eventType: "MEETING",
        title: "Note de rencontre",
        createdBy: actor.userId,
      });
    }

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "note.created",
      entityType: "Note",
      entityId: note.id,
      newData: { clientId, type: input.type },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return note;
  });
}
