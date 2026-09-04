import { describe, expect, it } from "vitest";

import {
  buildDailySeries,
  countActiveActors,
  countActiveSessions,
  signatureFunnel,
  topEvents,
} from "../aggregate";
import type { ProductEventRow } from "../aggregate";

const row = (
  name: string,
  dayOffset: number,
  extra?: Partial<ProductEventRow>,
): ProductEventRow => ({
  occurredAt: new Date(Date.UTC(2026, 6, 20 - dayOffset, 12)),
  name,
  actorKind: "STAFF",
  actorId: null,
  sessionHash: null,
  props: {},
  ...extra,
});

describe("buildDailySeries — série continue", () => {
  it("compte par jour et bouche les jours vides", () => {
    const now = new Date(Date.UTC(2026, 6, 20, 15));
    const rows = [row("a", 0), row("a", 0), row("a", 2)];
    const series = buildDailySeries(rows, 3, now);
    expect(series).toHaveLength(3);
    expect(series[0]?.count).toBe(1); // 18 juillet
    expect(series[1]?.count).toBe(0); // 19 juillet
    expect(series[2]?.count).toBe(2); // 20 juillet
  });
});

describe("compteurs d'actifs", () => {
  it("sessions et personnes distinctes, sans compter les nulls", () => {
    const rows = [
      row("a", 0, { sessionHash: "s1", actorId: "u1" }),
      row("a", 1, { sessionHash: "s1", actorId: "u1" }),
      row("a", 1, { sessionHash: "s2", actorId: "u2" }),
      row("a", 2),
    ];
    expect(countActiveSessions(rows)).toBe(2);
    expect(countActiveActors(rows)).toBe(2);
  });
});

describe("signatureFunnel — dédoublonnage par enveloppe", () => {
  const env = (id: string) => ({ envelopeId: id });
  it("compte chaque enveloppe une fois (multi-signataires)", () => {
    const rows: ProductEventRow[] = [
      row("signature.envelope_sent", 5, { props: env("e1") }),
      row("signature.signed", 4, { props: env("e1") }),
      row("signature.signed", 4, { props: env("e1") }), // Sophie aussi
      row("signature.envelope_sent", 3, { props: env("e2") }),
      row("signature.declined", 2, { props: env("e2") }),
      row("signature.envelope_resent", 1, { props: env("e3") }),
    ];
    const funnel = signatureFunnel(rows);
    expect(funnel.sent).toBe(2);
    expect(funnel.signed).toBe(1);
    expect(funnel.declined).toBe(1);
    expect(funnel.resent).toBe(1);
    expect(funnel.completionRate).toBeCloseTo(0.5);
    expect(funnel.declineRate).toBeCloseTo(0.5);
  });

  it("ignore les événements sans envelopeId et gère le vide", () => {
    expect(signatureFunnel([]).completionRate).toBeNull();
    expect(signatureFunnel([row("signature.signed", 0)]).signed).toBe(0);
  });
});

describe("topEvents", () => {
  it("trie par fréquence puis nom, et borne la liste", () => {
    const rows = [
      row("b", 0),
      row("a", 0),
      row("a", 1),
      row("a", 2),
      row("b", 1),
      row("c", 0),
    ];
    const top = topEvents(rows, 2);
    expect(top).toEqual([
      { name: "a", count: 3 },
      { name: "b", count: 2 },
    ]);
  });
});
