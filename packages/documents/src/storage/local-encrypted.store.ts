import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, open, rename, rm, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { StorageError } from "./contract";
import type { ObjectStorage, StoredObject } from "./contract";

/**
 * Remonte depuis `start` jusqu'à la racine du monorepo (repérée par
 * pnpm-workspace.yaml). Chaque app Next tourne avec CWD = apps/<nom> :
 * sans cette ancre, un chemin relatif DOCUMENTS_STORAGE_DIR créerait
 * un coffre différent par application (ADR-010).
 */
function findMonorepoRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

/** Résout DOCUMENTS_STORAGE_DIR : absolu tel quel, relatif ancré à la racine du repo. */
export function resolveStorageDir(raw: string | undefined): string {
  const configured = raw && raw.trim() !== "" ? raw.trim() : "./var/documents";
  if (isAbsolute(configured)) return configured;
  const anchor = process.env.INIT_CWD ?? process.cwd();
  return join(findMonorepoRoot(anchor), configured);
}

/**
 * Provider « disque local chiffré » (`docsstore-1.0`) — AES-256-GCM
 * en continu :
 *  - IV aléatoire 12 octets écrit en tête du fichier chiffré ;
 *  - tag GCM (16 octets) renvoyé à l'appelant, persisté côté BDD
 *    (séparé du blob — l'intégrité est vérifiée au déchiffrement) ;
 *  - SHA-256 du contenu EN CLAIR calculé à la volée pendant l'upload ;
 *  - écriture atomique : fichier `.part` puis renommage.
 * Configuration : DOCUMENTS_MASTER_KEY (base64, 32 octets) et
 * DOCUMENTS_STORAGE_DIR (défaut ./var/documents).
 */

export const LOCAL_STORE_VERSION = "docsstore-1.0";
const IV_BYTES = 12;
const PART_SUFFIX = ".part";

export class LocalEncryptedObjectStore implements ObjectStorage {
  readonly name = "local-encrypted";

  constructor(
    private readonly resolveDir: () => string,
    private readonly resolveKey: () => Buffer | null,
  ) {}

  static fromEnvironment(): LocalEncryptedObjectStore {
    return new LocalEncryptedObjectStore(
      () => resolveStorageDir(process.env.DOCUMENTS_STORAGE_DIR),
      () => {
        const raw = process.env.DOCUMENTS_MASTER_KEY;
        if (!raw || raw.trim() === "") return null;
        let key: Buffer;
        try {
          key = Buffer.from(raw.trim(), "base64");
        } catch {
          throw new StorageError(
            "invalid_key",
            "DOCUMENTS_MASTER_KEY doit être du base64 (openssl rand -base64 32).",
          );
        }
        if (key.length !== 32) {
          throw new StorageError(
            "invalid_key",
            "DOCUMENTS_MASTER_KEY doit décoder en exactement 32 octets (AES-256).",
          );
        }
        return key;
      },
    );
  }

  private requireKey(): Buffer {
    const key = this.resolveKey();
    if (!key) {
      throw new StorageError(
        "not_configured",
        "Coffre non configuré : définissez DOCUMENTS_MASTER_KEY (openssl rand -base64 32) dans .env — aucun fichier ne sera chiffré sans elle.",
      );
    }
    return key;
  }

  private absPath(storageKey: string): string {
    // Jamais de chemin absolu ni de traversal persisté.
    const cleaned = normalize(storageKey).replace(/^([/\\])+/, "");
    if (cleaned.includes("..") || cleaned.startsWith("/")) {
      throw new StorageError("invalid_key", "Clé de stockage invalide.");
    }
    return join(this.resolveDir(), cleaned);
  }

  async put(stream: Readable, storageKey: string): Promise<StoredObject> {
    this.requireKey();
    const finalPath = this.absPath(storageKey);
    const partPath = `${finalPath}${PART_SUFFIX}`;
    await mkdir(dirname(finalPath), { recursive: true });

    const key = this.resolveKey() as Buffer;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const hash = createHash("sha256");
    let sizeBytes = 0;

    // Mesure (hash + taille) du clair pendant que le flux traverse.
    const metering = Readable.from(
      (async function* () {
        for await (const chunk of stream) {
          const buffer = chunk as Buffer;
          hash.update(buffer);
          sizeBytes += buffer.length;
          yield buffer;
        }
      })(),
    );

    const out = createWriteStream(partPath);
    try {
      out.write(iv);
      await pipeline(metering, cipher, out);
      const contentTag = cipher.getAuthTag().toString("base64");
      await rename(partPath, finalPath);
      return {
        storageKey,
        sizeBytes,
        sha256: hash.digest("hex"),
        contentTag,
      };
    } catch (error) {
      out.destroy();
      await rm(partPath, { force: true });
      if (error instanceof StorageError) throw error;
      throw new StorageError(
        "io",
        "Écriture du fichier au coffre impossible (disque indisponible ?).",
      );
    }
  }

  async openRead(storageKey: string, contentTag: string): Promise<Readable> {
    const key = this.requireKey();
    const fullPath = this.absPath(storageKey);

    let iv: Buffer;
    try {
      const handle = await open(fullPath, "r");
      iv = Buffer.alloc(IV_BYTES);
      await handle.read(iv, 0, IV_BYTES, 0);
      await handle.close();
    } catch {
      throw new StorageError(
        "io",
        "Ce fichier est introuvable dans le coffre (objet purgé ?).",
      );
    }

    let tag: Buffer;
    try {
      tag = Buffer.from(contentTag, "base64");
    } catch {
      throw new StorageError("integrity", "Empreinte d'intégrité illisible.");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return createReadStream(fullPath, { start: IV_BYTES }).pipe(decipher);
  }

  async readAll(storageKey: string, contentTag: string): Promise<Buffer> {
    const stream = await this.openRead(storageKey, contentTag);
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
    } catch {
      throw new StorageError(
        "integrity",
        "Intégrité du fichier non vérifiable (chiffrement altéré ou clé différente).",
      );
    }
    return Buffer.concat(chunks);
  }

  async remove(storageKey: string): Promise<void> {
    await unlink(this.absPath(storageKey)).catch(() => undefined);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.absPath(storageKey));
      return true;
    } catch {
      return false;
    }
  }
}
