/**
 * Contrat commun des fournisseurs Copilot (ADR-008).
 *
 * Chaque provider produit du texte d'ASSISTANCE (résumé, préparation,
 * suggestions, bilan) à partir d'un paquet de données structurées —
 * jamais de conseil financier automatisé (AI Strategy). Un fournisseur
 * conforme région CA peut remplacer la passerelle actuelle sans toucher
 * ce contrat ni les services du Copilot.
 */

import { DomainError } from "@coadvisor/types";

export const COPILOT_VERSION = "copilot-1.0";

export type CopilotArtifactKind =
  | "SUMMARY"
  | "MEETING_PREP"
  | "SUGGESTIONS"
  | "CLIENT_REPORT";

// ── Données structurées (assemblées côté serveur, RLS appliquée) ───
export interface CopilotContextPack {
  tenant: { name: string };
  client: {
    firstName: string;
    lastName: string;
    type: string;
    status: string;
    age: number | null;
    email: string | null;
    phone: string | null;
    createdAt: string; // ISO
  };
  household: Array<{ name: string; roleLabel: string }>;
  finance: {
    annualIncome: number;
    monthlyExpenses: number;
    monthlySavings: number;
    monthlyDebtPayments: number;
    totalAssets: number;
    totalDebts: number;
    netWorth: number;
    liquidMonths: number | null; // null si pas de dépenses connues
    savingsRate: number | null; // null si pas de revenu
    counts: {
      incomes: number;
      expenses: number;
      assets: number;
      liabilities: number;
      insurances: number;
      goals: number;
    };
    retirement: { age: number; targetAnnualIncome: number } | null;
    registeredAccountsUsage: string;
    hasWill: boolean;
    beneficiariesStatus: string;
  } | null;
  health: {
    score: number;
    engineVersion: string;
    calculatedAt: string; // ISO
    categoryScores: Record<string, number>;
    strengths: string[];
    risks: string[];
    topActions: string[];
    deltaSincePrevious: number | null;
  } | null;
  goals: Array<{
    name: string;
    targetAmount: number;
    targetDate: string | null;
    priority: string;
  }>;
  openTasks: Array<{
    title: string;
    dueDate: string | null;
    priority: string;
    overdue: boolean;
  }>;
  recentTimeline: Array<{ date: string; typeLabel: string; title: string }>;
  recentNotes: Array<{ date: string; authorName: string; excerpt: string }>;
  generatedAt: string; // ISO — injecté pour rester déterministe en test
}

export interface CopilotSuggestion {
  title: string;
  rationale: string;
  category: "TASK" | "REVIEW" | "OPPORTUNITY" | "DATA_QUALITY";
}

export interface CopilotGenerateRequest {
  kind: CopilotArtifactKind;
  contextPack: CopilotContextPack;
  /** Consignes additionnelles du conseiller (optionnel). */
  instructions?: string;
}

export interface CopilotGenerateResult {
  /** Texte Markdown prêt à afficher. */
  content: string;
  /** Charge structurée (suggestions actionnables) si applicable. */
  structured?: { suggestions: CopilotSuggestion[] };
  provider: string;
  model: string;
  /** true = passerelle configurée mais indisponible → secours local. */
  fellBack: boolean;
  /** Provider tenté avant le secours (diagnostic UI). */
  attemptedProvider?: string;
  latencyMs: number;
}

export interface CopilotHealth {
  configured: boolean;
  reachable: boolean;
  statusCode?: number;
  latencyMs: number;
  detail?: string;
}

/** Contrat que tout provider Copilot (présent ou futur région CA) signe. */
export interface CopilotProvider {
  readonly id: string; // "codex-bridge" | "local-composer" | …
  readonly label: string;
  isConfigured(): boolean;
  generate(request: CopilotGenerateRequest): Promise<Omit<CopilotGenerateResult, "fellBack">>;
  health?(): Promise<CopilotHealth>;
}

// ── Erreurs ────────────────────────────────────────────────────────
export type CopilotBridgeFailure =
  | "not_configured"
  | "network"
  | "timeout"
  | "http"
  | "http_auth"
  | "invalid_response";

/** Erreur de provider externe — déclenche le secours local (fallback). */
export class CopilotBridgeError extends DomainError {
  readonly reason: CopilotBridgeFailure;
  constructor(reason: CopilotBridgeFailure, message: string) {
    super(message, `COPILOT_BRIDGE_${reason.toUpperCase()}`);
    this.name = "CopilotBridgeError";
    this.reason = reason;
  }
}
