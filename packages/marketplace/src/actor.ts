import { ValidationError } from "@coadvisor/types";
import type { Role } from "@coadvisor/types";
import type { z } from "zod";

/** Contexte d'appel d'un service (RBAC vérifié systématiquement). */
export interface MarketplaceActor {
  userId: string;
  tenantId: string;
  role: Role;
}

/** Méta de requête pour l'audit (ip / user-agent, optionnelles). */
export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
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
