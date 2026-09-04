import { createHash } from "node:crypto";

import { StorageError } from "./contract";
import { encodeS3Key, signRequestV4 } from "./sigv4";
import type { SigV4Credentials } from "./sigv4";

/**
 * Client S3 minimaliste (ADR-015) — cible la réplication des blobs
 * CHIFFRÉS du coffre vers la région Canada. Endpoint générique
 * (AWS ca-central-1 par défaut, OVH BHS ou MinIO local par variable),
 * styles d'URL virtual-hosted ou path (MinIO).
 */
export interface S3ClientConfig {
  endpointHost: string;
  region: string;
  bucket: string;
  /** Préfixe commun des clés (ex. « coadvisor-backups/»). */
  prefix: string;
  credentials: SigV4Credentials;
  forcePathStyle: boolean;
}

export interface S3ListedObject {
  key: string;
  sizeBytes: number;
}

/** SHA-256 hex d'une charge vide (GET/HEAD/LIST). */
const EMPTY_PAYLOAD_SHA256 = createHash("sha256").update("").digest("hex");

export class S3Client {
  private constructor(private readonly config: S3ClientConfig) {}

  /** Résolution par l'environnement — null si non configuré (dev local). */
  static fromEnvironment(): S3Client | null {
    const bucket = process.env.S3_BUCKET?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
    if (!bucket || !accessKeyId || !secretAccessKey) return null;
    const endpointHost =
      process.env.S3_ENDPOINT?.trim() ||
      `s3.${process.env.S3_REGION?.trim() || "ca-central-1"}.amazonaws.com`;
    let rawPrefix = process.env.S3_PREFIX?.trim() || "coadvisor-backups/";
    if (rawPrefix && !rawPrefix.endsWith("/")) rawPrefix += "/";
    return new S3Client({
      endpointHost: endpointHost.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      region: process.env.S3_REGION?.trim() || "ca-central-1",
      bucket,
      prefix: rawPrefix,
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken: process.env.S3_SESSION_TOKEN?.trim() || undefined,
      },
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE?.trim() === "true",
    });
  }

  routingState(): {
    configured: boolean;
    endpointHost: string;
    region: string;
    bucket: string;
    prefix: string;
    pathStyle: boolean;
  } {
    return {
      configured: true,
      endpointHost: this.config.endpointHost,
      region: this.config.region,
      bucket: this.config.bucket,
      prefix: this.config.prefix,
      pathStyle: this.config.forcePathStyle,
    };
  }

  private target(key: string): { host: string; canonicalUri: string; url: string } {
    const full = `${this.config.prefix}${key}`;
    const encoded = encodeS3Key(full);
    if (this.config.forcePathStyle) {
      const canonicalUri = `/${encodeURIComponent(this.config.bucket)}/${encoded}`;
      return {
        host: this.config.endpointHost,
        canonicalUri,
        url: `https://${this.config.endpointHost}${canonicalUri}`,
      };
    }
    const host = `${this.config.bucket}.${this.config.endpointHost}`;
    const canonicalUri = `/${encoded}`;
    return { host, canonicalUri, url: `https://${host}${canonicalUri}` };
  }

  private async send(
    method: string,
    key: string,
    options: {
      query?: Record<string, string | undefined>;
      body?: Buffer;
      contentType?: string;
    } = {},
  ): Promise<Response> {
    const { host, canonicalUri, url } = this.target(key);
    const payloadSha256 = options.body
      ? createHash("sha256").update(options.body).digest("hex")
      : EMPTY_PAYLOAD_SHA256;
    const queryString = options.query
      ? Object.entries(options.query)
          .filter((e): e is [string, string] => e[1] !== undefined)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .sort()
          .join("&")
      : "";
    const signed = signRequestV4(
      {
        method,
        host,
        region: this.config.region,
        canonicalUri,
        query: queryString
          ? Object.fromEntries(new URLSearchParams(queryString))
          : undefined,
        headers: options.contentType
          ? { "content-type": options.contentType }
          : undefined,
        payloadSha256,
      },
      this.config.credentials,
    );
    const response = await fetch(queryString ? `${url}?${queryString}` : url, {
      method,
      headers: {
        ...signed.headers,
        Authorization: signed.authorizationHeader,
      },
      body: options.body ? Uint8Array.from(options.body) : null,
    });
    if (!response.ok && response.status !== 404) {
      const text = (await response.text()).slice(0, 300);
      throw new StorageError(
        "io",
        `S3 ${method} ${key} → HTTP ${response.status} : ${text}`,
      );
    }
    return response;
  }

  /** Écrit un blob CHIFFRÉ tel quel (octets = octets, pas de transformation). */
  async putObject(key: string, body: Buffer): Promise<void> {
    await this.send("PUT", key, { body });
  }

  /** Lit un objet ; null si absent. */
  async getObjectBuffer(key: string): Promise<Buffer | null> {
    const response = await this.send("GET", key);
    if (response.status === 404) return null;
    return Buffer.from(await response.arrayBuffer());
  }

  /** Taille d'un objet ; null si absent. */
  async headObject(key: string): Promise<number | null> {
    const response = await this.send("HEAD", key);
    if (response.status === 404) return null;
    return Number(response.headers.get("content-length") ?? 0);
  }

  /** Liste toutes les clés du préfixe configuré (pagination 1000). */
  async listObjects(subPrefix = ""): Promise<S3ListedObject[]> {
    const objects: S3ListedObject[] = [];
    let continuation: string | undefined;
    do {
      const response = await this.send("GET", "", {
        query: {
          "list-type": "2",
          prefix: `${this.config.prefix}${subPrefix}`,
          "max-keys": "1000",
          "continuation-token": continuation,
        },
      });
      const xml = await response.text();
      for (const match of xml.matchAll(
        /<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g,
      )) {
        const key = (match[1] ?? "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");
        if (!key) continue;
        objects.push({
          key: key.slice(this.config.prefix.length),
          sizeBytes: Number(match[2] ?? 0),
        });
      }
      const token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(
        xml,
      );
      continuation = token?.[1];
    } while (continuation);
    return objects;
  }
}

/** État de routage S3 pour l'UI (jamais de secret). */
export function getS3RoutingState(): ReturnType<S3Client["routingState"]> {
  const client = S3Client.fromEnvironment();
  if (!client) {
    return {
      configured: false,
      endpointHost:
        process.env.S3_ENDPOINT?.trim() || "s3.ca-central-1.amazonaws.com",
      region: process.env.S3_REGION?.trim() || "ca-central-1",
      bucket: process.env.S3_BUCKET?.trim() || "",
      prefix: process.env.S3_PREFIX?.trim() || "coadvisor-backups/",
      pathStyle: process.env.S3_FORCE_PATH_STYLE?.trim() === "true",
    };
  }
  return client.routingState();
}
