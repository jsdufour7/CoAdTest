import { describe, expect, it } from "vitest";

import {
  envelopeCreateSchema,
  signatureDeclineSchema,
  signatureSubmitSchema,
  signatureTemplateSaveSchema,
} from "../schemas";

const FIELD = {
  signerIndex: 0,
  kind: "SIGNATURE" as const,
  pageIndex: 0,
  x: 0.1,
  y: 0.8,
  width: 0.35,
  height: 0.07,
};

const BASE = {
  signers: [
    {
      kind: "PORTAL_USER" as const,
      portalUserId: "8b5c6f4a-2c2a-4a1f-9a6c-2a9b1c0d1111",
    },
  ],
  signingMode: "SEQUENTIAL" as const,
  expiresInDays: 30,
  fields: [FIELD],
};

describe("envelopeCreateSchema — composition d'enveloppe (ADR-011)", () => {
  it("accepte une enveloppe minimale valide", () => {
    const parsed = envelopeCreateSchema.safeParse(BASE);
    expect(parsed.success).toBe(true);
  });

  it("accepte les trois canaux de signataires et le gabarit", () => {
    const parsed = envelopeCreateSchema.safeParse({
      ...BASE,
      signers: [
        { kind: "PORTAL_USER", portalUserId: "8b5c6f4a-2c2a-4a1f-9a6c-2a9b1c0d1111" },
        { kind: "STAFF", staffUserId: "8b5c6f4a-2c2a-4a1f-9a6c-2a9b1c0d2222" },
        { kind: "EXTERNAL", email: "notaire@exemple.ca", fullName: "Me Karine Legal" },
      ],
      signingMode: "PARALLEL",
      fields: [FIELD, { ...FIELD, signerIndex: 1, x: 0.55 }, { ...FIELD, signerIndex: 2, y: 0.6 }],
      saveTemplateAs: "Mandat à trois signataires",
      message: "Merci de signer avant vendredi.",
    });
    expect(parsed.success).toBe(true);
  });

  it("exige au moins une zone Signature par signataire (comme DocuSign)", () => {
    const parsed = envelopeCreateSchema.safeParse({
      ...BASE,
      signers: [
        { kind: "PORTAL_USER", portalUserId: "8b5c6f4a-2c2a-4a1f-9a6c-2a9b1c0d1111" },
        { kind: "STAFF", staffUserId: "8b5c6f4a-2c2a-4a1f-9a6c-2a9b1c0d2222" },
      ],
      // Seul le premier a une zone Signature.
      fields: [FIELD, { ...FIELD, signerIndex: 1, kind: "DATE" as const }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejette un champ assigné à un signataire inexistant", () => {
    const parsed = envelopeCreateSchema.safeParse({
      ...BASE,
      fields: [{ ...FIELD, signerIndex: 3 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejette une zone qui déborde de la page", () => {
    const parsed = envelopeCreateSchema.safeParse({
      ...BASE,
      fields: [{ ...FIELD, x: 0.9, width: 0.35 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejette une zone trop étroite ou hors bornes", () => {
    for (const patch of [
      { width: 0.005 },
      { height: 0.005 },
      { x: -0.1 },
      { y: 1.2 },
      { pageIndex: 500 },
    ]) {
      expect(
        envelopeCreateSchema.safeParse({ ...BASE, fields: [{ ...FIELD, ...patch }] }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
  });

  it("borne le nombre de signataires (1..6) et l'échéance (1..90 j)", () => {
    expect(envelopeCreateSchema.safeParse({ ...BASE, signers: [] }).success).toBe(false);
    const seven = Array.from({ length: 7 }, (_, index) => ({
      kind: "EXTERNAL" as const,
      email: `s${index}@exemple.ca`,
      fullName: `Signataire ${index}`,
    }));
    expect(
      envelopeCreateSchema.safeParse({
        ...BASE,
        signers: seven,
        fields: seven.map((_, index) => ({ ...FIELD, signerIndex: index })),
      }).success,
    ).toBe(false);
    expect(envelopeCreateSchema.safeParse({ ...BASE, expiresInDays: 0 }).success).toBe(false);
    expect(envelopeCreateSchema.safeParse({ ...BASE, expiresInDays: 91 }).success).toBe(false);
  });

  it("rejette les identifiants non-uuid et les courriels invalides", () => {
    expect(
      envelopeCreateSchema.safeParse({
        ...BASE,
        signers: [{ kind: "PORTAL_USER", portalUserId: "pas-un-uuid" }],
      }).success,
    ).toBe(false);
    expect(
      envelopeCreateSchema.safeParse({
        ...BASE,
        signers: [{ kind: "EXTERNAL", email: "pas-un-courriel", fullName: "Me Legal" }],
      }).success,
    ).toBe(false);
  });
});

describe("signatureSubmitSchema — dépôt de preuves du signataire", () => {
  it("accepte nom tapé seul, avec initiales, ou avec tracé PNG", () => {
    expect(signatureSubmitSchema.safeParse({ signerName: "Jean Bouchard" }).success).toBe(true);
    expect(
      signatureSubmitSchema.safeParse({ signerName: "Jean Bouchard", initials: "J.B." }).success,
    ).toBe(true);
    expect(
      signatureSubmitSchema.safeParse({
        signerName: "Jean Bouchard",
        drawnPngDataUrl: "data:image/png;base64,iVBORw0KGgo=",
      }).success,
    ).toBe(true);
  });

  it("exige un nom d'au moins 2 caractères et borne les initiales", () => {
    expect(signatureSubmitSchema.safeParse({ signerName: "J" }).success).toBe(false);
    expect(
      signatureSubmitSchema.safeParse({ signerName: "Jean Bouchard", initials: "TROPLONGUES" }).success,
    ).toBe(false);
  });
});

describe("signatureDeclineSchema — refus motivé", () => {
  it("exige un motif d'au moins 10 caractères", () => {
    expect(signatureDeclineSchema.safeParse({ reason: "Non." }).success).toBe(false);
    expect(
      signatureDeclineSchema.safeParse({ reason: "Ce mandat ne correspond pas à ma situation." }).success,
    ).toBe(true);
  });
});

describe("signatureTemplateSaveSchema — gabarits réutilisables", () => {
  it("exige un nom d'au moins 3 caractères et au moins un champ", () => {
    expect(signatureTemplateSaveSchema.safeParse({ name: "AB", fields: [FIELD] }).success).toBe(false);
    expect(
      signatureTemplateSaveSchema.safeParse({ name: "Mandat standard", fields: [] }).success,
    ).toBe(false);
    expect(
      signatureTemplateSaveSchema.safeParse({ name: "Mandat standard", fields: [FIELD] }).success,
    ).toBe(true);
  });
});
