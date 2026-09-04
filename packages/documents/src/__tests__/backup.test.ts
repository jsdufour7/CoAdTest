import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listBlobEntries } from "../backup/backup.service";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "coadvisor-backup-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("listBlobEntries — inventaire du coffre à répliquer", () => {
  it("recense les .enc récursivement, trie les clés, ignore le reste", async () => {
    const tenant = "33e34662-5554-4f8f-8841-4b54dea1848b";
    await mkdir(join(dir, tenant), { recursive: true });
    await writeFile(join(dir, tenant, "b.enc"), Buffer.from("blob-b"));
    await writeFile(join(dir, tenant, "a.enc"), Buffer.from("blob-a"));
    await writeFile(join(dir, tenant, "b.enc.part"), Buffer.from("en-cours"));
    await writeFile(join(dir, "note.txt"), "hors périmètre");

    const entries = await listBlobEntries(dir);
    expect(entries.map((entry) => entry.key)).toEqual([
      `${tenant}/a.enc`,
      `${tenant}/b.enc`,
    ]);
    expect(entries[1]?.sizeBytes).toBe(6);
    expect(entries[1]?.sha256).toBe(
      createHash("sha256").update(Buffer.from("blob-b")).digest("hex"),
    );
  });

  it("retourne un inventaire vide (jamais d'exception) si le coffre manque", async () => {
    expect(await listBlobEntries(join(dir, "inexistant"))).toEqual([]);
  });
});
