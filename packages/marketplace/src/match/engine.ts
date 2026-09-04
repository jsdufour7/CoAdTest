import type { Dimension } from "@coadvisor/fnae";

import {
  dimensionToSpecialty,
  SPECIALTY_LABELS,
} from "./specialties";
import type { MarketplaceSpecialty } from "./specialties";

/**
 * Moteur de matching mktmatch-1.0 — 100 % déterministe, fonction pure.
 * Même entrée ⇒ même sortie (testé). Aucun LLM : chaque suggestion
 * affiche SES RAISONS (« recommandé parce que… »), conformément à la
 * ligne rouge « assistance explicable » de la stratégie IA.
 */
export const MATCH_ENGINE_VERSION = "mktmatch-1.0";

/**
 * Pondération v1 (somme = 100) :
 * - priorités FNAE croisées avec les spécialités : 40 / 25 / 15
 *   (le rang de la priorité module le poids) ;
 * - région commune : 12 ;
 * - langue parlée : 8.
 */
export const MATCH_WEIGHTS = {
  priorities: [40, 25, 15] as const,
  region: 12,
  language: 8,
} as const;

/** Vue d'un profil telle qu'utilisée par le moteur (déjà dépersonnalisée). */
export interface MatchCandidate {
  profileId: string;
  specialties: MarketplaceSpecialty[];
  regions: string[];
  languages: string[];
  yearsExperience: number | null;
}

export interface MatchCriteria {
  /** 3 priorités du portrait FNAE, ordre décroissant d'importance. */
  priorities: Dimension[];
  region?: string;
  language?: string;
}

export interface MatchResult {
  profileId: string;
  /** Score transparent 0-100 (détail des points dans `reasons`). */
  score: number;
  reasons: string[];
  engineVersion: typeof MATCH_ENGINE_VERSION;
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Classe les candidats par adéquation ; retourne les `limit` meilleurs. */
export function matchAdvisors(
  candidates: MatchCandidate[],
  criteria: MatchCriteria,
  limit = 3,
): MatchResult[] {
  const regionWanted = criteria.region?.trim() ? normalize(criteria.region) : null;
  const languageWanted = criteria.language?.trim() ?? null;

  const scored: MatchResult[] = candidates
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];

      criteria.priorities.slice(0, 3).forEach((dimension, index) => {
        const specialty = dimensionToSpecialty(dimension);
        if (candidate.specialties.includes(specialty)) {
          const points: number =
            MATCH_WEIGHTS.priorities[Math.min(index, 2)] ?? 0;
          score += points;
          reasons.push(
            `${SPECIALTY_LABELS[specialty]} — votre priorité n° ${index + 1} (+${points})`,
          );
        }
      });

      if (
        regionWanted !== null &&
        candidate.regions.some((region) => normalize(region) === regionWanted)
      ) {
        score += MATCH_WEIGHTS.region;
        reasons.push(
          `Même région (+${MATCH_WEIGHTS.region})`,
        );
      }

      if (
        languageWanted !== null &&
        candidate.languages.includes(languageWanted)
      ) {
        score += MATCH_WEIGHTS.language;
        reasons.push(
          `Langue parlée (+${MATCH_WEIGHTS.language})`,
        );
      }

      return {
        profileId: candidate.profileId,
        score,
        reasons,
        engineVersion: MATCH_ENGINE_VERSION as typeof MATCH_ENGINE_VERSION,
      };
    })
    .filter((result) => result.score > 0);

  // Tri déterministe : score ↓, expérience ↓, identifiant ↑ (stabilité
  // inter-exécutions, reproductibilité des tests et de l'affichage).
  const experienceById = new Map(
    candidates.map((c) => [c.profileId, c.yearsExperience ?? 0] as const),
  );
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const delta =
      (experienceById.get(b.profileId) ?? 0) -
      (experienceById.get(a.profileId) ?? 0);
    if (delta !== 0) return delta;
    return a.profileId < b.profileId ? -1 : 1;
  });

  return scored.slice(0, limit);
}

/** Filtres d'annuaire (recherche classique) — pur, testé, insensible à la casse. */
export interface DirectoryFilters {
  query?: string;
  specialty?: MarketplaceSpecialty;
  region?: string;
  language?: string;
}

export interface FilterableProfile extends MatchCandidate {
  displayName: string;
  firmName: string;
  headline: string | null;
  bio: string | null;
}

/** Générique : conserve le type concret d'entrée (cartes publiques complètes). */
export function filterProfiles<T extends FilterableProfile>(
  profiles: T[],
  filters: DirectoryFilters,
): T[] {
  const query = filters.query?.trim() ? normalize(filters.query) : null;
  const region = filters.region?.trim() ? normalize(filters.region) : null;

  return profiles.filter((profile) => {
    if (
      query !== null &&
      ![
        profile.displayName,
        profile.firmName,
        profile.headline ?? "",
        profile.bio ?? "",
        profile.regions.join(" "),
      ]
        .map(normalize)
        .some((field) => field.includes(query))
    ) {
      return false;
    }
    if (
      filters.specialty !== undefined &&
      !profile.specialties.includes(filters.specialty)
    ) {
      return false;
    }
    if (
      region !== null &&
      !profile.regions.some((r) => normalize(r).includes(region))
    ) {
      return false;
    }
    if (
      filters.language !== undefined &&
      filters.language !== "" &&
      !profile.languages.includes(filters.language)
    ) {
      return false;
    }
    return true;
  });
}
