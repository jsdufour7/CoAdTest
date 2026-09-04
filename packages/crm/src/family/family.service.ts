import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";

import { parseOrThrow } from "../actor";
import type { CrmActor, RequestMeta } from "../actor";
import { addTimelineEntry } from "../timeline/timeline.service";
import { addFamilyMemberSchema } from "../schemas";

/** Ajoute un membre de l'entourage financier du client (conjoint, enfant…). */
export async function addFamilyMember(
  rawInput: unknown,
  actor: CrmActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(addFamilyMemberSchema, rawInput);

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const member = await tx.familyMember.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        birthDate: input.birthDate ?? null,
        notes: input.notes ?? null,
      },
    });

    await addTimelineEntry(tx, actor.tenantId, {
      clientId,
      eventType: "LIFE_EVENT",
      title: `Membre de famille ajouté : ${member.firstName} ${member.lastName}`,
      createdBy: actor.userId,
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "familyMember.created",
      entityType: "FamilyMember",
      entityId: member.id,
      newData: {
        clientId,
        name: `${member.firstName} ${member.lastName}`,
        role: member.role,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return member;
  });
}
