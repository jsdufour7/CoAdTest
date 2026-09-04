import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma (évite l'épuisement des connexions en dev / hot-reload).
 *
 * ⚠️ Ne JAMAIS utiliser `prisma` directement pour des données tenant-based :
 * passer par `withTenantContext` / `withSystemContext` (./context) afin que
 * les politiques RLS reçoivent leur contexte. La RLS est un filet de sécurité,
 * pas un substitut aux permissions applicatives.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
