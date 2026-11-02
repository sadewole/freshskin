import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { present } from '../src/http/present.js';
import { recommend } from '../src/rec/pipeline.js';
import type { Candidate, RecommendationRequest, ViewerFacts } from '../src/rec/types.js';

const viewer: ViewerFacts = {
  userId: 'user-1',
  skinType: 'dry',
  concerns: ['dryness'],
  climateZone: 'hot_humid',
  budgetMaxNgn: 12_000,
  feedbackAffinity: 0.5,
  fragrance: null,
};

const candidate = (id: string, price: number, ingredientId = 'ing-glycerin'): Candidate => ({
  product: {
    id,
    name: `Cream ${id}`,
    brandName: 'Acme',
    category: 'cream',
    priceNgn: price,
    availability: 'in_stock',
    richness: 'rich',
    fragranceFree: true,
    facts: {
      irritancyAvg: 0.1,
      comedogenicMax: 1,
      humectantRatio: 0.4,
      occlusiveRatio: 0.3,
      beneficialCount: 3,
    },
    perfume: null,
  },
  surface: {
    kind: 'inci',
    disclosure: 'full',
    items: [{ ingredientId, inciName: 'Fragrance', isAllergen: true }],
  },
});

const request: RecommendationRequest = { kind: 'cream', limit: 10, narrowing: {} };

const plan = recommend({
  viewer,
  sensitivities: [
    { id: 's1', ingredientId: 'ing-fragrance', freeText: null, severity: 'severe', appliesTo: ['cream'] },
  ],
  candidates: [candidate('keep', 8_000), candidate('drop', 9_000, 'ing-fragrance')],
  request,
  profileVersion: 'pv-1',
  capped: false,
  day: '2026-11-02',
});

const wire = present(plan, { requestId: 'req-1', servedInMs: 12, cached: false });

describe('present — §12.3 wire shape', () => {
  it('carries a recommendation id the client can send back to /feedback', () => {
    assert.equal(wire.data.items.length, 1);
    assert.match(
      wire.data.items[0]?.recommendation_id ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('includes excluded items with a code and a reason', () => {
    assert.equal(wire.data.excluded.length, 1);
    assert.equal(wire.data.excluded[0]?.product_id, 'drop');
    assert.equal(wire.data.excluded[0]?.code, 'sensitivity_severe');
    assert.ok((wire.data.excluded[0]?.reason.length ?? 0) > 0);
  });

  it('names every scoring term in the breakdown', () => {
    assert.deepEqual(Object.keys(wire.data.items[0]?.breakdown ?? {}).sort(), [
      'budget_fit',
      'climate_fit',
      'concern_efficacy',
      'feedback_affinity',
      'ingredient_safety',
      'skin_type_fit',
    ]);
  });

  it('uses snake_case on the wire and leaks no domain field names', () => {
    const json = JSON.stringify(wire);
    assert.ok(json.includes('session_id'));
    assert.ok(json.includes('total_matched'));
    assert.ok(!json.includes('brandName'));
    assert.ok(!json.includes('displayScore'));
  });

  it('carries session and algorithm versions so a stored result can be re-evaluated', () => {
    assert.equal(wire.data.session_id, plan.meta.sessionId);
    assert.equal(wire.data.algorithm_version, plan.meta.algorithmVersion);
    assert.equal(wire.data.profile_version, 'pv-1');
  });
});
