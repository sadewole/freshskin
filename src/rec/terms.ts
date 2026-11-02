import type {
  Candidate,
  FragrancePreferences,
  PerfumeFacts,
  ProductKind,
  RecKind,
  Richness,
  StrengthPreference,
  Unit,
  ViewerFacts,
} from './types.js';

/**
 * The registries ARE the formulas. Adding a term is one element; `TermId` widens by itself.
 *
 * Negative weights are penalties, not scoring terms. `assertWeightsNormalised` requires the
 * positive weights to sum to 1 and bounds the penalty total, so a display score stays on the
 * 0-100 scale it claims.
 */
export interface ScoreTerm {
  readonly id: string;
  readonly weight: number;
  readonly appliesTo: readonly RecKind[];
  readonly compute: (c: Candidate, v: ViewerFacts) => Unit;
}

const clamp01 = (n: number): Unit => (n < 0 ? 0 : n > 1 ? 1 : n);

// ---------------------------------------------------------------------------
// Cream terms
// ---------------------------------------------------------------------------

const richnessFit = (richness: Richness | null, skinType: ViewerFacts['skinType']): number => {
  if (richness === null) return 0.5;
  const table: Record<ViewerFacts['skinType'], Record<Richness, number>> = {
    dry: { light: 0.3, medium: 0.8, rich: 1 },
    oily: { light: 1, medium: 0.7, rich: 0.2 },
    combination: { light: 0.8, medium: 1, rich: 0.5 },
    normal: { light: 0.9, medium: 1, rich: 0.7 },
    unsure: { light: 0.6, medium: 0.6, rich: 0.6 },
  };
  return table[skinType][richness];
};

const creamClimateFit = (c: Candidate, v: ViewerFacts): number => {
  const occlusive = c.product.facts.occlusiveRatio;
  switch (v.climateZone) {
    case 'hot_humid':
      return clamp01(1 - occlusive * 0.6);
    case 'hot_dry':
      return clamp01(0.4 + occlusive * 0.6);
    case 'temperate':
      return clamp01(0.7);
    case 'cold':
      return clamp01(0.5 + occlusive * 0.5);
  }
};

const budgetFit = (c: Candidate, v: ViewerFacts): number => {
  const price = c.product.priceNgn;
  const budget = v.budgetMaxNgn ?? v.fragrance?.budgetMaxNgn ?? null;
  if (price === null) return 0.5;
  if (budget === null || budget <= 0) return 0.7;
  if (price <= budget * 0.8) return 1;
  if (price > budget) return 0;
  return clamp01((budget - price) / (budget * 0.2));
};

export const CREAM_TERMS = [
  {
    id: 'skin_type_fit',
    weight: 0.3,
    appliesTo: ['cream'],
    compute: (c, v) => richnessFit(c.product.richness, v.skinType),
  },
  {
    id: 'ingredient_safety',
    weight: 0.2,
    appliesTo: ['cream'],
    compute: (c) =>
      clamp01(1 - Math.max(c.product.facts.irritancyAvg, c.product.facts.comedogenicMax / 5)),
  },
  {
    id: 'concern_efficacy',
    weight: 0.15,
    appliesTo: ['cream'],
    compute: (c) => clamp01(c.product.facts.beneficialCount / 4),
  },
  {
    id: 'climate_fit',
    weight: 0.15,
    appliesTo: ['cream'],
    compute: creamClimateFit,
  },
  {
    id: 'budget_fit',
    weight: 0.1,
    appliesTo: ['cream'],
    compute: budgetFit,
  },
  {
    id: 'feedback_affinity',
    weight: 0.1,
    appliesTo: ['cream'],
    compute: (_c, v) => clamp01(v.feedbackAffinity),
  },
] as const satisfies readonly ScoreTerm[];

// ---------------------------------------------------------------------------
// Perfume terms (§14.3)
// ---------------------------------------------------------------------------

