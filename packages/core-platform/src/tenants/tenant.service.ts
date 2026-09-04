import { hashPassword, validatePassword } from "@coadvisor/auth";
import { withSystemContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";
import type { RequestMeta } from "@coadvisor/types";

import { recordAudit } from "../audit/audit.service";
import { uniqueSlug } from "../lib/slug";
import { bootstrapCabinetSchema } from "./tenant.schemas";

export interface BootstrapCabinetResult {
  tenant: { id: string; name: string; slug: string };
  admin: { id: string; email: string };
}

/**
 * Parcours « Un cabinet crée son environnement sécurisé » (Sprint 1).
 * Atomique : Tenant + User administrateur + TenantUser(ADMIN) + audit,
 * dans une seule transaction — tout ou rien.
 */
export async function bootstrapCabinet(
  rawInput: unknown,
  meta: RequestMeta = {},
): Promise<BootstrapCabinetResult> {
  const parsed = bootstrapCabinetSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }
  const input = parsed.data;

  const passwordErrors = validatePassword(input.password);
  if (passwordErrors.length > 0) {
    throw new ValidationError(passwordErrors.join(" "));
  }

  const email = input.email.toLowerCase();
  const passwordHash = await hashPassword(input.password);

  return withSystemContext(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      // TODO(prod) : message générique + limitation de débit anti-énumération.
      throw new ValidationError("Un compte existe déjà avec ce courriel.");
    }

    const tenant = await tx.tenant.create({
      data: {
        name: input.firmName,
        slug: uniqueSlug(input.firmName),
        type: "FIRM",
      },
      select: { id: true, name: true, slug: true },
    });

    const admin = await tx.user.create({
      data: {
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        status: "ACTIVE",
      },
      select: { id: true, email: true },
    });

    await tx.tenantUser.create({
      data: { tenantId: tenant.id, userId: admin.id, role: "ADMIN" },
    });

    await recordAudit(tx, {
      tenantId: tenant.id,
      actorUserId: admin.id,
      action: "tenant.created",
      entityType: "Tenant",
      entityId: tenant.id,
      newData: { name: tenant.name, slug: tenant.slug },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    await recordAudit(tx, {
      tenantId: tenant.id,
      actorUserId: admin.id,
      action: "user.created",
      entityType: "User",
      entityId: admin.id,
      newData: { email: admin.email, role: "ADMIN" },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { tenant, admin };
  });
}
