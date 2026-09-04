import { requirePermission } from "@coadvisor/auth";
import { recordAudit } from "@coadvisor/core-platform";
import { withTenantContext } from "@coadvisor/database";
import type { Prisma } from "@coadvisor/database";
import type { Role } from "@coadvisor/types";

import type {
  CopilotArtifactKind,
  CopilotGenerateRequest,
} from "./contract";
import { COPILOT_VERSION } from "./contract";
import { loadContextPack } from "./context-pack";
import {
  checkBridgeHealth,
  generateWithFallback,
  getCopilotRoutingState,
} from "./resolver";

/**
 * Services Advisor Intelligence (FR-AI-001) : résumé de dossier,
 * préparation de rencontre, suggestions, bilan client.
 *
 * Garanties :
 * - permission `clients:write` pour générer, `clients:read` pour consulter;
 * - artefact IMMUABLE persisté (Règle 3) avec provider + version + latence;
 * - audit `ai.copilot.generated` — métadonnées seulement (minimisation);
 * - tout appel LLM passe par la passerelle côté serveur, jamais exposé
 * au navigateur.
 */

export interface CopilotActor {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

const KIND_ACTION: Record<CopilotArtifactKind, string> = {
  SUMMARY: "résumé de dossier",
  MEETING_PREP: "préparation de rencontre",
  SUGGESTIONS: "suggestions",
  CLIENT_REPORT: "bilan client",
};

async function generateArtifact(
  kind: CopilotArtifactKind,
  actor: CopilotActor,
  clientId: string,
  options: { instructions?: string } = {},
  meta: RequestMeta = {},
) {
  requirePermission(actor.role, "clients:write");

  const contextPack = await loadContextPack(actor.tenantId, actor.userId, clientId);

  const request: CopilotGenerateRequest = {
    kind,
    contextPack,
    instructions: options.instructions,
  };
  const result = await generateWithFallback(request);

  const artifact = await withTenantContext(
    actor.tenantId,
    actor.userId,
    async (tx) => {
      const created = await tx.copilotArtifact.create({
        data: {
          tenantId: actor.tenantId,
          clientId,
          kind,
          content: result.content,
          structured: (result.structured ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          provider: result.provider,
          model: result.model,
          composerVersion: COPILOT_VERSION,
          fellBack: result.fellBack,
          latencyMs: result.latencyMs,
          generatedBy: actor.userId,
        },
      });

      // Audit — métadonnées uniquement : le contenu vit (RLS) dans la
      // table, on évite de le dupliquer au journal (minimisation Loi 25).
      await recordAudit(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "ai.copilot.generated",
        entityType: "CopilotArtifact",
        entityId: created.id,
        newData: {
          clientId,
          kind,
          provider: result.provider,
          model: result.model,
          fellBack: result.fellBack,
          attemptedProvider: result.attemptedProvider ?? null,
          latencyMs: result.latencyMs,
          composerVersion: COPILOT_VERSION,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      return created;
    },
  );

  return artifact;
}

/** Résumé instantané du dossier (gagne-temps #1 à l'ouverture). */
export const generateClientSummary = (
  actor: CopilotActor,
  clientId: string,
  options?: { instructions?: string },
  meta?: RequestMeta,
) => generateArtifact("SUMMARY", actor, clientId, options, meta);

/** Brief pré-rencontre structuré. */
export const generateMeetingPrep = (
  actor: CopilotActor,
  clientId: string,
  options?: { instructions?: string },
  meta?: RequestMeta,
) => generateArtifact("MEETING_PREP", actor, clientId, options, meta);

/** Suggestions actionnables (création de tâche en 1 clic côté UI). */
export const generateSuggestions = (
  actor: CopilotActor,
  clientId: string,
  options?: { instructions?: string },
  meta?: RequestMeta,
) => generateArtifact("SUGGESTIONS", actor, clientId, options, meta);

/** Bilan client imprimable (FR-AI-001 — « générer rapports »). */
export const generateClientReport = (
  actor: CopilotActor,
  clientId: string,
  options?: { instructions?: string },
  meta?: RequestMeta,
) => generateArtifact("CLIENT_REPORT", actor, clientId, options, meta);

/** Historique des artefacts d'un dossier (consultation). */
export async function listCopilotArtifacts(
  actor: CopilotActor,
  clientId: string,
  kind?: CopilotArtifactKind,
) {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.copilotArtifact.findMany({
      where: { clientId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        kind: true,
        provider: true,
        model: true,
        fellBack: true,
        latencyMs: true,
        createdAt: true,
      },
    }),
  );
}

/** Dernier artefact d'un type (affichage page + carte 360°). */
export async function getLatestCopilotArtifact(
  actor: CopilotActor,
  clientId: string,
  kind: CopilotArtifactKind,
) {
  requirePermission(actor.role, "clients:read");
  return withTenantContext(actor.tenantId, actor.userId, (tx) =>
    tx.copilotArtifact.findFirst({
      where: { clientId, kind },
      orderBy: { createdAt: "desc" },
    }),
  );
}

/** État du routage Copilot pour l'indicateur UI (sans appel réseau). */
export { getCopilotRoutingState };

/** Sonde `/health` de la passerelle (bouton « Tester la passerelle »). */
export const probeCopilotBridge = checkBridgeHealth;

/** Libellé humain du type d'artefact (UI). */
export const ARTIFACT_KIND_LABELS = KIND_ACTION;
