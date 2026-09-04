import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { StorageError } from "../storage/contract";
import { LocalEncryptedObjectStore } from "../storage/local-encrypted.store";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "coadvisor-store-test-"));
  vi.stubEnv("DOCUMENTS_STORAGE_DIR", dir);
  vi.stubEnv("DOCUMENTS_MASTER_KEY", randomBytes(32).toString("base64"));
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

const streamOf = (content: string | Buffer) =>
  Readable.from(typeof content === "string" ? Buffer.from(content, "utf8") : content);

describe("LocalEncryptedObjectStore — chiffrement au repos", () => {
  it("refuse sans clé maîtresse (not_configured)", async () => {
    vi.stubEnv("DOCUMENTS_MASTER_KEY", "");
    const store = LocalEncryptedObjectStore.fromEnvironment();
    await expect(
      store.put(streamOf("données"), "a/b.enc"),
    ).rejects.toMatchObject({ reason: "not_configured" });
    vi.stubEnv("DOCUMENTS_MASTER_KEY", randomBytes(32).toString("base64"));
  });

  it("rejette une clé qui ne décode pas en 32 octets", async () => {
    vi.stubEnv("DOCUMENTS_MASTER_KEY", Buffer.from("trop-court").toString("base64"));
    const store = LocalEncryptedObjectStore.fromEnvironment();
    await expect(store.put(streamOf("x"), "c/d.enc")).rejects.toMatchObject({
      reason: "invalid_key",
    });
    vi.stubEnv("DOCUMENTS_MASTER_KEY", randomBytes(32).toString("base64"));
  });

  it("aller-retour : le clair survit au chiffrement, le fichier disque est chiffré", async () => {
    const store = LocalEncryptedObjectStore.fromEnvironment();
    const clair = Buffer.from(
      "Avis de cotisation — revenus déclarés: 92 450 $ — contenu accentué éàç",
      "utf8",
    );
    const stored = await store.put(streamOf(clair), "tenant-1/doc-1.enc");

    expect(stored.sizeBytes).toBe(clair.length);
    expect(stored.sha256).toBe(
      createHash("sha256").update(clair).digest("hex"),
    );
    expect(stored.contentTag.length).toBeGreaterThan(10);

    // Le fichier au repos NE contient PAS le clair — uniquement
    // l'IV (12 o) + le chiffré (GCM sans bourrage : taille du clair) ;
    // le tag d'authentification (16 o) vit en BASE, pas dans le fichier.
    const onDisk = await readFile(join(dir, "tenant-1/doc-1.enc"));
    expect(onDisk.includes(clair.subarray(0, 32))).toBe(false);
    expect(onDisk.length).toBe(clair.length + 12);

    const relu = await store.readAll("tenant-1/doc-1.enc", stored.contentTag);
    expect(relu.equals(clair)).toBe(true);
  });

  it("supporte les flux volumineux en plusieurs chunks", async () => {
    const store = LocalEncryptedObjectStore.fromEnvironment();
    const chunk = randomBytes(64 * 1024);
    const parts = Array.from({ length: 40 }, () => chunk);
    const clair = Buffer.concat(parts);

    const stored = await store.put(Readable.from(parts), "tenant-1/doc-2.enc");
    const relu = await store.readAll("tenant-1/doc-2.enc", stored.contentTag);
    expect(relu.equals(clair)).toBe(true);
  });

  it("un mauvais tag GCM = erreur integrity au déchiffrement", async () => {
    const store = LocalEncryptedObjectStore.fromEnvironment();
    await store.put(streamOf("secret"), "tenant-1/doc-3.enc");
    const mauvaisTag = randomBytes(16).toString("base64");
    await expect(
      store.readAll("tenant-1/doc-3.enc", mauvaisTag),
    ).rejects.toBeInstanceOf(StorageError);
  });

  it("remove purge physiquement le fichier", async () => {
    const store = LocalEncryptedObjectStore.fromEnvironment();
    await store.put(streamOf("à purger"), "tenant-1/doc-4.enc");
    expect(await store.exists("tenant-1/doc-4.enc")).toBe(true);
    await store.remove("tenant-1/doc-4.enc");
    expect(await store.exists("tenant-1/doc-4.enc")).toBe(false);
    await expect(stat(join(dir, "tenant-1/doc-4.enc"))).rejects.toThrow();
  });

  it("rejette une clé de stockage avec traversal", async () => {
    const store = LocalEncryptedObjectStore.fromEnvironment();
    await expect(
      store.put(streamOf("x"), "../../etc/passwd.enc"),
    ).rejects.toMatchObject({ reason: "invalid_key" });
  });
});
