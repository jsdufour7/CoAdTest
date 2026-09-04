import {
  CopilotBridgeError,
  type CopilotGenerateRequest,
  type CopilotGenerateResult,
  type CopilotHealth,
  type CopilotProvider,
} from "./contract";
import { CodexBridgeProvider } from "./providers/codex-bridge.provider";
import { LocalComposerProvider } from "./providers/local-composer.provider";

/**
 * Résolution du provider Copilot (ADR-008) :
 *
 *   COPILOT_PROVIDER=codex-bridge (défaut implicite "auto") + LLM_BASE_URL
 *     → passerelle locale compatible OpenAI (primaire)
 *   sinon / indisponible au moment de l'appel
 *     → LocalComposerProvider (secours automatique, indicateur fellBack)
 *
 * Registered providers (remplacement futur conforme région CA) : le
 * contrat `CopilotProvider` reste stable — ajouter ici une entrée suffit.
 */

export interface CopilotResolution {
  /** Provider primaire selon la configuration du serveur. */
  primary: CopilotProvider;
  /** Toujours le composer local (disponibilité garantie). */
  fallback: CopilotProvider;
  /** true si la passerelle est prévue par la config (peut être partie). */
  bridgeExpected: boolean;
}

export function resolveCopilotProviders(): CopilotResolution {
  const fallback = new LocalComposerProvider();
  const preference = (process.env.COPILOT_PROVIDER ?? "auto").toLowerCase();

  const bridge = new CodexBridgeProvider();
  const bridgeExpected =
    (preference === "codex-bridge" || preference === "auto") &&
    bridge.isConfigured();

  return {
    primary: bridgeExpected ? bridge : fallback,
    fallback,
    bridgeExpected,
  };
}

/**
 * Génération avec SECOURS AUTOMATIQUE (exigence produit) : toute erreur
 * de passerelle (`CopilotBridgeError`) retombe sur le composer local.
 * Les autres erreurs (bugs, validation) remontent telles quelles.
 */
export async function generateWithFallback(
  request: CopilotGenerateRequest,
): Promise<CopilotGenerateResult> {
  const { primary, fallback, bridgeExpected } = resolveCopilotProviders();

  if (!bridgeExpected) {
    const result = await fallback.generate(request);
    return { ...result, fellBack: false };
  }

  try {
    const result = await primary.generate(request);
    return { ...result, fellBack: false };
  } catch (error) {
    if (error instanceof CopilotBridgeError) {
      const rescued = await fallback.generate(request);
      return {
        ...rescued,
        fellBack: true,
        attemptedProvider: primary.id,
      };
    }
    throw error;
  }
}

/** Santé de la passerelle (bouton « Tester la passerelle »). */
export async function checkBridgeHealth(): Promise<
  CopilotHealth & { preference: string }
> {
  const preference = process.env.COPILOT_PROVIDER ?? "auto";
  const bridge = new CodexBridgeProvider();
  const health = await bridge.health();
  return { ...health, preference };
}

/** Résumé de l'état courant pour l'indicateur UI (aucun appel réseau). */
export function getCopilotRoutingState(): {
  preference: string;
  bridgeConfigured: boolean;
  effective: "codex-bridge" | "local-composer";
  effectiveLabel: string;
} {
  const { primary, bridgeExpected } = resolveCopilotProviders();
  return {
    preference: process.env.COPILOT_PROVIDER ?? "auto",
    bridgeConfigured: bridgeExpected,
    effective: primary.id === "codex-bridge" ? "codex-bridge" : "local-composer",
    effectiveLabel:
      primary.id === "codex-bridge"
        ? "Passerelle locale Codex"
        : bridgeExpected
          ? "Composer local — passerelle configurée mais non joignable au départ"
          : "Composer local (secours)",
  };
}
