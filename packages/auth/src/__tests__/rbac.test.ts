import { AuthorizationError } from "@coadvisor/types";
import { describe, expect, it } from "vitest";

import { hasPermission, requirePermission, ROLE_PERMISSIONS } from "../rbac";

describe("RBAC — matrice des permissions", () => {
  it("couvre les 5 rôles", () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(5);
  });

  it("ADMIN peut gérer le tenant et inviter", () => {
    expect(hasPermission("ADMIN", "tenant:manage")).toBe(true);
    expect(hasPermission("ADMIN", "members:invite")).toBe(true);
  });

  it("ADVISOR gère les clients mais pas les membres", () => {
    expect(hasPermission("ADVISOR", "clients:write")).toBe(true);
    expect(hasPermission("ADVISOR", "members:invite")).toBe(false);
  });

  it("ASSISTANT est en lecture seule sur les clients", () => {
    expect(hasPermission("ASSISTANT", "clients:read")).toBe(true);
    expect(hasPermission("ASSISTANT", "clients:write")).toBe(false);
  });

  it("CLIENT n'a aucune permission back-office", () => {
    expect(ROLE_PERMISSIONS.CLIENT).toEqual([]);
  });

  it("COMPLIANCE_OFFICER lit l'audit sans pouvoir écrire les clients", () => {
    expect(hasPermission("COMPLIANCE_OFFICER", "audit:read")).toBe(true);
    expect(hasPermission("COMPLIANCE_OFFICER", "clients:write")).toBe(false);
  });

  it("requirePermission lève AuthorizationError si refusé", () => {
    expect(() => requirePermission("ASSISTANT", "members:invite")).toThrow(
      AuthorizationError,
    );
    expect(() => requirePermission("ADMIN", "members:invite")).not.toThrow();
  });
});