const TARGET_LONGEVITY: Record<StrengthPreference, number> = {
  light: 2,
  moderate: 3,
  strong: 4,
  very_strong: 5,
};

const perfume = (c: Candidate): PerfumeFacts | null => c.product.perfume;

/**
 * Cosine-style affinity between the stated families and the product's. With no quiz, this is
 * neutral rather than zero: an unbuilt profile must not read as dislike.
 */
export function familyAffinity(facts: PerfumeFacts | null, prefs: FragrancePreferences | null): number {
  if (facts === null) return 0;
  if (prefs === null) return 0.5;

  const disliked = prefs.familiesDisliked.filter((family) => facts.familyNames.includes(family)).length;

  // A profile with dislikes but no likes is still a profile: a disliked match scores zero
  // rather than falling back to the neutral prior.
  if (prefs.familiesLiked.length === 0) return disliked > 0 ? 0 : 0.5;

  const liked = prefs.familiesLiked.filter((family) => facts.familyNames.includes(family)).length;
  const likedScore = liked / prefs.familiesLiked.length;
  return clamp01(likedScore - (disliked > 0 ? 0.5 : 0));
}

/** Loved notes count for more when they sit in the heart or base, which last on skin. */
export function noteOverlap(facts: PerfumeFacts | null, prefs: FragrancePreferences | null): number {
  if (facts === null || prefs === null || prefs.notesLoved.length === 0) return 0.5;
  const weightOf = (note: string): number =>
    facts.heartAndBaseNotes.includes(note) ? 1.3 : facts.noteNames.includes(note) ? 1 : 0;

  const total = prefs.notesLoved.reduce((sum, note) => sum + weightOf(note), 0);
  return clamp01(total / (prefs.notesLoved.length * 1.3));
}

export function performanceFit(facts: PerfumeFacts | null, prefs: FragrancePreferences | null): number {
  if (facts === null) return 0.5;
  const target = TARGET_LONGEVITY[prefs?.strength ?? 'moderate'];
  return clamp01(1 - Math.abs(facts.longevity - target) / 4);
}

export function occasionFit(facts: PerfumeFacts | null, prefs: FragrancePreferences | null): number {
  if (facts === null) return 0.5;
  const wanted = prefs?.occasions ?? [];
  if (wanted.length === 0 || facts.occasions.length === 0) return 0.5;
  const shared = wanted.filter((occasion) => facts.occasions.includes(occasion)).length;
  return clamp01(shared / Math.max(wanted.length, facts.occasions.length));
}

/** Heat and humidity flatten heavy notes; a fragrance chosen for Lagos should not be an oud bomb. */
export function perfumeClimateFit(facts: PerfumeFacts | null, v: ViewerFacts): number {
  if (facts === null) return 0.5;
  const families = facts.familyNames.map((name) => name.toLowerCase());
  const fresh = families.some((name) => name.includes('citrus') || name.includes('fresh') || name.includes('aromatic'));
  const heavy = families.some((name) => name.includes('gourmand') || name.includes('oriental') || name.includes('oud'));

  switch (v.climateZone) {
    case 'hot_humid':
      return clamp01(0.6 + (fresh ? 0.2 : 0) - (heavy ? 0.2 : 0));
    case 'hot_dry':
      return clamp01(0.6 + (heavy ? 0.1 : 0));
    case 'cold':
      return clamp01(0.6 + (heavy ? 0.2 : 0) - (fresh ? 0.1 : 0));
    case 'temperate':
      return 0.6;
  }
}

/**
 * Novelty is about what the user already owns, not what they dislike: a perfume made entirely
 * of notes they own is not novel, however well it scores on taste.
 */
export function novelty(
  facts: PerfumeFacts | null,
  prefs: FragrancePreferences | null,
  ownedNotes: readonly string[] = [],
): number {
  if (facts === null) return 0.7;
  if (ownedNotes.length === 0 || facts.noteNames.length === 0) return 0.7;

  const shared = facts.noteNames.filter((note) => ownedNotes.includes(note)).length;
  return clamp01(1 - shared / facts.noteNames.length);
}

