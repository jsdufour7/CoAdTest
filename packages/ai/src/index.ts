export type {
  DataRegion,
  EmbedRequest,
  GenerateRequest,
  GenerateResponse,
  LLMGateway,
} from "./gateway";
export { llmGateway, MockLLMGateway } from "./providers/mock.provider";

// ── Advisor Intelligence (Sprint 5 — ADR-008) ──────────────────────
export {
  COPILOT_VERSION,
  CopilotBridgeError,
  type CopilotArtifactKind,
  type CopilotContextPack,
  type CopilotGenerateRequest,
  type CopilotGenerateResult,
  type CopilotHealth,
  type CopilotProvider,
  type CopilotSuggestion,
} from "./copilot/contract";
export { buildUserPrompt, COPILOT_SYSTEM_PROMPT } from "./copilot/prompt";
export { loadContextPack } from "./copilot/context-pack";
export { LocalComposerProvider } from "./copilot/providers/local-composer.provider";
export { CodexBridgeProvider } from "./copilot/providers/codex-bridge.provider";
export {
  checkBridgeHealth,
  generateWithFallback,
  getCopilotRoutingState,
  resolveCopilotProviders,
  type CopilotResolution,
} from "./copilot/resolver";
export {
  ARTIFACT_KIND_LABELS,
  generateClientReport,
  generateClientSummary,
  generateMeetingPrep,
  generateSuggestions,
  getLatestCopilotArtifact,
  listCopilotArtifacts,
  probeCopilotBridge,
  type CopilotActor,
  type RequestMeta,
} from "./copilot/service";
