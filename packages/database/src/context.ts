import type { Prisma } from "@prisma/client";

import { prisma } from "./client";

/** Client transactionnel dans lequel le contexte RLS a été posé. */
export type DbContext = Prisma.TransactionClient;

/**
 * Contexte SYSTÈME — réservé aux flux privilégiés du Core Platform :
 * authentification, bootstrap d'un cabinet, invitations.
 * Le RBAC applicatif DOIT avoir été vérifié AVANT d'entrer ici.
 */
export function withSystemContext<T>(
  fn: (tx: DbContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_ctx', 'system', true)`;
    return fn(tx);
  });
}

/**
 * Contexte TENANT — mode par défaut de tout code métier.
 * Toutes les requêtes de `fn` sont confinées au tenant par la RLS.
 */
export function withTenantContext<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: DbContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_ctx', 'tenant', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenantId}, true)`;
    if (userId) {
      await tx.$executeRaw`SELECT set_config('app.current_user', ${userId}, true)`;
    }
    return fn(tx);
  });
}

/**
 * Contexte PUBLIC — flux anonymes (portée plateforme, ADR-006).
 * Utilisé par le questionnaire FNAE : le visiteur prouve l'accès à SON
 * analyse par son capability token (uuid non devinable, dans l'URL).
 * La RLS l'autorise à insérer des analyses/leads publics et à relire
 * uniquement la ligne correspondant au token — jamais la PII des leads.
 */
export function withPublicContext<T>(
  assessmentToken: string | null,
  fn: (tx: DbContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_ctx', 'public', true)`;
    if (assessmentToken) {
      await tx.$executeRaw`SELECT set_config('app.assessment_token', ${assessmentToken}, true)`;
    }
    return fn(tx);
  });
}

/**
 * Contexte PUBLIC MARKETPLACE — flux anonymes de l'annuaire (ADR-009).
 * Le service fournit l'identifiant du profil visé : la RLS l'utilise
 * comme PREUVE pour l'insertion d'un lead « annuaire » (le profil doit
 * être listé et appartenir au tenant référencé). Aucun accès aux
 * demandes de contact en lecture.
 */
export function withMarketplacePublicContext<T>(
  profileId: string,
  fn: (tx: DbContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_ctx', 'public', true)`;
    await tx.$executeRaw`SELECT set_config('app.marketplace_profile', ${profileId}, true)`;
    return fn(tx);
  });
}

/**
 * Contexte PUBLIC « lien de partage » — visiteur anonyme titulaire
 * d'un lien /partage/<token> (Sprint 7, ADR-010). Le service fournit
 * le HACHÉ SHA-256 (hex) du jeton : la RLS l'utilise comme preuve
 * capability — seul le partage LINK actif correspondant et la pièce
 * associée sont lisibles. Aucune écriture publique.
 */
export function withDocumentShareContext<T>(
  shareTokenHash: string,
  fn: (tx: DbContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_ctx', 'public', true)`;
    await tx.$executeRaw`SELECT set_config('app.document_share', ${shareTokenHash}, true)`;
    return fn(tx);
  });
}

/**
 * Contexte PUBLIC « signature externe » — signataire sans compte
 * titulaire d'un lien /signature/<token> (Sprint 7b, ADR-011). Le
 * service fournit le HACHÉ SHA-256 du jeton : la RLS n'autorise que
 * la lecture de SA ligne signataire (+ enveloppe, champs, pièce) et
 * la transition PENDING → SIGNED|DECLINED avec dépôt de preuves
 * (WITH CHECK), à son tour de signature. Aucune autre écriture.
 */
export function withSignatureTokenContext<T>(
  signatureTokenHash: string,
  fn: (tx: DbContext) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_ctx', 'public', true)`;
    await tx.$executeRaw`SELECT set_config('app.signature_token', ${signatureTokenHash}, true)`;
    return fn(tx);
  });
}
