import {
  CopilotBridgeError,
  type CopilotGenerateRequest,
  type CopilotGenerateResult,
  type CopilotHealth,
  type CopilotProvider,
} from "../contract";
import { buildUserPrompt, COPILOT_SYSTEM_PROMPT } from "../prompt";

/**
 * CodexBridgeProvider — appelle une API LOCALE compatible OpenAI
 * (ADR-008). Chaîne cible :
 *
 *   backend CoAdvisor → LLM_BASE_URL (/v1/chat/completions)
 *     → passerelle locale (Codex CLI authentifié ChatGPT Plus) → réponse
 *
 * ⚠ Serveur seulement : LLM_BASE_URL / LLM_API_KEY ne doivent JAMAIS
 * rejoindre le navigateur (les server actions Next.js portent cet
 * appel — aucun appel au bridge depuis le frontend).
 *
 * Config (.env racine) :
 *   LLM_BASE_URL   ex. http://127.0.0.1:8787/v1
 *   LLM_API_KEY    ex. coadvisor-demo-secret
 *   LLM_MODEL      ex. gpt-5.6-terra
 *   LLM_TIMEOUT_MS défaut 60000
 *
 * Le provider est REMPLAÇABLE : une offre conforme région CA pourra
 * signer le même contrat `CopilotProvider` sans toucher aux services.
 */

const DEFAULT_MODEL = "gpt-5.6-terra";
const DEFAULT_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 8_000;

export interface CopilotBridgeConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

function readConfig(overrides?: CopilotBridgeConfig) {
  return {
    baseUrl: overrides?.baseUrl ?? process.env.LLM_BASE_URL,
    apiKey: overrides?.apiKey ?? process.env.LLM_API_KEY,
    model: overrides?.model ?? process.env.LLM_MODEL ?? DEFAULT_MODEL,
    timeoutMs:
      overrides?.timeoutMs ??
      (process.env.LLM_TIMEOUT_MS
        ? Number(process.env.LLM_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_MS),
  };
}

function chatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/** `/v1` terminal retiré pour viser `/health` (hors espace de noms API). */
function healthUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const root = trimmed.replace(/\/v[0-9]+$/i, "");
  return `${root}/health`;
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: { content?: unknown };
    finish_reason?: string;
  }>;
  model?: string;
}

export class CodexBridgeProvider implements CopilotProvider {
  readonly id = "codex-bridge";
  readonly label = "Passerelle locale Codex (compatible OpenAI)";

  constructor(private readonly overrides?: CopilotBridgeConfig) {}

  isConfigured(): boolean {
    return Boolean(readConfig(this.overrides).baseUrl);
  }

  private requireConfig() {
    const config = readConfig(this.overrides);
    if (!config.baseUrl) {
      throw new CopilotBridgeError(
        "not_configured",
        "LLM_BASE_URL n'est pas configuré — le Copilot utilise le secours local.",
      );
    }
    return config;
  }

  async generate(
    request: CopilotGenerateRequest,
  ): Promise<Omit<CopilotGenerateResult, "fellBack">> {
    const config = this.requireConfig();
    const started = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(chatCompletionsUrl(config.baseUrl!), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(config.apiKey
            ? { authorization: `Bearer ${config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: COPILOT_SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(request) },
          ],
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new CopilotBridgeError(
          "timeout",
          `La passerelle n'a pas répondu en ${config.timeoutMs} ms — secours local activé.`,
        );
      }
      throw new CopilotBridgeError(
        "network",
        "Passerelle locale injoignable — secours local activé.",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 401 || response.status === 403) {
      throw new CopilotBridgeError(
        "http_auth",
        `Passerelle : authentification refusée (HTTP ${response.status}) — vérifiez LLM_API_KEY.`,
      );
    }
    if (!response.ok) {
      throw new CopilotBridgeError(
        "http",
        `Passerelle : HTTP ${response.status} inattendu — secours local activé.`,
      );
    }

    let payload: OpenAiChatResponse;
    try {
      payload = (await response.json()) as OpenAiChatResponse;
    } catch {
      throw new CopilotBridgeError(
        "invalid_response",
        "Passerelle : réponse JSON illisible — secours local activé.",
      );
    }

    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new CopilotBridgeError(
        "invalid_response",
        "Passerelle : réponse sans contenu exploitable (choices[0].message.content) — secours local activé.",
      );
    }

    return {
      content: content.trim(),
      provider: this.id,
      model: payload.model ?? config.model,
      latencyMs: Date.now() - started,
    };
  }

  /** Sonde `/health` — utilisée par le bouton « Tester la passerelle ». */
  async health(): Promise<CopilotHealth> {
    let config: ReturnType<typeof readConfig>;
    try {
      config = this.requireConfig();
    } catch {
      return {
        configured: false,
        reachable: false,
        latencyMs: 0,
        detail: "LLM_BASE_URL absent — configurez la passerelle dans .env.",
      };
    }

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(healthUrl(config.baseUrl!), {
        method: "GET",
        headers: config.apiKey
          ? { authorization: `Bearer ${config.apiKey}` }
          : undefined,
        signal: controller.signal,
      });
      return {
        configured: true,
        reachable: response.ok,
        statusCode: response.status,
        latencyMs: Date.now() - started,
        detail: response.ok
          ? `Passerelle joignable sur ${healthUrl(config.baseUrl!)}.`
          : `Passerelle jointe mais /health répond HTTP ${response.status}.`,
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        latencyMs: Date.now() - started,
        detail:
          error instanceof Error && error.name === "AbortError"
            ? `Aucune réponse en ${HEALTH_TIMEOUT_MS} ms.`
            : `Injoignable (${config.baseUrl}) — la passerelle est-elle démarrée?`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
