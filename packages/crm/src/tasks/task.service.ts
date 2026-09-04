import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";

import { parseOrThrow } from "../actor";
import type { CrmActor, RequestMeta } from "../actor";
import { addTaskSchema } from "../schemas";

/** Crée une tâche de suivi sur un dossier client. */
export async function addTask(
  rawInput: unknown,
  actor: CrmActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");
  const input = parseOrThrow(addTaskSchema, rawInput);

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const task = await tx.task.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        createdBy: actor.userId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
      },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "task.created",
      entityType: "Task",
      entityId: task.id,
      newData: { clientId, title: task.title, priority: task.priority },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return task;
  });
}

/** Marquer une tâche comme complétée / à refaire (historique d'audit conservé). */
export async function setTaskStatus(
  taskId: string,
  status: "TODO" | "DONE",
  actor: CrmActor,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const previous = await tx.task.findFirst({ where: { id: taskId } });
    if (!previous) {
      return null;
    }

    const task = await tx.task.update({
      where: { id: taskId },
      data: {
        status,
        completedAt: status === "DONE" ? new Date() : null,
      },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "task.updated",
      entityType: "Task",
      entityId: task.id,
      oldData: { status: previous.status },
      newData: { status: task.status },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return task;
  });
}
