import type { Candidate, RecKind, Richness, Unit, ViewerFacts, ProductKind } from './types.js';

/**
 * The registry IS the formula. Adding a term is one element; `TermId` widens by itself, so the
 * breakdown type, the stored jsonb, and the wire field follow without a caller edit.
 */
export interface ScoreTerm {
  readonly id: string;
  readonly weight: number;
  readonly appliesTo: readonly RecKind[];
  readonly compute: (c: Candidate, v: ViewerFacts) => Unit;
}

const clamp01 = (n: number): Unit => (n < 0 ? 0 : n > 1 ? 1 : n);

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

const climateFit = (c: Candidate, v: ViewerFacts): number => {
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
  const budget = v.budgetMaxNgn;
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
    compute: (c) => clamp01(1 - Math.max(c.product.facts.irritancyAvg, c.product.facts.comedogenicMax / 5)),
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
    compute: climateFit,
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
    appliesTo: ['cream', 'perfume'],
    compute: (_c, v) => clamp01(v.feedbackAffinity),
  },
] as const satisfies readonly ScoreTerm[];

export type TermId = (typeof CREAM_TERMS)[number]['id'];
export type TermScores = { readonly [K in TermId]: Unit };

const ALL_TERMS: readonly ScoreTerm[] = CREAM_TERMS;

export const TERMS_BY_KIND: Readonly<Record<ProductKind, readonly ScoreTerm[]>> = {
  cream: ALL_TERMS.filter((t) => t.appliesTo.includes('cream')),
  perfume: ALL_TERMS.filter((t) => t.appliesTo.includes('perfume')),
};

/** Weights must sum to 1 per kind or the display score is not on the scale it claims. */
export function assertWeightsNormalised(terms: readonly ScoreTerm[]): void {
  const total = terms.reduce((sum, term) => sum + Math.abs(term.weight), 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`term weights sum to ${total}, expected 1`);
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
    const raw = term.compute(candidate, viewer);
    const clamped = clamp01(raw);
    scores[term.id] = clamped;
    value += clamped * term.weight;
  }
  return { value: clamp01(value), terms: scores as TermScores };
}
