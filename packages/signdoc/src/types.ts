import { ValidationError } from "@coadvisor/types";
import type { Role } from "@coadvisor/types";
import type { z } from "zod";

/**
 * Types de base de Signdoc — volontairement DÉCOUPLÉS de tout autre
 * domaine CoAdvisor : le jour où Signdoc devient une application
 * autonome (ADR-012), ces types sont la surface de l'API publique
 * telle quelle (DTO stables, sérialisables en JSON pour le REST).
 */

/** Contexte d'appel (RBAC vérifié systématiquement côté service). */
export interface SigndocActor {
  userId: string;
  tenantId: string;
  role: Role;
}

/** Méta de requête pour la piste d'audit (ip / agent, optionnelles). */
export interface RequestMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

/** Parse zod uniforme → ValidationError avec messages français. */
export function parseOrThrow<S extends z.ZodType>(
  schema: S,
  input: unknown,
): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }
  return parsed.data;
}
