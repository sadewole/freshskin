import type { ExplainedItem, ScoredItem, ViewerFacts } from './types.js';

/**
 * Template-first by design (§14.6 as amended): deterministic, ≤140 characters, naming a product
 * property and a profile property. No term names, no promises, no model call.
 */
const CLIMATE_LABEL: Record<ViewerFacts['climateZone'], string> = {
  hot_humid: 'humid weather',
  hot_dry: 'dry heat',
  temperate: 'mild weather',
  cold: 'cold weather',
};

const SKIN_LABEL: Record<ViewerFacts['skinType'], string> = {
  dry: 'dry skin',
  normal: 'normal skin',
  oily: 'oily skin',
  combination: 'combination skin',
  unsure: 'your skin',
};

const byTerm: Record<string, (item: ScoredItem, viewer: ViewerFacts) => string> = {
  skin_type_fit: (item, viewer) => {
    const richness = item.product.richness ?? 'medium';
    return `its ${richness} texture suits ${SKIN_LABEL[viewer.skinType]}`;
  },
  ingredient_safety: () => 'its ingredients carry a low irritation risk',
  concern_efficacy: (item, viewer) => {
    const concern = viewer.concerns[0];
    return concern === undefined
      ? 'it contains ingredients with published benefit'
      : `it contains ingredients that target ${concern.replace(/_/g, ' ')}`;
  },
  climate_fit: (_item, viewer) => `it is weighted for ${CLIMATE_LABEL[viewer.climateZone]}`,
  budget_fit: () => 'it sits inside your budget',
  feedback_affinity: () => 'it resembles products you have rated well',
};

const ORDER: readonly string[] = [
  'skin_type_fit',
  'concern_efficacy',
  'climate_fit',
  'ingredient_safety',
  'budget_fit',
  'feedback_affinity',
];

export function explainWithTemplate(item: ScoredItem, viewer: ViewerFacts): string {
  const ranked = ORDER.filter((id) => (item.terms as Record<string, number | undefined>)[id] !== undefined);
  const clauses: string[] = [];
  for (const id of ranked) {
    const build = byTerm[id];
    if (build === undefined) continue;
    clauses.push(build(item, viewer));
    if (clauses.length === 2) break;
  }
  const joined = clauses.length === 0 ? 'it matches the profile you saved' : clauses.join(' and ');
  const sentence = `${item.product.brandName} ${item.product.name}: ${joined}.`;
  return sentence.length <= 140 ? sentence : `${sentence.slice(0, 137)}...`;
}

export function toExplained(
  items: readonly ScoredItem[],
  viewer: ViewerFacts,
  flagsFor: (item: ScoredItem) => readonly string[],
): readonly ExplainedItem[] {
  return items.map((item, index) => ({
    ...item,
    rank: index + 1,
    displayScore: Math.round(item.value * 1000) / 10,
    reason: explainWithTemplate(item, viewer),
    flags: flagsFor(item),
  }));
}
