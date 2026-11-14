import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHECK_INS_DISCLAIMER, presentCheckIns, presentRoutine, ROUTINE_DISCLAIMER } from '../src/http/present-routine.js';
import type { RoutineContent } from '../src/routine/store.js';

const content: RoutineContent = {
  routine: {
    slug: 'body-basic',
    title: 'A simple body routine',
    contentVersion: 'body-basic-1.0.0',
    steps: [
      {
        id: 'step-1',
        position: 1,
        title: 'Wash gently',
        instruction: 'Use lukewarm water and a gentle body wash, then pat dry.',
        why: 'Hot water and harsh soap strip oils, which dry or sensitive body skin notices.',
        inputs: ['body skin', 'plain water'],
        tipId: null,
      },
    ],
  },
  tips: [
    {
      id: 'tip-1',
      topic: 'routine',
      body: 'A short routine you repeat suits body skin better than a long one you skip.',
      why: 'Consistency matters more than the number of steps for a body routine.',
      inputs: ['body skin'],
      position: 1,
    },
  ],
};

const summary = {
  today: '2026-11-12',
  latest: {
    id: 'check-1',
    checkedOn: '2026-11-12',
    completion: 'done' as const,
    feel: 'about_same' as const,
    createdAt: new Date('2026-11-12T12:00:00Z'),
  },
  previous: null,
  streakDays: 1,
  checkedInToday: true,
  totalCheckIns: 1,
};

describe('presentRoutine', () => {
  it('builds the envelope with snake_case keys and the canonical disclaimers', () => {
    const wire = presentRoutine(content, { requestId: 'req-1' });
    assert.equal(wire.meta.request_id, 'req-1');
    assert.equal(wire.data.routine.slug, 'body-basic');
    assert.equal(wire.data.routine.content_version, 'body-basic-1.0.0');
    assert.equal(wire.data.routine.steps[0]?.tip_id, null);
    assert.deepEqual(wire.data.routine.steps[0]?.inputs, ['body skin', 'plain water']);
    assert.equal(wire.data.tips.length, 1);
    assert.equal(wire.data.disclaimer, ROUTINE_DISCLAIMER);
  });

  it('every step and tip string fits the 140-char wire limit', () => {
    const wire = presentRoutine(content, { requestId: 'req-1' });
    // The disclaimer is canonical PRD §16.7 copy and exempt from the ≤140 content rule.
    const strings = [
      ...wire.data.routine.steps.flatMap((step) => [step.instruction, step.why]),
      ...wire.data.tips.flatMap((tip) => [tip.body, tip.why]),
    ];
    for (const text of strings) assert.ok(text.length <= 140, text);
  });
});

describe('presentCheckIns', () => {
  it('carries latest-two only: no history arrays, no trend fields', () => {
    const wire = presentCheckIns(summary, { requestId: 'req-2' });
    assert.equal(wire.meta.request_id, 'req-2');
    assert.equal(wire.data.today, '2026-11-12');
    assert.equal(wire.data.latest?.checked_on, '2026-11-12');
    assert.equal(wire.data.previous, null);
    assert.equal(wire.data.streak_days, 1);
    assert.equal(wire.data.checked_in_today, true);
    assert.equal(wire.data.total_check_ins, 1);
    assert.equal(wire.data.disclaimer, CHECK_INS_DISCLAIMER);
    const keys = Object.keys(wire.data).sort();
    assert.deepEqual(keys, [
      'checked_in_today',
      'disclaimer',
      'latest',
      'previous',
      'streak_days',
      'today',
      'total_check_ins',
    ]);
  });
});
