import { randomBytes } from "node:crypto";

import { hashSessionToken, requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withSystemContext, withTenantContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import type { HealthActor, RequestMeta } from "../actor";

/**
 * Lien portail particulier ↔ dossier client CRM (ADR-007).
 * - Le code d'invitation (alphabet non ambigu) est affiché UNE SEULE
 *   fois au conseiller ; seul son haché SHA-256 est persisté.
 * - La revendication (:3001) exige le consentement explicite du
 *   particulier (Loi 25) — consent_at matérialise l'horodatage.
 * - Le tableau de bord portail est une composition read-only vérifiée :
 *   lien ACTIVE (userId ↔ clientId) PUIS lecture confinée RLS au
 *   tenant du cabinet.
 */

const INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // sans 0/O/1/I/L
function generateInviteCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) {
    code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  }
  return code;
}

export interface PortalInvite {
  code: string; // affiché une seule fois — jamais relisible ensuite
}

/** Liens portail ACTIVE (ou en invitation) d'un dossier — composition des signataires couple (7b). */
export async function listPortalLinksForClient(
  actor: HealthActor,
  clientId: string,
) {
  requirePermission(actor.role, "clients:read");
  const links = await withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.clientPortalLink.findMany({
      where: { clientId, status: { in: ["ACTIVE", "INVITED"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        userId: true,
        status: true,
        claimedAt: true,
        createdAt: true,
      },
    }),
  );
  const userIds = links
    .map((link) => link.userId)
    .filter((id): id is string => id !== null);
  const users = await withSystemContext((tx) =>
    tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
  );
  const byId = new Map(users.map((user) => [user.id, user]));
  return links.map((link) => {
    const user = link.userId ? byId.get(link.userId) : undefined;
    return {
      ...link,
      userEmail: user?.email ?? null,
      userName: user ? `${user.firstName} ${user.lastName}` : null,
    };
  });
}

/** Le conseiller invite son client au portail — audité. */
export async function createPortalInvite(
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
): Promise<PortalInvite> {
  requirePermission(actor.role, "clients:write");

  const code = generateInviteCode();
  const inviteCodeHash = hashSessionToken(code);

  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) {
      throw new ValidationError("Ce dossier client est introuvable.");
    }

    // Sprint 7b (ADR-011) : seules les invitations NON CONSOMMÉES sont
    // invalidées — les liens ACTIVE d'AUTRES utilisateurs survivent
    // (couple : deux comptes portail distincts sur le même dossier).
    // La règle « un utilisateur = un seul lien ACTIVE » reste gravée
    // dans claimPortalInvite (révocation des anciens liens DE CET
    // utilisateur à la revendication).
    await tx.clientPortalLink.updateMany({
      where: { clientId, status: "INVITED" },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const link = await tx.clientPortalLink.create({
      data: {
        tenantId: actor.tenantId,
        clientId,
        inviteCodeHash,
        invitedBy: actor.userId,
      },
    });

    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: "portal.invited",
      entityType: "ClientPortalLink",
      entityId: link.id,
      newData: { clientId },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
  });

  return { code };
}

/** Révoque l'accès portail du client — audité. */
export async function revokePortalAccess(
  actor: HealthActor,
  clientId: string,
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");
  await withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const updated = await tx.clientPortalLink.updateMany({
      where: { clientId, status: { not: "REVOKED" } },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    if (updated.count > 0) {
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "portal.revoked",
        entityType: "ClientPortalLink",
        entityId: clientId,
        oldData: { status: "ACTIVE|INVITED" },
        newData: { status: "REVOKED", count: updated.count },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
    }
  });
}

/** Statut du lien portail pour un client (côté conseiller). */
export async function getPortalLinkForClient(
  actor: HealthActor,
  clientId: string,
) {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.clientPortalLink.findFirst({
      where: { clientId, status: { not: "REVOKED" } },
      select: { id: true, status: true, createdAt: true, claimedAt: true },
    }),
  );
}

