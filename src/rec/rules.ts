import { assessContact, worstSeverity, type Sensitivity } from '../safety/conflicts.js';
import type { Candidate, Narrowing, Rejection, ViewerFacts } from './types.js';

/**
 * Two registries, on purpose.
 *
 * EXCLUSION_RULES decide safety and availability. Their input type does not carry the request
 * at all, so no caller-supplied value can reach a hard exclusion.
 *
 * FILTER_RULES apply the user's own narrowing. They cannot make a product appear; they only
 * subtract. Keeping them separate is what lets us say "no caller input can widen the set" and
 * mean it structurally.
 */
export interface ExclusionContext {
  readonly viewer: ViewerFacts;
  readonly sensitivities: readonly Sensitivity[];
}

export interface ExclusionRule {
  readonly id: string;
  readonly order: number;
  readonly evaluate: (c: Candidate, ctx: ExclusionContext) => Rejection | null;
}

export interface FilterRule {
  readonly id: string;
  readonly order: number;
  readonly evaluate: (c: Candidate, narrowing: Narrowing) => Rejection | null;
}

export const EXCLUSION_RULES: readonly ExclusionRule[] = [
  {
    id: 'severe_sensitivity',
    order: 10,
    evaluate: (c, ctx) => {
      const collisions = assessContact(ctx.sensitivities, c.surface, c.product.category);
      if (worstSeverity(collisions) !== 'severe') return null;
      const hit = collisions.find((collision) => collision.severity === 'severe');
      return {
        productId: c.product.id,
        productName: c.product.name,
        code: 'sensitivity_severe',
        reason:
          hit === undefined
            ? 'Contains an ingredient you asked us to avoid.'
            : `Contains ${hit.hit.inciName}, which you asked us to avoid.`,
      };
    },
  },
  {
    id: 'out_of_stock',
    order: 20,
    evaluate: (c) => {
      // Unconditional for recommendations: recommending what cannot be bought is worse than
      // lost recall. Browse still shows it.
      if (c.product.availability !== 'out_of_stock' && c.product.availability !== 'unknown') {
        return null;
      }
      return {
        productId: c.product.id,
        productName: c.product.name,
        code: 'out_of_stock',
        reason: 'Not available right now.',
      };
    },
  },
];

export const FILTER_RULES: readonly FilterRule[] = [
  {
    id: 'over_budget',
    order: 10,
    evaluate: (c, narrowing) => {
      const price = c.product.priceNgn;
      if (narrowing.maxPriceNgn === undefined || price === null) return null;
      if (price <= narrowing.maxPriceNgn) return null;
      return {
        productId: c.product.id,
        productName: c.product.name,
        code: 'over_budget',
        reason: `Costs above your ${narrowing.maxPriceNgn.toLocaleString('en-NG')} naira limit.`,
      };
    },
  },
  {
    id: 'fragrance_free_required',
    order: 20,
    evaluate: (c, narrowing) => {
      if (narrowing.fragranceFree !== true) return null;
      if (c.product.fragranceFree === true) return null;
      return {
        productId: c.product.id,
        productName: c.product.name,
        code: 'fragrance_free_required',
        reason: 'Contains fragrance, and you asked for fragrance-free.',
      };
    },
  },
];
