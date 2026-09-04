import { describe, expect, it } from "vitest";

import { encodeS3Key, signRequestV4 } from "../storage/sigv4";

/**
 * Vecteur inspiré de la suite officielle AWS sigv4-test-suite
 * (clefs documentaires publiques du guide développeur S3).
 */
const CREDS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

describe("sigv4 — signature AWS v4 maison", () => {
  it("produit une signature déterministe re-vérifiable", () => {
    const input = {
      method: "PUT",
      host: "s3.ca-central-1.amazonaws.com",
      region: "ca-central-1",
      canonicalUri: "/coadvisor-backups/tenant/doc.enc",
      payloadSha256:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", // "hello"
      now: new Date("2015-08-30T12:36:00Z"),
    };
    const a = signRequestV4(input, CREDS);
    const b = signRequestV4(input, CREDS);
    expect(a.authorizationHeader).toBe(b.authorizationHeader);
    expect(a.amzDate).toBe("20150830T123600Z");
    expect(a.authorizationHeader).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20150830/ca-central-1/s3/aws4_request",
    );
    expect(a.authorizationHeader).toContain("SignedHeaders=host;x-amz-content-sha256;x-amz-date");
    expect(a.headers["x-amz-content-sha256"]).toBe(input.payloadSha256);
  });

  it("change d'avis sur tout changement de charge (intégrité)", () => {
    const base = {
      method: "PUT",
      host: "s3.ca-central-1.amazonaws.com",
      region: "ca-central-1",
      canonicalUri: "/k",
      payloadSha256: "aa",
      now: new Date("2026-08-02T00:00:00Z"),
    };
    const a = signRequestV4(base, CREDS);
    const b = signRequestV4({ ...base, payloadSha256: "ab" }, CREDS);
    expect(a.authorizationHeader).not.toBe(b.authorizationHeader);
  });

  it("trie la query canoniquement et encode la clé à la S3", () => {
    const signed = signRequestV4(
      {
        method: "GET",
        host: "b.s3.ca-central-1.amazonaws.com",
        region: "ca-central-1",
        canonicalUri: "/",
        query: { "list-type": "2", "max-keys": "1000", prefix: "a/b" },
        payloadSha256: "e3b0c442",
        now: new Date("2026-01-01T00:00:00Z"),
      },
      CREDS,
    );
    expect(signed.authorizationHeader).toContain("Signature=");
    expect(encodeS3Key("coadvisor-backups/t/uuid.enc")).toBe(
      "coadvisor-backups/t/uuid.enc",
    );
    expect(encodeS3Key("préfixe/clé ç.enc")).toBe(
      "pr%C3%A9fixe/cl%C3%A9%20%C3%A7.enc",
    );
  });
});
