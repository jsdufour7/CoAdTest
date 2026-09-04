"use server";

import { revalidatePath } from "next/cache";

import {
  generateClientReport,
  generateClientSummary,
  generateMeetingPrep,
  generateSuggestions,
  getLatestCopilotArtifact,
  probeCopilotBridge,
} from "@coadvisor/ai";
import type { CopilotArtifactKind, CopilotHealth } from "@coadvisor/ai";
import { addNote, addTask } from "@coadvisor/crm";
import { DomainError } from "@coadvisor/types";

import {
  getRequestMeta,
  requireAdvisorContext,
} from "../../../../lib/advisor-context";

/** État des formulaires Copilot (+ provenance pour l'indicateur UI). */
export interface CopilotMutationState {
  error?: string;
  success?: boolean;
  provider?: string;
  model?: string;
  fellBack?: boolean;
}

function toError(error: unknown): CopilotMutationState {
  if (error instanceof DomainError) {
    return { error: error.message };
  }
  throw error;
}

const KIND_REVALIDATE = (clientId: string) => {
  revalidatePath(`/clients/${clientId}/copilot`);
  revalidatePath(`/clients/${clientId}`); // carte résumé 360°
};

/** Génération d'un artefact (résumé / préparation / suggestions / bilan). */
export async function generateArtifactAction(
  kind: CopilotArtifactKind,
  clientId: string,
  _prevState: CopilotMutationState,
  formData: FormData,
): Promise<CopilotMutationState> {
  const { actor } = await requireAdvisorContext();
  const instructions = String(formData.get("instructions") ?? "").trim();

  try {
    const meta = await getRequestMeta();
    const options = instructions !== "" ? { instructions } : undefined;
    const artifact =
      kind === "SUMMARY"
        ? await generateClientSummary(actor, clientId, options, meta)
        : kind === "MEETING_PREP"
          ? await generateMeetingPrep(actor, clientId, options, meta)
          : kind === "SUGGESTIONS"
            ? await generateSuggestions(actor, clientId, options, meta)
            : await generateClientReport(actor, clientId, options, meta);
    KIND_REVALIDATE(clientId);
    return {
      success: true,
      provider: artifact.provider,
      model: artifact.model,
      fellBack: artifact.fellBack,
    };
  } catch (error) {
    return toError(error);
  }
}

export interface BridgeProbeState {
  health?: CopilotHealth & { preference: string };
}

/** Bouton « Tester la passerelle » — sonde /health (serveur seulement). */
export async function probeBridgeAction(
  _prevState: BridgeProbeState,
): Promise<BridgeProbeState> {
  await requireAdvisorContext();
  const health = await probeCopilotBridge();
  return { health };
}

/**
 * Sauvegarde la préparation de rencontre au journal (note MEETING).
 * Erreurs (artefact périmé, validation) retournées EN LIGNE via l'état
 * du formulaire — jamais d'exception non rattrapée qui casserait la page.
 */
export async function savePrepAsNoteAction(
  clientId: string,
  artifactId: string,
  _prevState: CopilotMutationState,
  _formData: FormData,
): Promise<CopilotMutationState> {
  const { actor } = await requireAdvisorContext();
  try {
    const artifact = await getLatestCopilotArtifact(actor, clientId, "MEETING_PREP");
    if (!artifact || artifact.id !== artifactId) {
      throw new DomainError(
        "Cette préparation n'est plus la plus récente — régénérez-la.",
        "STALE_ARTIFACT",
      );
    }
    await addNote(
      {
        type: "MEETING",
        content: `[Préparation de rencontre — générée par le Copilot (${artifact.provider}), validée par le conseiller]\n\n${artifact.content}`,
      },
      actor,
      clientId,
      await getRequestMeta(),
    );
    // Fiche 360° seulement : la carte Copilot est inchangée, ce qui
    // préserve l'état « journalisée » affiché par le bouton.
    revalidatePath(`/clients/${clientId}`);
    return { success: true };
  } catch (error) {
    return toError(error);
  }
}

/** Crée une tâche à partir d'une suggestion Copilot. */
export async function createTaskFromSuggestionAction(
  clientId: string,
  title: string,
  rationale: string,
  _prevState: CopilotMutationState,
  _formData: FormData,
): Promise<CopilotMutationState> {
  const { actor } = await requireAdvisorContext();
  try {
    await addTask(
      {
        title,
        description: `Suggestion Copilot : ${rationale}`,
        priority: "MEDIUM",
      },
      actor,
      clientId,
      await getRequestMeta(),
    );
  } catch (error) {
    return toError(error);
  }
  revalidatePath(`/clients/${clientId}`);
  return { success: true };
}
