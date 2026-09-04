/**
 * @coadvisor/types — Contrats partagés du monorepo.
 *
 * Ces types reflètent les enums Prisma (source de vérité : packages/database)
 * et servent aux frontières entre modules (pas d'import croisé de Prisma
 * hors de la couche données).
 */

// ── Rôles & permissions (FR-CORE-002) ────────────────────────
export const ROLES = [
  "ADMIN",
  "ADVISOR",
  "ASSISTANT",
  "CLIENT",
  "COMPLIANCE_OFFICER",
] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "tenant:manage"
  | "members:invite"
  | "members:read"
  | "billing:manage"
  | "audit:read"
  | "clients:read"
  | "clients:write"
  | "leads:read"
  | "leads:write"
  | "marketplace:read"
  | "marketplace:write"
  | "documents:read"
  | "documents:write"
  | "compliance:read";

// ── Enums métier ─────────────────────────────────────────────
export type TenantType = "FIRM" | "INDEPENDENT_ADVISOR" | "ENTERPRISE";
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type UserStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

// ── Session ──────────────────────────────────────────────────
export const SESSION_COOKIE_NAME = "coadvisor.session";

export interface SessionUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  mfaEnabled: boolean;
}

/** État standard des formulaires d'authentification (server actions). */
export interface AuthFormState {
  error?: string;
}

// ── Métadonnées de requête (audit / sécurité) ────────────────
export interface RequestMeta {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

// ── Erreurs de domaine ───────────────────────────────────────
export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class AuthenticationError extends DomainError {
  constructor(message = "Courriel ou mot de passe invalide.") {
    super(message, "AUTHENTICATION_FAILED");
  }
}

export class AuthorizationError extends DomainError {
  constructor(message = "Accès refusé.") {
    super(message, "FORBIDDEN");
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}
