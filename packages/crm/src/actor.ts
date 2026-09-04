import { ValidationError } from "@coadvisor/types";
import type { RequestMeta, Role } from "@coadvisor/types";
import type { z } from "zod";

/** Contexte d'appel d'un service CRM (toujours vérifié RBAC en amont). */
export interface CrmActor {
  userId: string;
  tenantId: string;
  role: Role;
}

export type { RequestMeta };

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
