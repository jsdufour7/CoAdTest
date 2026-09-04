import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { trackSafely } from "@coadvisor/analytics";
import { requirePermission } from "@coadvisor/auth";
import {
  assertMarketplaceListing,
  assertVaultQuota,
  BILLING_PLANS,
  computeTenantUsage,
  getPlan,
  resolveEffectivePlan,
} from "@coadvisor/billing";
import { recordAudit } from "@coadvisor/core-platform";
import { getObjectStorage } from "@coadvisor/documents";
import {
  withPublicContext,
  withSystemContext,
  withTenantContext,
} from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";

import { parseOrThrow } from "../actor";
import type { MarketplaceActor, RequestMeta } from "../actor";
import type { MarketplaceSpecialty } from "../match/specialties";
import { profileInputSchema } from "./schemas";

/** Vue « mon profil » (espace conseiller) — forme DB (champs nullables). */
export interface MyPublicProfile {
  id: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  regions: string[];
  languages: string[];
  specialties: MarketplaceSpecialty[];
  yearsExperience: number | null;
  credentialsText: string | null;
  photoData: string | null;
  /** Source publique de la photo (route coffre) — null si aucune. */
  photoUrl: string | null;
  isListed: boolean;
  listedAt: string | null;
  updatedAt: string;
}

/** Carte publique (annuaire) — JAMAIS les coordonnées directes du conseiller. */
export interface PublicProfileCard {
  profileId: string;
  displayName: string;
  firmName: string;
  headline: string | null;
  bio: string | null;
  regions: string[];
  languages: string[];
  specialties: MarketplaceSpecialty[];
  yearsExperience: number | null;
  credentialsText: string | null;
  photoData: string | null;
  /** Source publique de la photo (route coffre) — null si aucune. */
  photoUrl: string | null;
}

type ProfileRow = {
  id: string;
  tenantId: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  regions: string[];
  languages: string[];
  specialties: MarketplaceSpecialty[];
  yearsExperience: number | null;
  credentialsText: string | null;
  photoData: string | null;
  photoStorageKey: string | null;
  isListed: boolean;
  listedAt: Date | null;
  updatedAt: Date;
};

/**
 * Les colonnes propres au profil UNIQUEMENT — JAMAIS de jointure dans les
 * requêtes publiques : sous RLS publique, `tenants` et `users` sont
 * invisibles (politique 0002), donc toute relation Prisma requise
 * casserait la requête (« Inconsistent query result »). Le nom du
 * cabinet et l'e-mail conseiller sont résolus séparément en contexte
 * système avec des sélections étroites (ADR-009).
 */

function photoUrlFor(row: { id: string; photoStorageKey: string | null }): string | null {
  return row.photoStorageKey ? `/conseillers/${row.id}/photo` : null;
}

function toMyProfile(row: ProfileRow): MyPublicProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    headline: row.headline,
    bio: row.bio,
    regions: row.regions,
    languages: row.languages,
    specialties: row.specialties,
    yearsExperience: row.yearsExperience,
    credentialsText: row.credentialsText,
    photoData: row.photoData,
    photoUrl: photoUrlFor(row),
    isListed: row.isListed,
    listedAt: row.listedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublicCard(row: ProfileRow, firmName: string): PublicProfileCard {
  return {
    profileId: row.id,
    displayName: row.displayName,
    firmName,
    headline: row.headline,
    bio: row.bio,
    regions: row.regions,
    languages: row.languages,
    specialties: row.specialties,
    yearsExperience: row.yearsExperience,
    credentialsText: row.credentialsText,
    photoData: row.photoData,
    photoUrl: photoUrlFor(row),
  };
}

const CARD_SELECT = {
  id: true,
  displayName: true,
  headline: true,
  bio: true,
  regions: true,
  languages: true,
  specialties: true,
  yearsExperience: true,
  credentialsText: true,
  photoData: true,
  photoStorageKey: true,
  isListed: true,
  listedAt: true,
  updatedAt: true,
  tenantId: true,
} as const;

/** Noms des cabinets (donnée publique par nature) — sélection étroite. */
async function resolveFirmNames(
  tenantIds: string[],
): Promise<Map<string, string>> {
  if (tenantIds.length === 0) return new Map();
  const rows = await withSystemContext((tx) =>
    tx.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true },
    }),
  );
  return new Map(rows.map((row) => [row.id, row.name] as const));
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * Décode une photo « data:image/{png|jpeg|webp};base64,… » (Sprint 8 :
 * la photo migre de la colonne base64 vers le coffre chiffré).
 */
