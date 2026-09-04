import { createHash, createHmac } from "node:crypto";

/**
 * Signature AWS v4 (SigV4) maison — aucune dépendance SDK (surface
 * d'audit réduite, ADR-015). Pur et déterministe : `now` injectable
 * pour les vecteurs de test de la suite officielle AWS.
 */
export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string | undefined;
}

export interface SigV4SignInput {
  method: string;
  /** Hôte de la requête (ex. « s3.ca-central-1.amazonaws.com »). */
  host: string;
  region: string;
  service?: string;
  /** Chemin URI canonique, commençant par « / » (déjà encodé). */
  canonicalUri: string;
  query?: Record<string, string | undefined>;
  /** En-têtes additionnels à signer (ex. content-type). */
  headers?: Record<string, string>;
  /** SHA-256 hex de la charge utile (connu avant envoi chez nous). */
  payloadSha256: string;
  now?: Date;
}

export interface SigV4Signed {
  amzDate: string;
  authorizationHeader: string;
  /** En-têtes complets à envoyer (incl. host / x-amz-*). */
  headers: Record<string, string>;
}

const hmac = (key: Buffer | string, data: string): Buffer =>
  createHmac("sha256", key).update(data, "utf8").digest();

const sha256Hex = (data: string): string =>
  createHash("sha256").update(data, "utf8").digest("hex");

/** Encode un segment URI selon RFC 3986 (les « / » restent). */
export function encodeS3Key(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function formatAmzDate(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  return { amzDate: `${iso}Z`, dateStamp: iso.slice(0, 8) };
}

export function signRequestV4(
  input: SigV4SignInput,
  credentials: SigV4Credentials,
): SigV4Signed {
  const service = input.service ?? "s3";
  const { amzDate, dateStamp } = formatAmzDate(input.now ?? new Date());

  const headers: Record<string, string> = {
    host: input.host,
    "x-amz-content-sha256": input.payloadSha256,
    "x-amz-date": amzDate,
    ...Object.fromEntries(
      Object.entries(input.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    ),
  };
  if (credentials.sessionToken) {
    headers["x-amz-security-token"] = credentials.sessionToken;
  }

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((key) => `${key}:${String(headers[key]).trim().replace(/\s+/g, " ")}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalQuery = Object.entries(input.query ?? {})
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .sort()
    .join("&");

  const canonicalRequest = [
    input.method,
    input.canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    input.payloadSha256,
  ].join("\n");

  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { amzDate, authorizationHeader, headers };
}
