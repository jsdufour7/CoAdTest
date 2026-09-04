/**
 * LLM Gateway — point d'entrée UNIQUE de toute capacité IA dans CoAdvisor.
 *
 * Principes non négociables (AI Strategy / Playbook §9) :
 *  - IA ASSISTIVE : expliquer, résumer, suggérer, organiser.
 *    Jamais de conseil financier réglementé, jamais d'action autonome.
 *  - Résidence des données : `region: "ca"` impose un provider/région
 *    canadien (Loi 25). Le routing sera appliqué ici dès le premier
 *    provider réel (Sprint 4-5) ; le mock actuel n'envoie rien à l'externe.
 *  - Aucun module métier n'appelle un SDK LLM directement : tout passe
 *    par cette interface (traçabilité, quotas, audit futur).
 */

export type DataRegion = "ca" | "global";

export interface GenerateRequest {
  /** Objectif métier — journalisé (traçabilité des usages IA). */
  purpose: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  /** Défaut : "ca" — les données clients ne quittent pas le Canada. */
  region?: DataRegion;
}

export interface GenerateResponse {
  text: string;
  model: string;
  provider: string;
}

export interface EmbedRequest {
  texts: string[];
  purpose: string;
  region?: DataRegion;
}

export interface LLMGateway {
  readonly provider: string;
  generate(request: GenerateRequest): Promise<GenerateResponse>;
  embed?(request: EmbedRequest): Promise<number[][]>;
}