function parsePhotoDataUrl(dataUrl: string): { bytes: Buffer; mime: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new ValidationError(
      "La photo doit être une image PNG, JPEG ou WebP encodée en base64.",
    );
  }
  const bytes = Buffer.from(match[2] ?? "", "base64");
  if (bytes.length === 0 || bytes.length > MAX_PHOTO_BYTES) {
    throw new ValidationError("La photo doit peser entre 1 octet et 5 Mo.");
  }
  return { bytes, mime: match[1] ?? "image/png" };
}

/** Profil public du conseiller connecté (brouillon ou listé). */
export async function getMyPublicProfile(
  actor: MarketplaceActor,
): Promise<MyPublicProfile | null> {
  requirePermission(actor.role, "marketplace:read");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const row = await tx.advisorPublicProfile.findUnique({
      where: { advisorId: actor.userId },
      select: CARD_SELECT,
    });
    if (!row) return null;
    return toMyProfile(row);
  });
}

/** Crée/met à jour « mon profil public » (audit + permission write). */
export async function upsertMyPublicProfile(
  actor: MarketplaceActor,
  rawInput: unknown,
  meta: RequestMeta = {},
): Promise<MyPublicProfile> {
  requirePermission(actor.role, "marketplace:write");
  const input = parseOrThrow(profileInputSchema, rawInput);
  const { photoData, removePhoto, ...profileFields } = input;

  // Sprint 8 : la photo migre au coffre chiffré (même ObjectStorage AES-
  // 256-GCM que les pièces) — la colonne base64 est gelée à null.
  const photo = photoData ? parsePhotoDataUrl(photoData) : null;
  const storage = getObjectStorage();
  const photoKey = photo ? `avatars/${actor.tenantId}/${randomUUID()}.enc` : null;
  let storedPhoto: {
    sizeBytes: number;
    sha256: string;
    contentTag: string;
  } | null = null;
  if (photo && photoKey) {
    storedPhoto = await storage.put(Readable.from(photo.bytes), photoKey);
  }
  try {
    const { row, replacedKey } = await withTenantContext(
      actor.tenantId,
      actor.userId,
      async (tx) => {
        // Une photo compte dans le stockage du palier (ADR-013).
        if (photo) {
          const plan = await resolveEffectivePlan(
            tx,
            actor.tenantId,
            (code) => getPlan(code) ?? BILLING_PLANS.decouverte,
            BILLING_PLANS.decouverte,
          );
          assertVaultQuota(
            plan,
            await computeTenantUsage(tx, actor.tenantId),
            photo.bytes.length,
          );
        }
        const previous = await tx.advisorPublicProfile.findUnique({
          where: { advisorId: actor.userId },
          select: { photoStorageKey: true },
        });
        const photoColumns: Record<string, unknown> =
          storedPhoto && photoKey && photo
            ? {
                photoStorageKey: photoKey,
                photoSha256: storedPhoto.sha256,
                photoSizeBytes: storedPhoto.sizeBytes,
                photoMimeType: photo.mime,
                photoContentTag: storedPhoto.contentTag,
              }
            : removePhoto
              ? {
                  photoStorageKey: null,
                  photoSha256: null,
                  photoSizeBytes: null,
                  photoMimeType: null,
                  photoContentTag: null,
                }
              : {};
        const row = await tx.advisorPublicProfile.upsert({
          where: { advisorId: actor.userId },
          create: {
            tenantId: actor.tenantId,
            advisorId: actor.userId,
            ...profileFields,
            photoData: null,
            ...photoColumns,
          },
          update: { ...profileFields, photoData: null, ...photoColumns },
          select: CARD_SELECT,
        });
        await recordAudit(tx, {
          tenantId: actor.tenantId,
          actorUserId: actor.userId,
          action: "marketplace.profile.updated",
          entityType: "AdvisorPublicProfile",
          entityId: row.id,
          newData: {
            displayName: input.displayName,
            specialties: input.specialties,
            regions: input.regions,
            hasPhoto: Boolean(storedPhoto) || Boolean(row.photoStorageKey),
          },
          ...meta,
        });
        return {
          row,
          replacedKey:
            storedPhoto || removePhoto
              ? previous?.photoStorageKey ?? null
              : null,
        };
      },
    );
    // Purge au mieux de l'ancien blob APRÈS succès (jamais avant).
    if (replacedKey) {
      await storage.remove(replacedKey).catch((cause: unknown) => {
        console.warn("[marketplace] purge de l'ancienne photo :", cause);
      });
    }
    return toMyProfile(row);
  } catch (error) {
    if (storedPhoto && photoKey) {
      await storage.remove(photoKey).catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Photo publique d'un profil LISTÉ, lue DU COFFRE (Sprint 8) — flux
 * anonyme confiné à la colonne de preuve d'un profil visible.
 */
export async function getListedProfilePhoto(
  profileId: string,
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const row = await withPublicContext(null, (tx) =>
    tx.advisorPublicProfile.findFirst({
      where: { id: profileId, isListed: true, photoStorageKey: { not: null } },
      select: {
        photoStorageKey: true,
        photoContentTag: true,
        photoMimeType: true,
      },
    }),
  );
  if (!row?.photoStorageKey || !row.photoContentTag) return null;
  const bytes = await getObjectStorage().readAll(
    row.photoStorageKey,
    row.photoContentTag,
  );
  return { bytes, mimeType: row.photoMimeType ?? "image/png" };
}

/**
 * Active/retire la visibilité publique — OPT-IN explicite (Loi 25) :
 * `consent` requis à l'affichage ; listed_at / unlisted_at horodatés et
 * audités (la preuve de consentement vit dans le journal).
 */
export async function setProfileListing(
  actor: MarketplaceActor,
  listed: boolean,
  consent: boolean,
  meta: RequestMeta = {},
): Promise<{ isListed: boolean; listedAt: string | null }> {
  requirePermission(actor.role, "marketplace:write");
  if (listed && !consent) {
    throw new ValidationError(
      "Votre consentement explicite est requis pour rendre votre profil visible publiquement.",
    );
  }

  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const existing = await tx.advisorPublicProfile.findUnique({
      where: { advisorId: actor.userId },
      select: { id: true, bio: true },
    });
    if (!existing) {
      throw new ValidationError(
        "Complétez d'abord votre profil public avant de demander sa visibilité.",
      );
    }
    // La vitrine Annuaire est une fonctionnalité du palier Essentiel+ (Sprint 8).
    if (listed) {
      const plan = await resolveEffectivePlan(
        tx,
        actor.tenantId,
        (code) => getPlan(code) ?? BILLING_PLANS.decouverte,
        BILLING_PLANS.decouverte,
      );
      assertMarketplaceListing(plan);
    }
    const row = await tx.advisorPublicProfile.update({
      where: { id: existing.id },
      data: listed
        ? { isListed: true, listedAt: new Date(), unlistedAt: null }
        : { isListed: false, unlistedAt: new Date() },
      select: { id: true, isListed: true, listedAt: true },
    });
    await recordAudit(tx, {
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      action: listed ? "marketplace.profile.listed" : "marketplace.profile.unlisted",
      entityType: "AdvisorPublicProfile",
      entityId: row.id,
      newData: { consentGiven: listed ? true : undefined },
      ...meta,
    });
    if (listed) {
      await trackSafely(tx, {
        tenantId: actor.tenantId,
        app: "web-advisor",
        actorKind: "STAFF",
        actorId: actor.userId,
        name: "marketplace.profile_listed",
        props: { profileId: row.id },
      });
    }
    return { isListed: row.isListed, listedAt: row.listedAt?.toISOString() ?? null };
  });
}

/** Annuaire public — UNIQUEMENT les profils listés (RLS + filtre explicite). */
export async function listPublicProfiles(): Promise<PublicProfileCard[]> {
  const rows = await withPublicContext(null, (tx) =>
    tx.advisorPublicProfile.findMany({
      where: { isListed: true },
      // nulls en dernier : Postgres place NULL en tête d'un DESC par défaut.
      orderBy: [
        { yearsExperience: { sort: "desc", nulls: "last" } },
        { displayName: "asc" },
      ],
      select: CARD_SELECT,
    }),
  );
  const firms = await resolveFirmNames(rows.map((row) => row.tenantId));
  return rows.map((row) =>
    toPublicCard(row, firms.get(row.tenantId) ?? "Cabinet"),
  );
}

/** Un profil public — null si non listé (indistinguable de l'inexistant). */
export async function getPublicProfile(
  profileId: string,
): Promise<PublicProfileCard | null> {
  const row = await withPublicContext(null, (tx) =>
    tx.advisorPublicProfile.findFirst({
      where: { id: profileId, isListed: true },
      select: CARD_SELECT,
    }),
  );
  if (!row) return null;
  const firms = await resolveFirmNames([row.tenantId]);
  return toPublicCard(row, firms.get(row.tenantId) ?? "Cabinet");
}