export function dislikedPenalty(facts: PerfumeFacts | null, prefs: FragrancePreferences | null): number {
  if (facts === null || prefs === null) return 0;
  return facts.noteNames.some((note) => prefs.notesAvoided.includes(note)) ? 1 : 0;
}

export const PERFUME_TERMS = [
  {
    id: 'family_affinity',
    weight: 0.28,
    appliesTo: ['perfume'],
    compute: (c, v) => familyAffinity(perfume(c), v.fragrance),
  },
  {
    id: 'note_overlap',
    weight: 0.22,
    appliesTo: ['perfume'],
    compute: (c, v) => noteOverlap(perfume(c), v.fragrance),
  },
  {
    id: 'performance_fit',
    weight: 0.14,
    appliesTo: ['perfume'],
    compute: (c, v) => performanceFit(perfume(c), v.fragrance),
  },
  {
    id: 'occasion_fit',
    weight: 0.12,
    appliesTo: ['perfume'],
    compute: (c, v) => occasionFit(perfume(c), v.fragrance),
  },
  {
    id: 'climate_fit',
    weight: 0.1,
    appliesTo: ['perfume'],
    compute: (c, v) => perfumeClimateFit(perfume(c), v),
  },
  {
    id: 'budget_fit',
    weight: 0.08,
    appliesTo: ['perfume'],
    compute: budgetFit,
  },
  {
    id: 'novelty',
    weight: 0.06,
    appliesTo: ['perfume'],
    compute: (c, v) => novelty(perfume(c), v.fragrance, v.ownedNotes),
  },
  {
    id: 'disliked_penalty',
    weight: -0.25,
    appliesTo: ['perfume'],
    compute: (c, v) => dislikedPenalty(perfume(c), v.fragrance),
  },
] as const satisfies readonly ScoreTerm[];

export type TermId = (typeof CREAM_TERMS)[number]['id'] | (typeof PERFUME_TERMS)[number]['id'];
/** Partial because each kind implements its own subset. The registry is the source of truth. */
export type TermScores = { readonly [K in TermId]?: Unit };

const ALL_TERMS: readonly ScoreTerm[] = [...CREAM_TERMS, ...PERFUME_TERMS];

export const TERMS_BY_KIND: Readonly<Record<ProductKind, readonly ScoreTerm[]>> = {
  cream: ALL_TERMS.filter((t) => t.appliesTo.includes('cream')),
  perfume: ALL_TERMS.filter((t) => t.appliesTo.includes('perfume')),
};

const PENALTY_BUDGET = 0.3;

/** Positive weights must sum to 1, and penalties must stay bounded. */
export function assertWeightsNormalised(terms: readonly ScoreTerm[]): void {
  const positive = terms.filter((term) => term.weight >= 0).reduce((sum, term) => sum + term.weight, 0);
  const penalty = terms.filter((term) => term.weight < 0).reduce((sum, term) => sum + Math.abs(term.weight), 0);

  if (Math.abs(positive - 1) > 1e-9) {
    throw new Error(`term weights sum to ${positive}, expected 1`);
  }
  if (penalty > PENALTY_BUDGET + 1e-9) {
    throw new Error(`penalty total ${penalty} exceeds the ${PENALTY_BUDGET} budget`);
  }
}

export function scoreTerms(
  terms: readonly ScoreTerm[],
  candidate: Candidate,
  viewer: ViewerFacts,
): { value: Unit; terms: TermScores } {
  const scores: Record<string, number> = {};
  let value = 0;
  for (const term of terms) {
    const clamped = clamp01(term.compute(candidate, viewer));
    scores[term.id] = clamped;
    value += clamped * term.weight;
  }
  return { value: clamp01(value), terms: scores as TermScores };
}
