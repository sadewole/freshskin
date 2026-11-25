import type { RoutineStep } from './types.js';

/**
 * Curated routine selection. Modelled on rec/pairing.ts: a pure function over curated rows,
 * deterministic by construction (stable slug order, no random, no model calls).
 *
 * Today there is exactly one template and every audience is empty, so every profile resolves
 * to body-basic. Personalization later is a new data row with a non-empty audience, not a
 * new branch — the matcher below already prefers audience hits.
 */

export interface RoutineProfile {
  readonly hasSkinBasics: boolean;
  readonly ownedCreamCount: number;
}

export interface TemplateCandidate {
  readonly slug: string;
  readonly title: string;
  readonly contentVersion: string;
  /** Empty audience matches every profile. */
  readonly audience: readonly string[];
  readonly steps: readonly RoutineStep[];
}

export interface TipCandidate {
  readonly id: string;
  readonly topic: string;
  readonly body: string;
  readonly why: string;
  readonly inputs: readonly string[];
  readonly position: number;
}

/** Personalization trigger (decision 0004): skin basics plus at least one owned cream. */
export function personalizationReady(profile: RoutineProfile): boolean {
  return profile.hasSkinBasics && profile.ownedCreamCount > 0;
}

function matchesAudience(candidate: TemplateCandidate, profile: RoutineProfile): boolean {
  if (candidate.audience.length === 0) return true;
  return personalizationReady(profile) && candidate.audience.includes('personalised');
}

export function scoreTemplate(candidate: TemplateCandidate, profile: RoutineProfile): number {
  // A constant for matches, zero otherwise: ranking would imply a match we did not make.
  return matchesAudience(candidate, profile) ? 1 : 0;
}

/** The routine for this profile, or null when no curated template matches. */
export function selectRoutine(
  profile: RoutineProfile,
  candidates: readonly TemplateCandidate[],
): TemplateCandidate | null {
  const eligible = candidates.filter((candidate) => scoreTemplate(candidate, profile) > 0);
  eligible.sort((a, b) => a.slug.localeCompare(b.slug));
  return eligible[0] ?? null;
}

/** Reviewed tips in deterministic display order. */
export function bestTips(tips: readonly TipCandidate[], limit = 3): TipCandidate[] {
  return [...tips]
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
    .slice(0, limit);
}
