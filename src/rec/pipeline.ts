import { createHash } from 'node:crypto';
import type { Sensitivity } from '../safety/conflicts.js';
import { diversify, CREAM_DIVERSITY, PERFUME_DIVERSITY } from './diversity.js';
import { toExplained } from './explain.js';
import { EXCLUSION_RULES, FILTER_RULES, type ExclusionContext } from './rules.js';
import { assertWeightsNormalised, scoreTerms, TERMS_BY_KIND, type TermId } from './terms.js';
import type {
  At,
  Candidate,
  Constrained,
  ConstrainedData,
  Eligible,
  EligibleData,
  ExplainedItem,
  Plan,
  PlanData,
  Rejection,
  RecommendationRequest,
  Scored,
  ScoredData,
  ScoredItem,
  ViewerFacts,
} from './types.js';

/**
 * Four stages, composed only here. The stage functions are not exported: a caller that could
 * run scoring without eligibility would be one line away from skipping the safety rules.
 */

const seal = <S extends string, T extends object>(_stage: S, value: T): At<S, T> =>
  value as At<S, T>;

export function algorithmVersion(): string {
  const ids = TERMS_BY_KIND.cream.map((t) => `${t.id}:${t.weight}`).join('|');
  const rules = [...EXCLUSION_RULES.map((r) => r.id), ...FILTER_RULES.map((r) => r.id)].join('|');
  return createHash('sha256').update(`${ids}::${rules}`).digest('hex').slice(0, 12);
}

/** Deterministic from the entire pipeline input, so a repeat request is a replay. */
export function sessionId(
  viewer: ViewerFacts,
  request: RecommendationRequest,
  profileVersion: string,
  day: string,
): string {
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        user: viewer.userId,
        kind: request.kind,
        narrowing: request.narrowing,
        profileVersion,
        algorithm: algorithmVersion(),
        day,
      }),
    )
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

interface PipelineInput {
  readonly viewer: ViewerFacts;
  readonly sensitivities: readonly Sensitivity[];
  readonly candidates: readonly Candidate[];
  readonly request: RecommendationRequest;
  readonly profileVersion: string;
  readonly capped: boolean;
  readonly day: string;
}

function eligibility(input: PipelineInput): Eligible {
  const ctx: ExclusionContext = {
    viewer: input.viewer,
    sensitivities: input.sensitivities,
    fragrance: input.viewer.fragrance,
  };
  const rejected: Rejection[] = [];
  const kept: Candidate[] = [];

  for (const candidate of input.candidates) {
    let rejection: Rejection | null = null;
    for (const rule of EXCLUSION_RULES) {
      rejection = rule.evaluate(candidate, ctx);
      if (rejection !== null) break;
    }
    if (rejection === null) {
      for (const rule of FILTER_RULES) {
        rejection = rule.evaluate(candidate, input.request.narrowing);
        if (rejection !== null) break;
      }
    }
    if (rejection === null) kept.push(candidate);
    else rejected.push(rejection);
  }

  const data: EligibleData = { candidates: kept, rejected, capped: input.capped };
  return seal('eligible', data);
}

function scoring(eligible: Eligible, viewer: ViewerFacts, kind: 'cream' | 'perfume'): Scored {
  const terms = TERMS_BY_KIND[kind];
  assertWeightsNormalised(terms);

  const ranked: ScoredItem[] = eligible.candidates
    .map((candidate) => {
      const { value, terms: scores } = scoreTerms(terms, candidate, viewer);
      return { ...candidate, terms: scores, value };
    })
    .sort((a, b) => b.value - a.value || a.product.id.localeCompare(b.product.id));

  const data: ScoredData = { ranked };
  return seal('scored', data);
}

function constrain(
  scored: Scored,
  request: RecommendationRequest,
  kind: 'cream' | 'perfume',
): Constrained {
  const rules = kind === 'perfume' ? PERFUME_DIVERSITY : CREAM_DIVERSITY;
  const { page, overflow } = diversify(scored.ranked, rules, request.limit);
  const data: ConstrainedData = { page, overflow, relaxed: page.length < request.limit };
  return seal('constrained', data);
}

function explain(
  constrained: Constrained,
  eligible: Eligible,
  input: PipelineInput,
): Plan {
  const items: readonly ExplainedItem[] = toExplained(constrained.page, input.viewer, () => []);

  const data: PlanData = {
    items,
    rejected: eligible.rejected,
    meta: {
      kind: input.request.kind === 'perfume' ? 'perfume' : 'cream',
      sessionId: sessionId(input.viewer, input.request, input.profileVersion, input.day),
      algorithmVersion: algorithmVersion(),
      profileVersion: input.profileVersion,
      totalMatched: eligible.candidates.length,
      narrowing: input.request.narrowing,
    },
  };

  return seal('explained', data);
}

export function recommend(input: PipelineInput): Plan {
  const kind = input.request.kind === 'perfume' ? 'perfume' : 'cream';
  const eligible = eligibility(input);
  const scored = scoring(eligible, input.viewer, kind);
  const constrained = constrain(scored, input.request, kind);
  return explain(constrained, eligible, input);
}

export type { TermId };
