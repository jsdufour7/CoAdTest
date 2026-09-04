import { describe, expect, it } from "vitest";

import { QuotaExceededError } from "../errors";
import {
  assertAnalyticsAccess,
  assertClientQuota,
  assertEnvelopeQuota,
  assertMarketplaceListing,
  assertSeatQuota,
  assertVaultQuota,
} from "../entitlements";
import {
  BILLING_PLANS,
  formatBytesLimit,
  formatCad,
  getPlan,
  isUpgrade,
  PLAN_ORDER,
  smallestPlanCovering,
} from "../plans";
import type { TenantUsage } from "../usage";

const usage = (over: Partial<TenantUsage> = {}): TenantUsage => ({
  clientsActive: 0,
  seatsUsed: 1,
  vaultBytes: 0,
  envelopesThisMonth: 0,
  listedProfiles: 0,
  ...over,
});

describe("catalogue des paliers (grille fondatrice 0/59/119/199 $)", () => {
  it("prix CAD en cents, ordre croissant", () => {
    expect(PLAN_ORDER).toEqual(["decouverte", "essentiel", "pro", "cabinet"]);
    expect(BILLING_PLANS.decouverte.priceCentsPerMonth).toBe(0);
    expect(BILLING_PLANS.essentiel.priceCentsPerMonth).toBe(5900);
    expect(BILLING_PLANS.pro.priceCentsPerMonth).toBe(11900);
    expect(BILLING_PLANS.cabinet.priceCentsPerMonth).toBe(19900);
    expect(isUpgrade("essentiel", "pro")).toBe(true);
    expect(isUpgrade("pro", "essentiel")).toBe(false);
  });

  it("getPlan rejette doucement les codes inconnus", () => {
    expect(getPlan("decouverte")?.name).toBe("Découverte");
    expect(getPlan("gold-platine")).toBeNull();
  });

  it("formatCad et formatBytesLimit parlent fr-CA", () => {
    expect(formatCad(0)).toBe("0 $");
    expect(formatCad(5900)).toBe("59 $");
    expect(formatCad(123456).replace(/[\s\u202f\u00a0]/g, " ")).toBe("1 234,56 $");
    expect(formatBytesLimit(null)).toBe("Illimité");
    expect(formatBytesLimit(1024 ** 3)).toBe("1 Go");
  });

  it("smallestPlanCovering suggère le bon palier", () => {
    expect(
      smallestPlanCovering((l) => l.clientsMax, 11, "decouverte"),
    ).toBe("essentiel");
    expect(
      smallestPlanCovering((l) => l.clientsMax, 500, "decouverte"),
    ).toBe("pro");
    expect(smallestPlanCovering((l) => l.seatsIncluded, 3)).toBe("pro");
    expect(smallestPlanCovering((l) => l.seatsIncluded, 4)).toBe("cabinet");
  });
});

describe("gardes de quota — messages prêts pour l'UI", () => {
  it("bloque le 11e client au palier Découverte avec CTA Essentiel", () => {
    const act = () =>
      assertClientQuota(
        BILLING_PLANS.decouverte,
        usage({ clientsActive: 10 }),
      );
    expect(act).toThrowError(QuotaExceededError);
    try {
      act();
    } catch (error) {
      const typed = error as QuotaExceededError;
      expect(typed.quota).toBe("clients");
      expect(typed.upgradeTo).toBe("essentiel");
      expect(typed.message).toContain("Découverte");
    }
  });

  it("laisse passer tant qu'on est sous le plafond", () => {
    expect(() =>
      assertClientQuota(BILLING_PLANS.decouverte, usage({ clientsActive: 9 })),
    ).not.toThrow();
    expect(() =>
      assertClientQuota(BILLING_PLANS.pro, usage({ clientsActive: 99999 })),
    ).not.toThrow();
  });

  it("coffre : compte le fichier entrant dans la jauge", () => {
    const gib = 1024 ** 3;
    expect(() =>
      assertVaultQuota(
        BILLING_PLANS.decouverte,
        usage({ vaultBytes: gib - 10 }),
        20,
      ),
    ).toThrowError(/coffre/i);
    expect(() =>
      assertVaultQuota(
        BILLING_PLANS.decouverte,
        usage({ vaultBytes: gib - 10 }),
        10,
      ),
    ).not.toThrow();
  });

  it("enveloppes : plafond mensuel au palier Découverte, illimité au Pro", () => {
    expect(() =>
      assertEnvelopeQuota(BILLING_PLANS.decouverte, usage({ envelopesThisMonth: 5 })),
    ).toThrowError(QuotaExceededError);
    expect(() =>
      assertEnvelopeQuota(BILLING_PLANS.pro, usage({ envelopesThisMonth: 5000 })),
    ).not.toThrow();
  });

  it("sièges : Cabinet invite à acheter un siège, les autres à changer de palier", () => {
    try {
      assertSeatQuota(BILLING_PLANS.cabinet, 5, 0);
      expect.unreachable();
    } catch (error) {
      const typed = error as QuotaExceededError;
      expect(typed.upgradeTo).toBeNull();
      expect(typed.message).toContain("29 $/mois");
    }
    try {
      assertSeatQuota(BILLING_PLANS.pro, 3, 0);
      expect.unreachable();
    } catch (error) {
      expect((error as QuotaExceededError).upgradeTo).toBe("cabinet");
    }
    expect(() => assertSeatQuota(BILLING_PLANS.pro, 2, 0)).not.toThrow();
    expect(() => assertSeatQuota(BILLING_PLANS.cabinet, 5, 2)).not.toThrow();
  });

  it("vitrine et analytics sont des fonctionnalités de palier", () => {
    expect(() => assertMarketplaceListing(BILLING_PLANS.decouverte)).toThrowError(
      /Essentiel/,
    );
    expect(() => assertMarketplaceListing(BILLING_PLANS.essentiel)).not.toThrow();
    expect(() => assertAnalyticsAccess(BILLING_PLANS.essentiel, "cabinet")).toThrowError(
      /Pro/,
    );
    expect(() => assertAnalyticsAccess(BILLING_PLANS.pro, "equipe")).toThrowError(
      /Cabinet/,
    );
    expect(() => assertAnalyticsAccess(BILLING_PLANS.cabinet, "equipe")).not.toThrow();
  });
});
