import { trackSafely } from "@coadvisor/analytics";
import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import {
  withMarketplacePublicContext,
  withPublicContext,
  withSystemContext,
  withTenantContext,
} from "@coadvisor/database";
import { getAssessmentReport } from "@coadvisor/fnae";
import type { Dimension, EngineResult } from "@coadvisor/fnae";
import { NotificationError, sendEmail } from "@coadvisor/notifications";
import { DomainError } from "@coadvisor/types";
import { z } from "zod";

import { parseOrThrow } from "../actor";
import type { MarketplaceActor } from "../actor";
import { matchAdvisors, MATCH_ENGINE_VERSION } from "../match/engine";
import type { MatchCandidate } from "../match/engine";
import { contactRequestSchema } from "../profile/schemas";
import { listPublicProfiles } from "../profile/service";

const uuidSchema = z.string().uuid();

export interface SubmittedContactRequest {
  contactRequestId: string;
  leadId: string;
  matchScore: number | null;
}

/** Profil listé + internes nécessaires à la prise de contact (jamais exposés au public). */
interface ListedProfileInternal {
  profileId: string;
  tenantId: string;
  advisorId: string;
  displayName: string;
}

/**
 * Charge le profil pour une prise de contact — UNIQUEMENT s'il est
 * listé (la RLS publique refuse de toute façon les autres lignes) ;
 * l'e-mail conseiller reste serveur-side (notification uniquement).
 */
async function loadListedProfileInternal(
  profileId: string,
): Promise<ListedProfileInternal | null> {
  if (!uuidSchema.safeParse(profileId).success) return null;
  // Aucune jointure ici : `users` est cloisonnée sous RLS publique
  // (politique 0002) — voir note sur les requêtes publiques (ADR-009).
  return withPublicContext(null, async (tx) => {
    const row = await tx.advisorPublicProfile.findFirst({
      where: { id: profileId, isListed: true },
      select: {
        id: true,
        tenantId: true,
        advisorId: true,
        displayName: true,
      },
    });
    if (!row) return null;
    return {
      profileId: row.id,
      tenantId: row.tenantId,
      advisorId: row.advisorId,
      displayName: row.displayName,
    };
  });
}

/** Coordonnées internes du conseiller (notification — jamais exposées). */
async function loadAdvisorRecipient(
  advisorId: string,
): Promise<{ email: string; firstName: string } | null> {
  return withSystemContext((tx) =>
    tx.user.findUnique({
      where: { id: advisorId },
      select: { email: true, firstName: true },
    }),
  );
}

/**
 * Recalcule les 3 priorités (dimensions les plus faibles) à partir des
 * scores par dimension du portrait — les priorités affichées au public
 * sont des libellés ; repartir des scores rend le croisement infalsifiable.
 */
export function prioritiesFromCategoryScores(
  categoryScores: Record<string, unknown>,
): Dimension[] {
  const entries = Object.entries(categoryScores).filter(
    (entry): entry is [Dimension, number] => typeof entry[1] === "number",
  );
  return entries
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([dimension]) => dimension);
}

/** Charge un portrait prouvé par son capability token (sinon null). */
async function loadPortraitForMatching(
  assessmentId: unknown,
  token: unknown,
): Promise<{ id: string; priorities: Dimension[] } | null> {
  if (
    typeof assessmentId !== "string" ||
    typeof token !== "string" ||
    !uuidSchema.safeParse(assessmentId).success ||
    !uuidSchema.safeParse(token).success
  ) {
    return null;
  }
  const assessment = await getAssessmentReport(assessmentId, token);
  if (!assessment) return null;
  const categoryScores =
    (assessment.categoryScores as Record<string, unknown> | null) ??
    ((assessment.report as unknown as EngineResult)
      .dimensionScores as unknown as Record<string, unknown>);
  return { id: assessment.id, priorities: prioritiesFromCategoryScores(categoryScores) };
}

