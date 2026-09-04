import { AuthorizationError } from "@coadvisor/types";
import type { Permission, Role } from "@coadvisor/types";

/**
 * Matrice des permissions (FR-CORE-002).
 * Source unique de vérité — appliquée aux 3 niveaux : service, UI, DB (RLS).
 */
export const ROLE_PERMISSIONS: Readonly<
  Record<Role, readonly Permission[]>
> = {
  ADMIN: [
    "tenant:manage",
    "members:invite",
    "members:read",
    "billing:manage",
    "audit:read",
    "clients:read",
    "clients:write",
    "leads:read",
    "leads:write",
    "marketplace:read",
    "marketplace:write",
    "documents:read",
    "documents:write",
    "compliance:read",
  ],
  ADVISOR: [
    "members:read",
    "clients:read",
    "clients:write",
    "leads:read",
    "leads:write",
    "marketplace:read",
    "marketplace:write",
    "documents:read",
    "documents:write",
  ],
  ASSISTANT: [
    "members:read",
    "clients:read",
    "leads:read",
    "marketplace:read",
    "documents:read",
  ],
  CLIENT: [],
  COMPLIANCE_OFFICER: [
    "members:read",
    "audit:read",
    "compliance:read",
    "clients:read",
    "leads:read",
    "marketplace:read",
    "documents:read",
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(
      `Cette action requiert la permission « ${permission} ».`,
    );
  }
}
