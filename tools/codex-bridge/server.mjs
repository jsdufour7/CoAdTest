#!/usr/bin/env node
/**
 * codex-bridge — passerelle locale compatible OpenAI pour CoAdvisor.
 *
 *   CoAdvisor (backend) → http://127.0.0.1:8787/v1/chat/completions
 *     → codex CLI (authentifié via `codex login`, ChatGPT Plus)
 *     → réponse renvoyée au format OpenAI chat.completion
 *
 * ZÉRO dépendance npm : Node 18+ suffit.
 *
 * Lancement :
 *   node tools/codex-bridge/server.mjs
 *   # PowerShell :
 *   $env:BRIDGE_API_KEY="coadvisor-demo-secret"; node tools/codex-bridge/server.mjs
 *
 * Variables :
 *   BRIDGE_PORT         (défaut 8787)
 *   BRIDGE_HOST         (défaut 127.0.0.1 — écoute locale seulement)
 *   BRIDGE_API_KEY      (défaut "coadvisor-demo-secret" — DEV seulement)
 *   CODEX_BIN           (défaut "codex" — chemin de l'exécutable CLI)
 *   CODEX_TIMEOUT_MS    (défaut 120000)
 */
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const HOST = process.env.BRIDGE_HOST ?? "127.0.0.1";
const API_KEY = process.env.BRIDGE_API_KEY ?? "coadvisor-demo-secret";
const CODEX_BIN = process.env.CODEX_BIN ?? "codex";
const CODEX_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS ?? 120000);

const VERSION = "codex-bridge/1.0.0";

// ── Helpers HTTP ───────────────────────────────────────────────────
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function openAiError(res, status, message, type = "server_error", code = null) {
  sendJson(res, status, { error: { message, type, code } });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Corps de requête trop volumineux (1 Mo max)."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ── Exécution Codex ────────────────────────────────────────────────
function runCodex(prompt) {
  return new Promise((resolve, reject) => {
    const args = ["exec", "--skip-git-repo-check", "--json", prompt];
    let child;
    try {
      child = spawn(CODEX_BIN, args, { shell: false });
    } catch (error) {
      reject(new Error(`Impossible de lancer « ${CODEX_BIN} » : ${error.message}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGKILL");
        reject(
          new Error(
            `codex exec n'a pas répondu en ${CODEX_TIMEOUT_MS} ms (timeout).`,
          ),
        );
      }
    }, CODEX_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            `codex CLI introuvable ou non exécutable (« ${CODEX_BIN} ») : ${error.message}. ` +
              "Installez-le et authentifiez-vous avec `codex login`.",
          ),
        );
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(
            new Error(
              `codex exec a échoué (code ${code}) : ${stderr.slice(0, 500)}`,
            ),
          );
        }
      }
    });
  });
}

/** Sortie JSON Lines de codex --json : conserve les textes agent_message. */
function parseAgentMessages(jsonl) {
  const texts = [];
  for (const rawLine of jsonl.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || !line.startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      if (
        event?.type === "item.completed" &&
        event?.item?.type === "agent_message" &&
        typeof event.item.text === "string" &&
        event.item.text.trim() !== ""
      ) {
        texts.push(event.item.text.trim());
      }
    } catch {
      // ligne non JSON (log divers) — ignorée par conception
    }
  }
  return texts;
}

// ── Serveur ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  // Santé — sans authentification (sonde locale).
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      status: "ok",
      bridge: VERSION,
      codexBin: CODEX_BIN,
      timeoutMs: CODEX_TIMEOUT_MS,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
    // Authentification Bearer (clé locale — jamais exposée au navigateur).
    const auth = req.headers.authorization ?? "";
    if (API_KEY && auth !== `Bearer ${API_KEY}`) {
      openAiError(res, 401, "Non autorisé — Bearer token invalide.", "authentication_error", "invalid_api_key");
      return;
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      openAiError(res, 400, "Corps JSON invalide.", "invalid_request_error");
      return;
    }

    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages || messages.length === 0) {
      openAiError(res, 400, "Le champ « messages » (liste OpenAI) est requis.", "invalid_request_error");
      return;
    }

    const model = typeof body.model === "string" && body.model !== "" ? body.model : "codex";

    // Aplati system + messages en un seul prompt pour `codex exec`.
    const prompt = messages
      .map((m) => {
        const role = m?.role ?? "user";
        const content = typeof m?.content === "string" ? m.content : "";
        return role === "system"
          ? `[INSTRUCTIONS SYSTÈME]\n${content}`
          : `[${role.toUpperCase()}]\n${content}`;
      })
      .join("\n\n");

    let output;
    try {
      output = await runCodex(prompt);
    } catch (error) {
      const isTimeout = error.message.includes("timeout");
      openAiError(
        res,
        isTimeout ? 504 : 502,
        `Passerelle codex : ${error.message}`,
        isTimeout ? "timeout_error" : "upstream_error",
      );
      return;
    }

    const texts = parseAgentMessages(output);
    if (texts.length === 0) {
      openAiError(
        res,
        502,
        "codex a répondu sans message agent exploitable (item.completed/agent_message absent).",
        "empty_completion",
      );
      return;
    }

    sendJson(res, 200, {
      id: `chatcmpl-codex-${Date.now().toString(36)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: texts.join("\n\n") },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
    return;
  }

  openAiError(res, 404, `Route inconnue : ${req.method} ${url.pathname}`, "invalid_request_error");
});

server.listen(PORT, HOST, () => {
  console.log(`✔ ${VERSION} — écoute sur http://${HOST}:${PORT}`);
  console.log(`  Chat completions : POST http://${HOST}:${PORT}/v1/chat/completions`);
  console.log(`  Santé            : GET  http://${HOST}:${PORT}/health`);
  console.log(`  Binaire codex    : ${CODEX_BIN} (timeout ${CODEX_TIMEOUT_MS} ms)`);
});