/**
 * Demande de contact prospect → conseiller (flux PUBLIC, anonyme).
 *
 * Chaîne de confiance (ADR-009) :
 * 1. Le profil visé DOIT être listé (RLS publique) — sinon réponse
 *    identique à « inexistant » (anti-énumération) ;
 * 2. Le matching est RECALCULÉ côté serveur depuis le portrait prouvé
 *    par son token (jamais de score reçu du navigateur) ;
 * 3. Lead + demande créés en contexte `withMarketplacePublicContext` :
 *    la RLS exige la preuve (profil listé + même tenant) via la GUC
 *    `app.marketplace_profile` et la politique `leads_marketplace_insert` ;
 * 4. Consentement Loi 25 obligatoire (zod literal true + consent_at) ;
 * 5. Notification e-mail au conseiller en meilleur effort — son échec
 *    ne fait JAMAIS échouer la demande (audité dans les deux cas).
 */
export async function submitContactRequest(raw: {
  profileId: string;
  input: unknown;
  assessmentId?: string;
  portraitToken?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<SubmittedContactRequest> {
  const profile = await loadListedProfileInternal(raw.profileId);
  if (!profile) {
    throw new DomainError("Ce profil n'est pas disponible.", "PROFILE_NOT_FOUND");
  }
  const input = parseOrThrow(contactRequestSchema, raw.input);

  // Matching trustless : recalcul serveur depuis le portrait prouvé.
  const portrait = await loadPortraitForMatching(raw.assessmentId, raw.portraitToken);
  let matchScore: number | null = null;
  let matchReasons: string[] | null = null;
  if (portrait && portrait.priorities.length > 0) {
    const listed = await listPublicProfiles();
    const candidates: MatchCandidate[] = listed.map((card) => ({
      profileId: card.profileId,
      specialties: card.specialties,
      regions: card.regions,
      languages: card.languages,
      yearsExperience: card.yearsExperience,
    }));
    const match = matchAdvisors(candidates, {
      priorities: portrait.priorities,
    }).find((result) => result.profileId === profile.profileId);
    if (match) {
      matchScore = match.score;
      matchReasons = match.reasons;
    }
  }

  const consentAt = new Date();
  // Identifiants générés CÔTÉ APP + createMany (pas de RETURNING) :
  // en contexte public, la politique SELECT refuse par design la lecture
  // — or Prisma `create` émet INSERT…RETURNING, qui exige le passage de
  // la politique SELECT. Pattern inauguré au Sprint 3 (ADR-006 addendum,
  // migration 0007) et repris ici (ADR-009). Les politiques WITH CHECK
  // (preuve par profil listé / GUC) restent pleinement en vigueur.
  const leadId = crypto.randomUUID();
  const contactRequestId = crypto.randomUUID();
  await withMarketplacePublicContext(profile.profileId, async (tx) => {
    await tx.lead.createMany({
      data: {
        id: leadId,
        tenantId: profile.tenantId,
        assessmentId: portrait?.id ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone ?? null,
        consent: true,
        consentAt,
        source: "annuaire",
      },
    });
    await tx.marketplaceContactRequest.createMany({
      data: {
        id: contactRequestId,
        tenantId: profile.tenantId,
        profileId: profile.profileId,
        leadId,
        prospectName: `${input.firstName} ${input.lastName}`,
        prospectEmail: input.email,
        prospectPhone: input.phone ?? null,
        message: input.message,
        consent: true,
        consentAt,
        matchScore,
        matchReasons: matchReasons ?? undefined,
        engineVersion: MATCH_ENGINE_VERSION,
      },
    });
    // Mesure produit first-party — contexte public « profil prouvé »
    // (Sprint 8, ADR-014 ; INSERT brut, aucune relecture possible).
    await trackSafely(tx, {
      tenantId: profile.tenantId,
      app: "web-marketplace",
      actorKind: "ANONYMOUS",
      name: "contact_request.submitted",
      props: { profileId: profile.profileId },
    });
  });

  // Audit : contexte système APRÈS la transaction (le journal refuse
  // l'écriture en contexte public — politique 0002, défense en profondeur).
  await withSystemContext(async (tx) => {
    await recordAudit(tx, {
      tenantId: profile.tenantId,
      actorUserId: null,
      action: "marketplace.contact.requested",
      entityType: "MarketplaceContactRequest",
      entityId: contactRequestId,
      newData: {
        profileId: profile.profileId,
        matchScore,
        engineVersion: MATCH_ENGINE_VERSION,
        consentGiven: true,
      },
      ipAddress: raw.ipAddress,
      userAgent: raw.userAgent,
    });
  });

  // Notification e-mail conseiller — meilleur effort, auditée.
  // (coordonnées résolues en contexte système, jamais exposées publiquement)
  const recipient = await loadAdvisorRecipient(profile.advisorId);
  if (recipient === null) {
    return { contactRequestId, leadId, matchScore };
  }
  try {
    const result = await sendEmail({
      to: recipient.email,
      subject: `Nouvelle demande de contact — ${input.firstName} ${input.lastName}`,
      text:
        `Bonjour ${recipient.firstName},\n\n` +
        `${input.firstName} ${input.lastName} vous a envoyé une demande via l'annuaire public CoAdvisor` +
        (matchScore !== null
          ? ` (adéquation avec son portrait : ${matchScore}/100)`
          : "") +
        `.\n\nCourriel du prospect : ${input.email}\n` +
        `Consentement Loi 25 : donné, horodaté.\n\n` +
        `Message :\n« ${input.message} »\n\n` +
        `Retrouvez ce lead dans votre boîte « Leads » (source : Annuaire public).\n`,
    });
    await withSystemContext(async (tx) => {
      await recordAudit(tx, {
        tenantId: profile.tenantId,
        actorUserId: null,
        action: "notification.email.sent",
        entityType: "MarketplaceContactRequest",
        entityId: contactRequestId,
        newData: {
          kind: "marketplace_contact",
          provider: result.provider,
          reference: result.reference,
        },
        ipAddress: raw.ipAddress,
        userAgent: raw.userAgent,
      });
    });
  } catch (error) {
    if (error instanceof NotificationError) {
      await withSystemContext(async (tx) => {
        await recordAudit(tx, {
          tenantId: profile.tenantId,
          actorUserId: null,
          action: "notification.email.failed",
          entityType: "MarketplaceContactRequest",
          entityId: contactRequestId,
          newData: { kind: "marketplace_contact", reason: error.reason },
          ipAddress: raw.ipAddress,
          userAgent: raw.userAgent,
        });
      });
    } else {
      throw error;
    }
  }

  return { contactRequestId, leadId, matchScore };
}

/** Demande rattachée à un lead (détail boîte Leads, côté conseiller). */
export async function getContactRequestForLead(
  actor: MarketplaceActor,
  leadId: string,
): Promise<{
  id: string;
  prospectName: string;
  prospectPhone: string | null;
  message: string;
  consentAt: string | null;
  matchScore: number | null;
  matchReasons: string[] | null;
  profileDisplayName: string;
  engineVersion: string;
} | null> {
  requirePermission(actor.role, "leads:read");
  return withTenantContext(actor.tenantId, actor.userId, async (tx) => {
    const row = await tx.marketplaceContactRequest.findUnique({
      where: { leadId },
      include: { profile: { select: { displayName: true } } },
    });
    if (!row) return null;
    return {
      id: row.id,
      prospectName: row.prospectName,
      prospectPhone: row.prospectPhone,
      message: row.message,
      consentAt: row.consentAt?.toISOString() ?? null,
      matchScore: row.matchScore,
      matchReasons: Array.isArray(row.matchReasons)
        ? (row.matchReasons as string[])
        : null,
      profileDisplayName: row.profile.displayName,
      engineVersion: row.engineVersion,
    };
  });
}
