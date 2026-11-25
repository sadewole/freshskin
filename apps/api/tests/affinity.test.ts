import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { feedbackAffinity, NEUTRAL_AFFINITY, PRIOR_COUNT, PRIOR_RATING } from '../src/rec/affinity.js';

describe('feedbackAffinity', () => {
  it('is exactly neutral with no ratings', () => {
    assert.equal(NEUTRAL_AFFINITY, 0.5);
    assert.equal(feedbackAffinity([]), 0.5);
  });

  it('moves above neutral for good ratings', () => {
    assert.ok(feedbackAffinity([5, 5, 5]) > 0.5);
  });

  it('moves below neutral for poor ratings', () => {
    assert.ok(feedbackAffinity([1, 1, 1]) < 0.5);
  });

  it('is monotonic: more good ratings never lowers affinity', () => {
    const one = feedbackAffinity([5]);
    const five = feedbackAffinity([5, 5, 5, 5, 5]);
    assert.ok(five > one);
  });

  it('stays inside 0..1 at the extremes', () => {
    assert.ok(feedbackAffinity(Array.from({ length: 200 }, () => 5)) <= 1);
    assert.ok(feedbackAffinity(Array.from({ length: 200 }, () => 1)) >= 0);
  });

  it('ignores ratings outside the 1..5 scale instead of trusting them', () => {
    assert.equal(feedbackAffinity([0, 6, -3, Number.NaN]), NEUTRAL_AFFINITY);
  });

  it('damps one extreme rating rather than letting it dominate', () => {
    const afterOneBad = feedbackAffinity([1]);
    const neutral = NEUTRAL_AFFINITY;
    // A single 1-star must not be able to swing the term more than half way to zero.
    assert.ok(afterOneBad > neutral * 0.7, `one bad rating moved affinity to ${afterOneBad}`);
  });

  it('documents its prior', () => {
    assert.equal(PRIOR_RATING, 3);
    assert.equal(PRIOR_COUNT, 5);
  });
});
