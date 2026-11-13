import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestPairings, scorePairing } from '../src/rec/pairing.js';

const perfume = { productId: 'p1', name: 'Seed Scent 01', familyNames: ['Floral'] };

const cream = (id: string, fragranceFree: boolean | null) => ({
  productId: id,
  name: `Cream ${id}`,
  fragranceFree,
});

describe('scorePairing', () => {
  it('prefers an unscented base and says why', () => {
    const pairing = scorePairing(cream('a', true), perfume);
    assert.equal(pairing.score, 1);
    assert.equal(pairing.clash, false);
    assert.match(pairing.rationale, /Unscented base/);
  });

  it('warns when the cream is scented rather than hiding it', () => {
    const pairing = scorePairing(cream('b', false), perfume);
    assert.equal(pairing.clash, true);
    assert.ok(pairing.score < 0.5);
    assert.match(pairing.rationale, /compete/);
  });

  it('admits when it does not know whether the cream is scented', () => {
    const pairing = scorePairing(cream('c', null), perfume);
    assert.equal(pairing.clash, false);
    assert.match(pairing.rationale, /do not know/);
  });

  it('never promises a result', () => {
    for (const flag of [true, false, null]) {
      assert.doesNotMatch(scorePairing(cream('x', flag), perfume).rationale, /\b(will|cure|clear)\b/i);
    }
  });
});

describe('bestPairings', () => {
  const creams = [cream('scented', false), cream('unscented', true), cream('unknown', null), cream('unscented-2', true)];

  it('orders unscented first and caps the list', () => {
    const pairings = bestPairings(creams, perfume);
    assert.equal(pairings.length, 3);
    assert.deepEqual(
      pairings.map((pairing) => pairing.clash),
      [false, false, false],
    );
    assert.equal(pairings[0]?.score, 1);
  });

  it('is deterministic for equal scores', () => {
    const first = bestPairings(creams, perfume).map((pairing) => pairing.creamId);
    const second = bestPairings([...creams].reverse(), perfume).map((pairing) => pairing.creamId);
    assert.deepEqual(first, second);
  });

  it('returns an empty list rather than inventing a pairing', () => {
    assert.deepEqual(bestPairings([], perfume), []);
  });
});
