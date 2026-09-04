import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import {
  CopilotBridgeError,
  type CopilotContextPack,
} from "../copilot/contract";
import { CodexBridgeProvider } from "../copilot/providers/codex-bridge.provider";
import { buildUserPrompt } from "../copilot/prompt";
import { generateWithFallback } from "../copilot/resolver";

/** Serveur HTTP local simulant la passerelle compatible OpenAI. */
async function startFakeBridge(
  handler: (body: string) => {
    status: number;
    payload: unknown;
    delayMs?: number;
  },
  withHealth = true,
) {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      if (!withHealth) {
        res.writeHead(503).end("ko");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({ status: "ok" }),
      );
      return;
    }
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const { status, payload, delayMs = 0 } = handler(raw);
      setTimeout(() => {
        res
          .writeHead(status, { "content-type": "application/json" })
          .end(JSON.stringify(payload));
      }, delayMs);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const minimalPack = {
  tenant: { name: "Cabinet Test" },
  client: {
    firstName: "A",
    lastName: "B",
    type: "INDIVIDUAL",
    status: "ACTIVE",
    age: 40,
    email: null,
    phone: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  household: [],
  finance: null,
  health: null,
  goals: [],
  openTasks: [],
  recentTimeline: [],
  recentNotes: [],
  generatedAt: "2026-07-31T00:00:00.000Z",
} satisfies CopilotContextPack;

const openAiCompletion = (text: string) => ({
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 1,
  model: "gpt-5.6-terra",
  choices: [
    { index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" },
  ],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
});

const PRESERVED_ENV = { ...process.env };
afterEach(() => {
  process.env = { ...PRESERVED_ENV };
});

describe("CodexBridgeProvider — API locale compatible OpenAI", () => {
  it("n'est pas configuré sans LLM_BASE_URL", async () => {
    delete process.env.LLM_BASE_URL;
    const bridge = new CodexBridgeProvider();
    expect(bridge.isConfigured()).toBe(false);
    await expect(
      bridge.generate({ kind: "SUMMARY", contextPack: minimalPack }),
    ).rejects.toMatchObject({ reason: "not_configured" });
    const health = await bridge.health();
    expect(health.configured).toBe(false);
  });

  it("succès : envoie system+user au format OpenAI, lit choices[0].message.content", async () => {
    let receivedBody = "";
    const fake = await startFakeBridge((body) => {
      receivedBody = body;
      return { status: 200, payload: openAiCompletion("## Résumé\nTexte généré.") };
    });
    const bridge = new CodexBridgeProvider({
      baseUrl: fake.url,
      apiKey: "cle-locale",
      model: "gpt-5.6-terra",
    });
    const result = await bridge.generate({
      kind: "SUMMARY",
      contextPack: minimalPack,
      instructions: "Test",
    });
    await fake.close();

    expect(result.provider).toBe("codex-bridge");
    expect(result.model).toBe("gpt-5.6-terra");
    expect(result.content).toBe("## Résumé\nTexte généré.");

    const sent = JSON.parse(receivedBody);
    expect(sent.model).toBe("gpt-5.6-terra");
    expect(sent.messages).toHaveLength(2);
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[0].content).toContain("assistante");
    expect(sent.messages[1].role).toBe("user");
    expect(sent.messages[1].content).toContain("DONNÉES VÉRIFIÉES");
    expect(sent.messages[1].content).toContain("Consignes du conseiller".toUpperCase());
  });

  it("HTTP 401 → erreur http_auth (pas de fuite du corps)", async () => {
    const fake = await startFakeBridge(() => ({
      status: 401,
      payload: { error: { message: "unauthorized" } },
    }));
    const bridge = new CodexBridgeProvider({ baseUrl: fake.url });
    await expect(
      bridge.generate({ kind: "SUMMARY", contextPack: minimalPack }),
    ).rejects.toMatchObject({ reason: "http_auth" });
    await fake.close();
  });

  it("JSON illisible → invalid_response", async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" }).end("{oops");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address() as AddressInfo;
    const bridge = new CodexBridgeProvider({
      baseUrl: `http://127.0.0.1:${port}/v1`,
    });
    await expect(
      bridge.generate({ kind: "SUMMARY", contextPack: minimalPack }),
    ).rejects.toMatchObject({ reason: "invalid_response" });
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("contenu vide → invalid_response", async () => {
    const fake = await startFakeBridge(() => ({
      status: 200,
      payload: { choices: [{ message: { content: "" } }] },
    }));
    const bridge = new CodexBridgeProvider({ baseUrl: fake.url });
    await expect(
      bridge.generate({ kind: "SUMMARY", contextPack: minimalPack }),
    ).rejects.toMatchObject({ reason: "invalid_response" });
    await fake.close();
  });

  it("dépassement du délai → timeout", async () => {
    const fake = await startFakeBridge(() => ({
      status: 200,
      payload: openAiCompletion("trop tard"),
      delayMs: 300,
    }));
    const bridge = new CodexBridgeProvider({
      baseUrl: fake.url,
      timeoutMs: 100,
    });
    await expect(
      bridge.generate({ kind: "SUMMARY", contextPack: minimalPack }),
    ).rejects.toMatchObject({ reason: "timeout" });
    await fake.close();
  });

  it("health : /health hors /v1 → joignable / injoignable / HTTP", async () => {
    const fake = await startFakeBridge(() => ({ status: 200, payload: {} }));
    const ok = await new CodexBridgeProvider({ baseUrl: fake.url }).health();
    expect(ok).toMatchObject({ configured: true, reachable: true, statusCode: 200 });
    await fake.close();

    const down = await new CodexBridgeProvider({
      baseUrl: "http://127.0.0.1:1/v1",
    }).health();
    expect(down.configured).toBe(true);
    expect(down.reachable).toBe(false);
  });

  it("instances non configurées lèvent CopilotBridgeError typée", async () => {
    delete process.env.LLM_BASE_URL;
    const bridge = new CodexBridgeProvider();
    await expect(
      bridge.generate({ kind: "SUMMARY", contextPack: minimalPack }),
    ).rejects.toBeInstanceOf(CopilotBridgeError);
  });
});

describe("Resolver — secours automatique", () => {
  it("bridge configuré mais mort → composer local avec fellBack=true", async () => {
    process.env.COPILOT_PROVIDER = "codex-bridge";
    process.env.LLM_BASE_URL = "http://127.0.0.1:1/v1"; // rien n'écoute
    const result = await generateWithFallback({
      kind: "SUMMARY",
      contextPack: minimalPack,
    });
    expect(result.provider).toBe("local-composer");
    expect(result.fellBack).toBe(true);
    expect(result.attemptedProvider).toBe("codex-bridge");
    expect(result.content).toContain("Résumé du dossier");
  });

  it("bridge configuré et sain → codex-bridge, fellBack=false", async () => {
    const fake = await startFakeBridge(() => ({
      status: 200,
      payload: openAiCompletion("réponse du LLM"),
    }));
    process.env.COPILOT_PROVIDER = "codex-bridge";
    process.env.LLM_BASE_URL = fake.url;
    const result = await generateWithFallback({
      kind: "SUMMARY",
      contextPack: minimalPack,
    });
    await fake.close();
    expect(result.provider).toBe("codex-bridge");
    expect(result.fellBack).toBe(false);
    expect(result.content).toBe("réponse du LLM");
  });

  it("sans config bridge → composer direct, fellBack=false", async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.COPILOT_PROVIDER;
    const result = await generateWithFallback({
      kind: "SUGGESTIONS",
      contextPack: minimalPack,
    });
    expect(result.provider).toBe("local-composer");
    expect(result.fellBack).toBe(false);
    expect(result.structured?.suggestions.length).toBeGreaterThan(0);
  });

  it("le prompt utilisateur contient les données structurées + consignes", () => {
    const prompt = buildUserPrompt({
      kind: "MEETING_PREP",
      contextPack: minimalPack,
      instructions: "Insister sur la retraite",
    });
    expect(prompt).toContain("PRÉPARATION DE RENCONTRE");
    expect(prompt).toContain("DONNÉES VÉRIFIÉES");
    expect(prompt).toContain("Insister sur la retraite");
    expect(prompt).toContain("Cabinet Test");
  });
});
