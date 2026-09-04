import { randomBytes } from "node:crypto";

import {
  hashPassword,
  requirePermission,
  validatePassword,
} from "@coadvisor/auth";
import { withSystemContext, withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";
import type { RequestMeta, Role } from "@coadvisor/types";
import { z } from "zod";

import { recordAudit } from "../audit/audit.service";
import { inviteMemberSchema } from "../tenants/tenant.schemas";

export interface Membership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: Role;
}

/** Organisations auxquelles appartient l'utilisateur (flux post-login). */
export async function getUserTenants(userId: string): Promise<Membership[]> {
  const rows = await withSystemContext((tx) =>
    tx.tenantUser.findMany({
      where: { userId, status: { not: "SUSPENDED" } },
      include: { tenant: true },
      orderBy: { createdAt: "asc" },
    }),
  );
  return rows.map((row) => ({
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    tenantSlug: row.tenant.slug,
    role: row.role,
  }));
}

export interface InviteUserResult {
  userId: string;
  email: string;
  /** Mot de passe temporaire à transmettre (flux courriel complet : Sprint 2). */
  temporaryPassword: string;
}

/**
 * Invitation d'un membre au cabinet.
 * Permission `members:invite` vérifiée AVANT l'écriture (RBAC applicatif);
 * la RLS demeure le filet de sécurité sous-jacent.
 */
export async function inviteUser(
  rawInput: unknown,
  actor: { userId: string; tenantId: string; role: Role },
  meta: RequestMeta = {},
): Promise<InviteUserResult> {
  requirePermission(actor.role, "members:invite");

  const parsed = inviteMemberSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }
  const input = parsed.data;

  const temporaryPassword = `${randomBytes(12).toString("base64url")}Aa1`;
  const passwordHash = await hashPassword(temporaryPassword);
  const email = input.email.toLowerCase();

  return withSystemContext(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });

    if (user) {
      const alreadyMember = await tx.tenantUser.findUnique({
        where: {
          tenantId_userId: { tenantId: actor.tenantId, userId: user.id },
        },
      });
      if (alreadyMember) {
        throw new ValidationError(
          "Cette personne est déjà membre de l'organisation.",
        );
      }
    } else {
      user = await tx.user.create({
        data: {
          email,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash,
          status: "INVITED",
        },
      });
    }

    await tx.tenantUser.create({
      data: {
        tenantId: actor.tenantId,
        userId: user.id,
        role: input.role,
        status: "INVITED",
      },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "member.invited",
      entityType: "User",
      entityId: user.id,
      newData: { email, role: input.role },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { userId: user.id, email, temporaryPassword };
  });
}

/** Membres du cabinet — permission `members:read` requise. */
export async function listMembers(
  actor: { userId: string; role: Role },
  tenantId: string,
) {
  requirePermission(actor.role, "members:read");
  return withTenantContext(tenantId, actor.userId, (tx) =>
    tx.tenantUser.findMany({
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  );
}

const signupIndividualSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(80),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Courriel invalide.")
    .max(160),
  password: z.string().min(1, "Le mot de passe est requis."),
});

/**
 * Inscription d'un particulier (portail client :3001).
 * AUCUN tenant créé : le compte ne prend sens que lorsqu'il est lié à un
 * dossier client par code d'invitation (ClientPortalLink). Pas de ligne
 * d'audit (audit_logs exige un tenant) — traçabilité par la ligne elle-même.
 */
export async function signupIndividual(
  rawInput: unknown,
): Promise<{ userId: string; email: string }> {
  const parsed = signupIndividualSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const passwordErrors = validatePassword(parsed.data.password);
  if (passwordErrors.length > 0) {
    throw new ValidationError(passwordErrors.join(" "));
  }

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);

  return withSystemContext(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      throw new ValidationError("Un compte existe déjà avec ce courriel.");
    }
    const user = await tx.user.create({
      data: {
        email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        passwordHash,
        status: "ACTIVE",
      },
      select: { id: true, email: true },
    });
    return { userId: user.id, email: user.email };
  });
}
