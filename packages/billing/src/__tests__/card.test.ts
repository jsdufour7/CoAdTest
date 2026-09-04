import { describe, expect, it } from "vitest";

import { validateSimulatedCard } from "../service";

const future = `${String(new Date().getMonth() + 2 > 12 ? 1 : new Date().getMonth() + 2).padStart(2, "0")}/${String((new Date().getFullYear() + 1) % 100).padStart(2, "0")}`;

describe("validateSimulatedCard — carte de test 4242 uniquement", () => {
  it("accepte la carte de test et ne garde que les 4 derniers chiffres", () => {
    const result = validateSimulatedCard({
      name: "Marie Tremblay",
      number: "4242 4242 4242 4242",
      expiry: "12/30",
      cvc: "123",
    });
    expect(result).toEqual({ ok: true, last4: "4242" });
  });

  it("refuse une vraie série (tout sauf 4242…)", () => {
    const result = validateSimulatedCard({
      name: "Marie Tremblay",
      number: "5111 1111 1111 1111",
      expiry: "12/30",
      cvc: "123",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("4242");
  });

  it("valide nom, format, expiration et CVC avec messages FR", () => {
    expect(
      validateSimulatedCard({ name: "M", number: "4242424242424242", expiry: "12/30", cvc: "123" }).ok,
    ).toBe(false);
    expect(
      validateSimulatedCard({ name: "Marie", number: "4242", expiry: "12/30", cvc: "123" }).ok,
    ).toBe(false);
    expect(
      validateSimulatedCard({ name: "Marie", number: "4242424242424242", expiry: "13/30", cvc: "123" }).ok,
    ).toBe(false);
    expect(
      validateSimulatedCard({ name: "Marie", number: "4242424242424242", expiry: "01/20", cvc: "123" }).ok,
    ).toBe(false);
    expect(
      validateSimulatedCard({ name: "Marie", number: "4242424242424242", expiry: "12/30", cvc: "9" }).ok,
    ).toBe(false);
  });

  it("accepte une expiration future calculée", () => {
    const result = validateSimulatedCard({
      name: "Marie Tremblay",
      number: "4242424242424242",
      expiry: future,
      cvc: "1234",
    });
    expect(result.ok).toBe(true);
  });
});