/**
 * Revendication par le particulier (:3001) : le code lie son compte
 * au dossier — consentement obligatoire (Loi 25).
 */
export async function claimPortalInvite(
  userId: string,
  rawCode: unknown,
): Promise<void> {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (code.length < 6) {
    throw new ValidationError("Le code d'invitation est invalide.");
  }

  const inviteCodeHash = hashSessionToken(code);
  const link = await withSystemContext((tx) =>
    tx.clientPortalLink.findFirst({
      where: { inviteCodeHash, status: "INVITED" },
      select: { id: true, tenantId: true, clientId: true },
    }),
  );
  if (!link) {
    // Message générique : ne révèle ni l'existence ni le statut du code.
    throw new ValidationError(
      "Ce code est invalide, déjà utilisé ou révoqué. Vérifiez avec votre conseiller.",
    );
  }

  const alreadyLinked = await withSystemContext((tx) =>
    tx.clientPortalLink.findFirst({
      where: { userId, status: "ACTIVE", id: { not: link.id } },
      select: { id: true, clientId: true },
    }),
  );
  if (alreadyLinked) {
    // Relaxation ADR-011 : déjà lié À CE MÊME DOSSIER → succès idempotent
    // (ré-invitation du conseiller, ex. après une période d'inactivité) ;
    // l'invitation excédentaire est simplement consommée. Déjà lié à un
    // AUTRE dossier → la règle « un seul lien ACTIVE par utilisateur »
    // demeure ferme.
    if (alreadyLinked.clientId === link.clientId) {
      await withTenantContext(link.tenantId, userId, async (tx) => {
        await tx.clientPortalLink.update({
          where: { id: link.id },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
        await recordAudit(tx, {
          tenantId: link.tenantId,
          actorUserId: userId,
          action: "portal.claim_redundant",
          entityType: "ClientPortalLink",
          entityId: link.id,
          newData: { clientId: link.clientId, alreadyLinked: true },
        });
      });
      return;
    }
    throw new ValidationError(
      "Votre compte est déjà lié à un dossier. Révoquez-le d'abord ou contactez votre conseiller.",
    );
  }

  await withTenantContext(link.tenantId, userId, async (tx) => {
    await tx.clientPortalLink.update({
      where: { id: link.id },
      data: {
        userId,
        status: "ACTIVE",
        claimedAt: new Date(),
        consentAt: new Date(),
      },
    });
    await recordAudit(tx, {
      tenantId: link.tenantId,
      actorUserId: userId,
      action: "portal.claimed",
      entityType: "ClientPortalLink",
      entityId: link.id,
      newData: { clientId: link.clientId, consent: true },
    });
  });
}

/** Tableau de bord FHI du particulier (read-only) — lien ACTIVE requis. */
export async function getPortalDashboard(userId: string) {
  const link = await withSystemContext((tx) =>
    tx.clientPortalLink.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { tenantId: true, clientId: true },
    }),
  );
  if (!link) {
    return null;
  }

  return withTenantContext(link.tenantId, userId, async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: link.clientId },
      select: {
        firstName: true,
        financialGoals: {
          where: { status: "ACTIVE" },
          select: { name: true, targetAmount: true, targetDate: true, priority: true },
          orderBy: { priority: "desc" },
          take: 5,
        },
        tenant: { select: { name: true } },
      },
    });
    const latest = await tx.healthAssessment.findFirst({
      where: { clientId: link.clientId },
      orderBy: { createdAt: "desc" },
      include: {
        insights: {
          select: {
            type: true,
            category: true,
            severity: true,
            message: true,
            recommendation: true,
          },
        },
        progress: true,
      },
    });
    const history = await tx.healthAssessment.findMany({
      where: { clientId: link.clientId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { score: true, createdAt: true, progress: { select: { delta: true } } },
    });

    return client ? { client, latest, history } : null;
  });
}
