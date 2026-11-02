import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recommend } from '../src/rec/pipeline.js';
import type { Candidate, RecommendationRequest, ViewerFacts } from '../src/rec/types.js';
import type { CosmeticSurface, Sensitivity } from '../src/safety/conflicts.js';

const viewer: ViewerFacts = {
  userId: 'user-1',
  skinType: 'dry',
  concerns: ['dryness'],
  climateZone: 'hot_humid',
  budgetMaxNgn: 12_000,
  feedbackAffinity: 0.5,
};

const surfaceWith = (ids: readonly string[], inciNames: readonly string[] = []): CosmeticSurface => ({
  kind: 'inci',
  disclosure: 'full',
  items: ids.map((id, index) => ({
    ingredientId: id,
    inciName: inciNames[index] ?? (id === 'ing-fragrance' ? 'Fragrance' : `Ingredient ${index}`),
    isAllergen: id === 'ing-fragrance',
  })),
});

const candidate = (over: {
  id: string;
  brand?: string;
  price?: number | null;
  richness?: 'light' | 'medium' | 'rich';
  fragranceFree?: boolean;
  availability?: 'in_stock' | 'out_of_stock' | 'unknown';
  ingredientIds?: readonly string[];
}): Candidate => ({
  product: {
    id: over.id,
    name: `Cream ${over.id}`,
    brandName: over.brand ?? 'Acme',
    category: 'cream',
    priceNgn: over.price === undefined ? 8_000 : over.price,
    availability: over.availability ?? 'in_stock',
    richness: over.richness ?? 'rich',
    fragranceFree: over.fragranceFree ?? true,
    facts: {
      irritancyAvg: 0.1,
      comedogenicMax: 1,
      humectantRatio: 0.4,
      occlusiveRatio: 0.3,
      beneficialCount: 3,
    },
  },
  surface: surfaceWith(over.ingredientIds ?? ['ing-glycerin']),
});

const request: RecommendationRequest = { kind: 'cream', limit: 10, narrowing: {} };

const run = (
  candidates: readonly Candidate[],
  over: Partial<RecommendationRequest> = {},
  sensitivities: readonly Sensitivity[] = [],
) =>
  recommend({
    viewer,
    sensitivities,
    candidates,
    request: { ...request, ...over },
    profileVersion: 'pv-1',
    capped: false,
    day: '2026-11-02',
  });

describe('recommend — eligibility', () => {
  it('excludes a severe sensitivity and reports it with a reason', () => {
    const sensitivities: Sensitivity[] = [
      { id: 's1', ingredientId: 'ing-fragrance', freeText: null, severity: 'severe', appliesTo: ['cream'] },
    ];
    const plan = run([candidate({ id: 'a', ingredientIds: ['ing-fragrance'] })], {}, sensitivities);

    assert.equal(plan.items.length, 0);
    assert.equal(plan.rejected.length, 1);
    assert.equal(plan.rejected[0]?.code, 'sensitivity_severe');
    assert.equal(plan.rejected[0]?.productName, 'Cream a');
    assert.match(plan.rejected[0]?.reason ?? '', /Fragrance/);
  });

  it('does not exclude a mild sensitivity', () => {
    const plan = run([candidate({ id: 'a', ingredientIds: ['ing-fragrance'] })], {}, [
      { id: 's1', ingredientId: 'ing-fragrance', freeText: null, severity: 'mild', appliesTo: ['cream'] },
    ]);
    assert.equal(plan.items.length, 1);
  });

  it('applies the price narrowing only when the user asks for it', () => {
    const pricey = [candidate({ id: 'costly', price: 30_000 })];
    assert.equal(run(pricey).items.length, 1);

    const narrowed = run(pricey, { narrowing: { maxPriceNgn: 12_000 } });
    assert.equal(narrowed.items.length, 0);
    assert.equal(narrowed.rejected[0]?.code, 'over_budget');
  });

  it('always excludes unavailable products from recommendations', () => {
    const plan = run([
      candidate({ id: 'gone', availability: 'out_of_stock' }),
      candidate({ id: 'unknown', availability: 'unknown' }),
    ]);
    assert.equal(plan.items.length, 0);
    assert.deepEqual(
      plan.rejected.map((r) => r.code),
      ['out_of_stock', 'out_of_stock'],
    );
  });
});

describe('recommend — scoring and shape', () => {
  it('ranks richer textures first for dry skin', () => {
    const plan = run([candidate({ id: 'light', richness: 'light' }), candidate({ id: 'rich', richness: 'rich' })]);
    assert.equal(plan.items[0]?.product.id, 'rich');
  });

  it('produces a display score on the 0-100 scale', () => {
    const plan = run([candidate({ id: 'a' })]);
    const score = plan.items[0]?.displayScore ?? -1;
    assert.ok(score >= 0 && score <= 100, `score ${score} out of range`);
  });

  it('keeps every reason under 140 characters and free of promises', () => {
    const plan = run([candidate({ id: 'a' }), candidate({ id: 'b', richness: 'light' })]);
    for (const item of plan.items) {
      assert.ok(item.reason.length <= 140, `reason too long: ${item.reason}`);
      assert.doesNotMatch(item.reason, /\b(will|cure|clear|treat|diagnose)\b/i);
    }
  });

  it('caps a brand at two items in the page', () => {
    const plan = run([
      candidate({ id: 'a1', brand: 'Acme' }),
      candidate({ id: 'a2', brand: 'Acme' }),
      candidate({ id: 'a3', brand: 'Acme' }),
    ]);
    assert.equal(plan.items.length, 2);
    assert.ok(plan.items.every((item) => item.product.brandName === 'Acme'));
  });

  it('counts eligible candidates rather than returning the page length', () => {
    const plan = run([candidate({ id: 'a' }), candidate({ id: 'b' }), candidate({ id: 'c' })], { limit: 1 });
    assert.equal(plan.items.length, 1);
    assert.equal(plan.meta.totalMatched, 3);
  });
});

describe('recommend — session identity', () => {
  it('is deterministic for identical input, so a replay is not a new session', () => {
    const a = run([candidate({ id: 'a' })]);
    const b = run([candidate({ id: 'a' })]);
    assert.equal(a.meta.sessionId, b.meta.sessionId);
  });

  it('changes when the narrowing changes', () => {
    const a = run([candidate({ id: 'a' })]);
    const b = run([candidate({ id: 'a' })], { narrowing: { maxPriceNgn: 9_000 } });
    assert.notEqual(a.meta.sessionId, b.meta.sessionId);
  });
});
