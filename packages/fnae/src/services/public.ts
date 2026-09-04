import { withPublicContext, withSystemContext } from "@coadvisor/database";
import { ValidationError } from "@coadvisor/types";
import { z } from "zod";

import { parseOrThrow } from "../actor";
import { computePortrait } from "../engine";
import type { EngineResult } from "../engine";
import { questionnaireSchema } from "../questionnaire";

/**
 * Flux PUBLIC (anonyme) — ADR-006.
 * Aucune session, aucun tenant : l'accès ultérieur au portrait se fait
 * exclusivement par capability token (read_token non devinable).
 * Journal d'audit : sans tenant → traçabilité par les lignes elles-mêmes
 * (consent_at matérialise le consentement Loi 25).
 */

export interface SubmittedAssessment {
  id: string;
  readToken: string;
  result: EngineResult;
}

/** Soumet un questionnaire et calcule le portrait financier immédiat. */
export async function submitAssessment(
  rawAnswers: unknown,
  source = "marketplace",
): Promise<SubmittedAssessment> {
  const answers = parseOrThrow(questionnaireSchema, rawAnswers);
  const result = computePortrait(answers);

  // Le capability token est généré CÔTÉ APP (et non par défaut DB) :
  // Prisma `create` fait un INSERT … RETURNING, et la clause RETURNING
  // exige que la ligne fraîche passe la politique SELECT — donc le
  // contexte public doit DÉJÀ connaître le token de la ligne insérée.
  // (Piège documenté dans ADR-006 / migration 0007.)
  const readToken = crypto.randomUUID();

  const assessment = await withPublicContext(readToken, (tx) =>
    tx.assessment.create({
      data: {
        readToken,
        source,
        answers: answers as object,
        score: result.score,
        categoryScores: result.dimensionScores,
        report: result as unknown as object,
        engineVersion: result.engineVersion,
      },
    }),
  );

  return { id: assessment.id, readToken: assessment.readToken, result };
}

/**
 * Relit un portrait — SEULEMENT si le token correspond (RLS).
 * Retourne null pour tout couple (id, token) invalide : indistinguable
 * d'une analyse inexistante (anti-énumération).
 */
export async function getAssessmentReport(id: string, readToken: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  if (!z.string().uuid().safeParse(readToken).success) return null;

  const assessment = await withPublicContext(readToken, (tx) =>
    tx.assessment.findFirst({
      where: { id },
      select: {
        id: true,
        createdAt: true,
        engineVersion: true,
        report: true,
        score: true,
        categoryScores: true,
      },
    }),
  );
  if (!assessment) {
    return null;
  }

  // Un lead existe-t-il déjà pour ce portrait ? (booléen seulement —
  // la PII du lead est inaccessible au contexte public par RLS, et
  // un `include` Prisma serait silencieusement filtré à vide.)
  const leadCount = await withSystemContext((tx) =>
    tx.lead.count({ where: { assessmentId: id } }),
  );

  return { ...assessment, hasLead: leadCount > 0 };
}

const captureLeadSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est requis.").max(80),
  lastName: z.string().trim().min(1, "Le nom est requis.").max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Courriel invalide.")
    .max(160),
  phone: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(40).optional(),
  ),
  consent: z.preprocess(
    (value) => value === "on" || value === "true" || value === true,
    z.literal(true, {
      errorMap: () => ({
        message:
          "Votre consentement est requis pour être contacté (Loi 25).",
      }),
    }),
  ),
});

export interface CaptureLeadOptions {
  assessmentId: string;
  readToken: string;
  /** Slug du cabinet référent (?cabinet=slug) — attribution directe. */
  cabinetSlug?: string | undefined;
}

/**
 * Capture un lead consenti (Loi 25) suite à une analyse.
 * - le token du questionnaire est REVÉRIFIÉ avant toute attribution ;
 * - le slug cabinet est résolu côté serveur (jamais de tenant forgé) ;
 * - sans cabinet : tenant_id NULL → boîte plateforme (matching Sprint 6).
 */
export async function captureLead(
  rawInput: unknown,
  options: CaptureLeadOptions,
): Promise<{ leadId: string; attributed: boolean }> {
  const input = parseOrThrow(captureLeadSchema, rawInput);

  // 1. Le portrait doit exister ET le token doit correspondre (RLS).
  const assessment = await withPublicContext(options.readToken, (tx) =>
    tx.assessment.findFirst({
      where: { id: options.assessmentId },
      select: { id: true },
    }),
  );
  if (!assessment) {
    throw new ValidationError("Cette analyse est introuvable ou a expiré.");
  }

  // 2. Déduplication : un lead existe déjà pour cette analyse ?
  const existing = await withSystemContext((tx) =>
    tx.lead.findFirst({
      where: { assessmentId: assessment.id },
      select: { id: true },
    }),
  );
  if (existing) {
    return { leadId: existing.id, attributed: true };
  }

  // 3. Attribution optionnelle au cabinet référent.
  let tenantId: string | null = null;
  if (options.cabinetSlug) {
    const tenant = await withSystemContext((tx) =>
      tx.tenant.findUnique({
        where: { slug: options.cabinetSlug },
        select: { id: true },
      }),
    );
    tenantId = tenant?.id ?? null;
  }

  // 4. Création du lead (consentement horodaté).
  const lead = await withSystemContext((tx) =>
    tx.lead.create({
      data: {
        assessmentId: assessment.id,
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone ?? null,
        consent: true,
        consentAt: new Date(),
        source: tenantId ? "referral" : "marketplace",
      },
    }),
  );

  return { leadId: lead.id, attributed: tenantId !== null };
}
