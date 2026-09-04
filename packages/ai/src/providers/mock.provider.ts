import type {
  EmbedRequest,
  GenerateRequest,
  GenerateResponse,
  LLMGateway,
} from "../gateway";

/**
 * Provider de développement — AUCUN appel externe.
 * Retourne des réponses déterministes pour permettre le câblage des
 * modules (Sprint 1-3) en attendant un provider réel conforme (région CA).
 */
export class MockLLMGateway implements LLMGateway {
  readonly provider = "mock";

  generate(request: GenerateRequest): Promise<GenerateResponse> {
    const region = request.region ?? "ca";
    return Promise.resolve({
      provider: this.provider,
      model: "mock-1",
      text:
        `[MOCK — aucune donnée transmise à l'externe | région=${region} | ` +
        `purpose=${request.purpose}]\n` +
        `Réponse simulée pour : ${request.prompt.slice(0, 120)}`,
    });
  }

  embed(request: EmbedRequest): Promise<number[][]> {
    return Promise.resolve(
      request.texts.map((text) => {
        // Vecteur pseudo-déterministe (8 dims) — stub structurel uniquement.
        const vector = new Array<number>(8).fill(0);
        for (let i = 0; i < text.length; i += 1) {
          const index = i % 8;
          vector[index] = (vector[index] ?? 0) + text.charCodeAt(i) / 1000;
        }
        return vector;
      }),
    );
  }
}

export const llmGateway: LLMGateway = new MockLLMGateway();
