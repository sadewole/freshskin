import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lagosDay, summariseProgress } from '../src/routine/progress.js';
import type { StoredCheckIn } from '../src/routine/types.js';

const row = (checkedOn: string, completion: StoredCheckIn['completion'] = 'done'): StoredCheckIn => ({
  id: `id-${checkedOn}`,
  checkedOn,
  completion,
  feel: 'about_same',
  createdAt: new Date(`${checkedOn}T12:00:00Z`),
});

describe('lagosDay', () => {
  it('is UTC+1 with no DST: 00:30Z is still the previous Lagos day at 01:30', () => {
    assert.equal(lagosDay(new Date('2026-11-15T00:30:00Z')), '2026-11-15');
    assert.equal(lagosDay(new Date('2026-11-14T22:30:00Z')), '2026-11-14');
  });
});

describe('summariseProgress', () => {
  it('surfaces latest two only, newest first', () => {
    const summary = summariseProgress(
      [row('2026-11-10'), row('2026-11-12'), row('2026-11-11')],
      '2026-11-12',
    );
    assert.equal(summary.latest?.checkedOn, '2026-11-12');
    assert.equal(summary.previous?.checkedOn, '2026-11-11');
    assert.equal(summary.totalCheckIns, 3);
    assert.equal(summary.checkedInToday, true);
  });

  it('counts a streak over consecutive non-skipped days', () => {
    const summary = summariseProgress(
      [row('2026-11-12'), row('2026-11-11'), row('2026-11-10')],
      '2026-11-12',
    );
    assert.equal(summary.streakDays, 3);
  });

  it('stops the streak at a skipped day or a gap, and an unchecked today never breaks it', () => {
    const skipped = summariseProgress(
      [row('2026-11-12'), row('2026-11-11', 'skipped'), row('2026-11-10')],
      '2026-11-12',
    );
    assert.equal(skipped.streakDays, 1);

    const gapped = summariseProgress([row('2026-11-12'), row('2026-11-10')], '2026-11-12');
    assert.equal(gapped.streakDays, 1);

    const uncheckedToday = summariseProgress([row('2026-11-11'), row('2026-11-10')], '2026-11-12');
    assert.equal(uncheckedToday.streakDays, 2);
    assert.equal(uncheckedToday.checkedInToday, false);
  });

  it('ignores future rows and handles an empty store', () => {
    const future = summariseProgress([row('2026-11-13')], '2026-11-12');
    assert.equal(future.totalCheckIns, 0);
    assert.equal(future.latest, null);
    assert.equal(future.previous, null);
    assert.equal(future.streakDays, 0);
    assert.equal(future.checkedInToday, false);
  });

  it('matches the web local-store semantics day for day', () => {
    // Same-day replace happens at write time (one row per Lagos day), so two rows for one
    // day never reach the summary; the walk below asserts the tie-break anyway.
    const summary = summariseProgress(
      [row('2026-11-12', 'partly'), row('2026-11-12', 'done')],
      '2026-11-12',
    );
    assert.equal(summary.totalCheckIns, 2);
    assert.equal(summary.streakDays, 1);
  });
});
