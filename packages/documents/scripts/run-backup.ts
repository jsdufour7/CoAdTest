/**
 * `pnpm backup:run` — sauvegarde planifiée (cron externe) : réplica
 * locale + S3 région Canada si configuré, manifeste et vérification
 * sha256, ligne auditée dans backup_runs (ADR-015). Code de sortie 1
 * si la vérification échoue (le cron remonte l'alerte).
 */
import { prisma, withSystemContext } from "@coadvisor/database";

import {
  getBackupRoutingState,
  runScheduledBackup,
} from "../src/backup/backup.service";

const operatorSlug = process.env.PLATFORM_TENANT_SLUG?.trim() || "twodots";

async function main(): Promise<void> {
  const routing = getBackupRoutingState();
  console.log(`Sauvegarde — coffre : ${routing.storageDir}`);
  console.log(
    `Destination : ${routing.replicaDir}${routing.s3.configured ? ` + s3://${routing.s3.bucket} (${routing.s3.region})` : " (S3 non configuré — réplica locale seule)"}`,
  );
  const operatorTenantId = await withSystemContext(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { slug: operatorSlug },
      select: { id: true },
    });
    return tenant?.id ?? null;
  });
  if (!operatorTenantId) {
    throw new Error(
      `Tenant opérateur « ${operatorSlug} » introuvable — réglez PLATFORM_TENANT_SLUG.`,
    );
  }
  const result = await runScheduledBackup(operatorTenantId);
  console.log(
    `✔ ${result.status} — ${result.blobCount} blobs, ${result.copiedCount} copiés, ${result.bytesTotal} octets en ${result.report.durationMs} ms`,
  );
  console.log(`Manifeste : ${result.report.manifestPath ?? "n/a"}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
