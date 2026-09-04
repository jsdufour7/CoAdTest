import type { DbContext } from "@coadvisor/database";

/**
 * Mesure d'usage d'un tenant pour les plafonds de palier (ADR-013).
 * Lecture confinée RLS (tx tenant) — jamais de contexte système ici.
 */
export interface TenantUsage {
  /** Dossiers clients ACTIFS (les archives ne comptent pas). */
  clientsActive: number;
  /** Membres staff actifs (les comptes CLIENT ne sont pas des sièges). */
  seatsUsed: number;
  /** Pièces ACTIVE du coffre + photos marketplace (octets en clair). */
  vaultBytes: number;
  /** Enveloppes créées depuis le 1er du mois civil. */
  envelopesThisMonth: number;
  /** Profils publiés dans l'annuaire. */
  listedProfiles: number;
}

export function currentMonthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function computeTenantUsage(
  tx: DbContext,
  tenantId: string,
  now = new Date(),
): Promise<TenantUsage> {
  const [clientsActive, seatsUsed, documents, photos, envelopes, listed] =
    await Promise.all([
      tx.client.count({ where: { tenantId, status: "ACTIVE" } }),
      tx.tenantUser.count({
        where: { tenantId, status: "ACTIVE", role: { not: "CLIENT" } },
      }),
      tx.document.aggregate({
        where: { tenantId, status: "ACTIVE" },
        _sum: { sizeBytes: true },
      }),
      tx.advisorPublicProfile.aggregate({
        where: { tenantId },
        _sum: { photoSizeBytes: true },
      }),
      tx.documentSignature.count({
        where: { tenantId, requestedAt: { gte: currentMonthStart(now) } },
      }),
      tx.advisorPublicProfile.count({ where: { tenantId, isListed: true } }),
    ]);
  return {
    clientsActive,
    seatsUsed,
    vaultBytes: (documents._sum.sizeBytes ?? 0) + (photos._sum.photoSizeBytes ?? 0),
    envelopesThisMonth: envelopes,
    listedProfiles: listed,
  };
}
