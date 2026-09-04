import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import { trackSafely } from "@coadvisor/analytics";
import { recordAudit } from "@coadvisor/core-platform";
import { withSystemContext, withTenantContext } from "@coadvisor/database";
import type { DbContext } from "@coadvisor/database";
import { AuthorizationError } from "@coadvisor/types";
import type { RequestMeta } from "@coadvisor/types";

import { resolveStorageDir } from "../storage/local-encrypted.store";
import { getS3RoutingState, S3Client } from "../storage/s3-client";

export const BACKUP_VERSION = "backup-1.0";

export interface BackupActor {
  tenantId: string;
  userId: string | null;
  role: string;
}

interface BlobEntry {
  /** Clé relative POSIX (ex. « <tenant>/<uuid>.enc »). */
  key: string;
  absolutePath: string;
  sizeBytes: number;
  sha256: string;
}

/** Répertoires ancrés à la racine du monorepo (même motif que le coffre). */
export function resolveReplicaDir(): string {
  return resolveStorageDir(process.env.DOCUMENTS_REPLICA_DIR || "./var/documents-replica");
}

export function resolveManifestsDir(): string {
  return resolveStorageDir(process.env.BACKUP_MANIFESTS_DIR || "./var/backups");
}

/** Inventaire des blobs chiffrés (parcourt récursif + sha256 du chiffré). */
export async function listBlobEntries(storageDir: string): Promise<BlobEntry[]> {
  const entries: BlobEntry[] = [];
  async function walk(dir: string): Promise<void> {
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const full = join(dir, name);
      const info = await stat(full).catch(() => null);
      if (!info) continue;
      if (info.isDirectory()) {
        await walk(full);
      } else if (name.endsWith(".enc")) {
        const bytes = await readFile(full);
        entries.push({
          key: relative(storageDir, full).split(sep).join("/"),
          absolutePath: full,
          sizeBytes: info.size,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  await walk(storageDir);
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

async function copyIfChanged(
  entry: BlobEntry,
  replicaDir: string,
): Promise<"copied" | "skipped"> {
  const dest = join(replicaDir, entry.key);
  if (existsSync(dest)) {
    const current = await readFile(dest);
    if (
      current.length === entry.sizeBytes &&
      createHash("sha256").update(current).digest("hex") === entry.sha256
    ) {
      return "skipped";
    }
  }
  await mkdir(dirname(dest), { recursive: true });
  const bytes = await readFile(entry.absolutePath);
  await writeFile(`${dest}.part`, bytes);
  await rename(`${dest}.part`, dest);
  return "copied";
}

export interface BackupReport {
  storageDir: string;
  replicaDir: string;
  manifestsDir: string;
  s3: ReturnType<typeof getS3RoutingState>;
  copied: number;
  skipped: number;
  s3Copied: number;
  s3Skipped: number;
  verified: number;
  manifestPath: string | null;
  durationMs: number;
}

interface RunResult {
  status: "VERIFIED" | "FAILED";
  destination: "LOCAL" | "S3" | "BOTH";
  blobCount: number;
  copiedCount: number;
  bytesTotal: number;
  manifestSha256: string | null;
  report: BackupReport;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
}

/** Cycle complet : inventaire → copie → manifeste → vérification. */
async function executeBackupCycle(): Promise<RunResult> {
  const startedAt = new Date();
  const storageDir = resolveStorageDir(process.env.DOCUMENTS_STORAGE_DIR);
  const replicaDir = resolveReplicaDir();
  const manifestsDir = resolveManifestsDir();
  const s3 = S3Client.fromEnvironment();
  const report: BackupReport = {
    storageDir,
    replicaDir,
    manifestsDir,
    s3: getS3RoutingState(),
    copied: 0,
    skipped: 0,
    s3Copied: 0,
    s3Skipped: 0,
    verified: 0,
    manifestPath: null,
    durationMs: 0,
  };
  let error: string | null = null;
  let manifestSha256: string | null = null;
  let entries: BlobEntry[] = [];

  try {
    entries = await listBlobEntries(storageDir);
    // 1. Réplica locale (toujours — protection hors-répertoire).
    for (const entry of entries) {
      const outcome = await copyIfChanged(entry, replicaDir);
      if (outcome === "copied") report.copied += 1;
      else report.skipped += 1;
    }
    // 2. Réplication S3 région Canada (si configurée).
    if (s3) {
      for (const entry of entries) {
        const remoteSize = await s3.headObject(entry.key);
        if (remoteSize === entry.sizeBytes) {
          report.s3Skipped += 1;
          continue;
        }
        await s3.putObject(entry.key, await readFile(entry.absolutePath));
        report.s3Copied += 1;
      }
    }
    // 3. Manifeste d'inventaire signé par contenu.
    await mkdir(manifestsDir, { recursive: true });
    const manifest = {
      version: BACKUP_VERSION,
      startedAt: startedAt.toISOString(),
      files: entries.map((e) => ({ key: e.key, sizeBytes: e.sizeBytes, sha256: e.sha256 })),
    };
    const manifestJson = JSON.stringify(manifest, null, 2);
    manifestSha256 = createHash("sha256").update(manifestJson).digest("hex");
    const manifestPath = join(
      manifestsDir,
      `manifest-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`,
    );
    await writeFile(manifestPath, manifestJson);
    report.manifestPath = manifestPath;

    // 4. Vérification : relire la destination et comparer les empreintes.
    for (const entry of entries) {
      const replicaBytes = await readFile(join(replicaDir, entry.key));
      const ok =
        replicaBytes.length === entry.sizeBytes &&
        createHash("sha256").update(replicaBytes).digest("hex") === entry.sha256;
      if (!ok) {
        throw new Error(`Vérification échouée sur la réplica locale : ${entry.key}`);
      }
      report.verified += 1;
    }
    if (s3) {
      for (const entry of entries) {
        const remote = await s3.getObjectBuffer(entry.key);
        const ok =
          remote !== null &&
          remote.length === entry.sizeBytes &&
          createHash("sha256").update(remote).digest("hex") === entry.sha256;
        if (!ok) {
          throw new Error(`Vérification échouée sur S3 : ${entry.key}`);
        }
      }
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const finishedAt = new Date();
  report.durationMs = finishedAt.getTime() - startedAt.getTime();
  return {
    status: error ? "FAILED" : "VERIFIED",
    destination: s3 ? "BOTH" : "LOCAL",
    blobCount: entries.length,
    copiedCount: report.copied + report.s3Copied,
    bytesTotal: entries.reduce((sum, e) => sum + e.sizeBytes, 0),
    manifestSha256,
    report,
    error,
    startedAt,
    finishedAt,
  };
}

async function recordRun(
  tx: DbContext,
  actor: BackupActor,
  trigger: "MANUAL" | "SCHEDULED",
  result: RunResult,
  meta: RequestMeta,
): Promise<string> {
  const row = await tx.backupRun.create({
    data: {
      tenantId: actor.tenantId,
      trigger,
      destination: result.destination,
      status: result.status,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      blobCount: result.blobCount,
      copiedCount: result.copiedCount,
      bytesTotal: result.bytesTotal,
      manifestSha256: result.manifestSha256,
      report: JSON.parse(JSON.stringify(result.report)),
      error: result.error,
      engineVersion: BACKUP_VERSION,
    },
    select: { id: true },
  });
  await recordAudit(tx, {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    action: "documents.backup.completed",
    entityType: "BackupRun",
    entityId: row.id,
    newData: {
      trigger,
      destination: result.destination,
      status: result.status,
      blobCount: result.blobCount,
      copiedCount: result.copiedCount,
    },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  await trackSafely(tx, {
    tenantId: actor.tenantId,
    app: "web-advisor",
    actorKind: actor.userId ? "STAFF" : "SYSTEM",
    actorId: actor.userId,
    name: "backup.completed",
    props: { status: result.status, destination: result.destination },
  });
  return row.id;
}

/**
 * Sauvegarde depuis l'UI (bouton « Lancer maintenant ») : le contexte
 * TENANT prouve l'appartenance staff (RLS sur backup_runs).
 */
export async function runBackupNow(
  actor: BackupActor & { tenantSlug: string },
  meta: RequestMeta = {},
): Promise<{ runId: string; result: RunResult }> {
  assertBackupAuthorized(actor.role, actor.tenantSlug);
  const result = await executeBackupCycle();
  const runId = await withTenantContext(actor.tenantId, actor.userId, (tx) =>
    recordRun(tx, actor, "MANUAL", result, meta),
  );
  return { runId, result };
}

/**
 * Sauvegarde planifiée (cron externe → `pnpm backup:run`) : job local
 * privilégié, contexte système revendiqué et audité (acteur null).
 */
export async function runScheduledBackup(operatorTenantId: string): Promise<RunResult> {
  const actor: BackupActor = { tenantId: operatorTenantId, userId: null, role: "ADMIN" };
  const result = await executeBackupCycle();
  await withSystemContext((tx) => recordRun(tx, actor, "SCHEDULED", result, {}));
  if (result.status === "FAILED") {
    throw new Error(result.error ?? "Sauvegarde échouée.");
  }
  return result;
}

/** Autorisation : rôle ADMIN du tenant OPÉRATEUR de la plateforme. */
export function assertBackupAuthorized(role: string, tenantSlug: string): void {
  const operatorSlug = process.env.PLATFORM_TENANT_SLUG?.trim() || "twodots";
  if (role !== "ADMIN" || tenantSlug !== operatorSlug) {
    throw new AuthorizationError(
      "Les sauvegardes de la plateforme sont réservées à l'équipe fondatrice (tenant opérateur).",
    );
  }
}

export interface BackupRunRow {
  id: string;
  trigger: "MANUAL" | "SCHEDULED";
  destination: "LOCAL" | "S3" | "BOTH";
  status: "VERIFIED" | "FAILED";
  startedAt: string;
  finishedAt: string;
  blobCount: number;
  copiedCount: number;
  bytesTotal: number;
  manifestSha256: string | null;
  error: string | null;
  durationMs: number;
}

/** Dernières exécutions (RLS tenante sature à l'opérateur). */
export async function listBackupRuns(
  actor: BackupActor,
  take = 20,
): Promise<BackupRunRow[]> {
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const rows = await tx.backupRun.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take,
    });
    return rows.map((row) => ({
      id: row.id,
      trigger: row.trigger,
      destination: row.destination,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt.toISOString(),
      blobCount: row.blobCount,
      copiedCount: row.copiedCount,
      bytesTotal: row.bytesTotal,
      manifestSha256: row.manifestSha256,
      error: row.error,
      durationMs:
        row.finishedAt.getTime() - row.startedAt.getTime(),
    }));
  });
}

/** État de configuration des sauvegardes (page Ops — aucun secret). */
export function getBackupRoutingState(): {
  storageDir: string;
  replicaDir: string;
  manifestsDir: string;
  s3: ReturnType<typeof getS3RoutingState>;
  engineVersion: string;
} {
  return {
    storageDir: resolveStorageDir(process.env.DOCUMENTS_STORAGE_DIR),
    replicaDir: resolveReplicaDir(),
    manifestsDir: resolveManifestsDir(),
    s3: getS3RoutingState(),
    engineVersion: BACKUP_VERSION,
  };
}
