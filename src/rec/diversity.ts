import type { ScoredItem } from './types.js';

/**
 * Diversity is a demotion pass, not a filter: conflicting items move to `overflow` so they can
 * still fill the page when nothing else is eligible. A hard filter here would silently shrink
 * results for a user whose taste is concentrated in one brand.
 */
export interface DiversityRules {
  readonly maxPerBrand: number;
  readonly window: number;
}

export const CREAM_DIVERSITY: DiversityRules = { maxPerBrand: 2, window: 10 };

export interface DiversityResult {
  readonly page: readonly ScoredItem[];
  readonly overflow: readonly ScoredItem[];
}

export function diversify(
  ranked: readonly ScoredItem[],
  rules: DiversityRules,
  limit: number,
): DiversityResult {
  const perBrand = new Map<string, number>();
  const page: ScoredItem[] = [];
  const overflow: ScoredItem[] = [];

  for (const item of ranked) {
    if (page.length >= limit) {
      overflow.push(item);
      continue;
    }
    if (page.length >= rules.window) {
      page.push(item);
      continue;
    }
    const used = perBrand.get(item.product.brandName) ?? 0;
    if (used >= rules.maxPerBrand) {
      overflow.push(item);
      continue;
    }
    perBrand.set(item.product.brandName, used + 1);
    page.push(item);
  }

  return { page, overflow };
}
