import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  findSimilar,
  labelFor,
  noteCosine,
  performanceMatch,
  similarity,
  type ScentProfile,
} from '../src/rec/similar.js';

const profile = (over: Partial<ScentProfile> = {}): ScentProfile => ({
  noteNames: ['Rose', 'Cedar', 'Bergamot'],
  heartAndBaseNotes: ['Rose', 'Cedar'],
  familyNames: ['Floral', 'Woody'],
  longevity: 3,
  projection: 3,
  ...over,
});

describe('noteCosine', () => {
  it('is 1 for identical note sets', () => {
    assert.ok(Math.abs(noteCosine(profile(), profile()) - 1) < 1e-9);
  });

  it('is 0 with no shared notes', () => {
    assert.equal(noteCosine(profile(), profile({ noteNames: ['Oud'], heartAndBaseNotes: ['Oud'] })), 0);
  });

  it('weights heart and base notes above top notes', () => {
    const topOnly = profile({ noteNames: ['Rose', 'Bergamot'], heartAndBaseNotes: ['Rose'] });
    const baseHeavy = profile({ noteNames: ['Cedar', 'Bergamot'], heartAndBaseNotes: ['Cedar'] });
    const anchor = profile({ noteNames: ['Rose', 'Cedar'], heartAndBaseNotes: ['Rose', 'Cedar'] });
    assert.ok(noteCosine(anchor, baseHeavy) > 0);
    assert.ok(noteCosine(anchor, topOnly) > 0);
  });
});

describe('similarity', () => {
  it('scores an identical fragrance as very close', () => {
    const result = similarity(profile(), profile());
    assert.equal(result.label, 'very_close');
    assert.ok(result.score > 0.9);
  });

  it('names the shared notes', () => {
    const result = similarity(profile(), profile({ noteNames: ['Cedar', 'Amber'], heartAndBaseNotes: ['Cedar', 'Amber'] }));
    assert.deepEqual(result.sharedNotes, ['Cedar']);
  });

  it('scores a disjoint fragrance below the display threshold', () => {
    const result = similarity(profile(), profile({ noteNames: ['Oud'], heartAndBaseNotes: ['Oud'], familyNames: ['Oriental'] }));
    assert.equal(result.label, 'not_similar');
  });
});

describe('labelFor', () => {
  it('uses the documented bands', () => {
    assert.equal(labelFor(0.8), 'very_close');
    assert.equal(labelFor(0.65), 'close');
    assert.equal(labelFor(0.5), 'loosely_similar');
    assert.equal(labelFor(0.49), 'not_similar');
  });
});

describe('performanceMatch', () => {
  it('is 1 for the same performance', () => {
    assert.equal(performanceMatch(profile(), profile()), 1);
  });

  it('falls off with a mismatch', () => {
    assert.ok(performanceMatch(profile({ longevity: 1 }), profile({ longevity: 5 })) < 0.6);
  });
});

describe('findSimilar', () => {
  const anchor = { productId: 'anchor', priceNgn: 40_000, profile: profile() };
  const candidates = [
    { productId: 'anchor', priceNgn: 40_000, profile: profile() },
    { productId: 'close', priceNgn: 30_000, profile: profile({ noteNames: ['Rose', 'Cedar', 'Bergamot', 'Vanilla'], heartAndBaseNotes: ['Rose', 'Cedar', 'Vanilla'] }) },
    { productId: 'far', priceNgn: 25_000, profile: profile({ noteNames: ['Oud'], heartAndBaseNotes: ['Oud'], familyNames: ['Oriental'] }) },
    { productId: 'dearer', priceNgn: 60_000, profile: profile({ noteNames: ['Rose', 'Amber'], heartAndBaseNotes: ['Rose', 'Amber'] }) },
  ];

  it('never returns the anchor itself', () => {
    const results = findSimilar(anchor, candidates);
    assert.ok(results.every((result) => result.productId !== 'anchor'));
  });

  it('drops pairs below the display threshold', () => {
    const results = findSimilar(anchor, candidates);
    assert.ok(results.every((result) => result.label !== 'not_similar'));
    assert.ok(results.some((result) => result.productId === 'close'));
  });

  it('filters by price before ranking when cheaper is requested', () => {
    const results = findSimilar(anchor, candidates, { cheaperOnly: true });
    assert.ok(results.every((result) => (result.priceDeltaNgn ?? 0) < 0));
    assert.ok(!results.some((result) => result.productId === 'dearer'));
  });

  it('reports the price delta in naira', () => {
    const results = findSimilar(anchor, candidates);
    const dearer = results.find((result) => result.productId === 'dearer');
    assert.equal(dearer?.priceDeltaNgn, 20_000);
  });

  it('respects the limit', () => {
    assert.ok(findSimilar(anchor, candidates, { limit: 1 }).length <= 1);
  });
});
