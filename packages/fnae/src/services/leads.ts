import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withSystemContext, withTenantContext } from "@coadvisor/database";

import type { FnaeActor } from "../actor";

/**
 * Boîte de réception des leads du cabinet (côté conseiller).
 * Leads tenant-scopés : RLS + RBAC + audit sur les transitions de statut.
 * NB : la table assessments est à portée plateforme (ADR-006) — sa lecture
 * passe par le contexte système APRÈS vérification RBAC du conseiller.
 */

/** Liste les leads transmis au cabinet — permission `leads:read`. */
export async function listLeads(
  actor: FnaeActor,
  options: { status?: "NEW" | "CONTACTED" | "CONVERTED" | "DISMISSED" } = {},
) {
  requirePermission(actor.role, "leads:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.lead.findMany({
      where: { status: options.status },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
}

export async function countNewLeads(actor: FnaeActor): Promise<number> {
  requirePermission(actor.role, "leads:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.lead.count({ where: { status: "NEW" } }),
  );
}

/**
 * Fiche lead + portrait financier associé.
 * null si le lead n'appartient pas au cabinet (RLS).
 */
export async function getLead(actor: FnaeActor, leadId: string) {
  requirePermission(actor.role, "leads:read");

  const lead = await withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.lead.findFirst({ where: { id: leadId } }),
  );
  if (!lead) {
    return null;
  }

  // Portrait (table plateforme — lecture privilégiée après RBAC, voir ADR-006).
  // Nullable depuis le Sprint 6 : un lead « annuaire » peut exister sans
  // questionnaire (contact direct via la marketplace).
  const assessment = lead.assessmentId
    ? await withSystemContext((tx) =>
        tx.assessment.findUnique({
          where: { id: lead.assessmentId as string },
          select: {
            id: true,
            score: true,
            categoryScores: true,
            report: true,
            engineVersion: true,
            createdAt: true,
            answers: true,
          },
        }),
      )
    : null;

  return { ...lead, assessment };
}

/** Transition de statut manuelle (pris en charge / écarté) — auditée. */
export async function setLeadStatus(
  actor: FnaeActor,
  leadId: string,
  status: "CONTACTED" | "DISMISSED",
) {
  requirePermission(actor.role, "leads:write");

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const previous = await tx.lead.findFirst({ where: { id: leadId } });
    if (!previous) {
      return null;
    }

    const lead = await tx.lead.update({
      where: { id: leadId },
      data: { status },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "lead.status_changed",
      entityType: "Lead",
      entityId: lead.id,
      oldData: { status: previous.status },
      newData: { status: lead.status },
    });

    return lead;
  });
}

/**
 * Marque le lead comme converti en client CRM (composition orchestrée
 * par l'app : crm.createClient PUIS markLeadConverted) — auditée.
 */
export async function markLeadConverted(
  actor: FnaeActor,
  leadId: string,
  clientId: string,
) {
  requirePermission(actor.role, "leads:write");

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const previous = await tx.lead.findFirst({ where: { id: leadId } });
    if (!previous) {
      return null;
    }

    const lead = await tx.lead.update({
      where: { id: leadId },
      data: { status: "CONVERTED", clientId },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "lead.converted",
      entityType: "Lead",
      entityId: lead.id,
      oldData: { status: previous.status },
      newData: { status: lead.status, clientId },
    });

    return lead;
  });
}
