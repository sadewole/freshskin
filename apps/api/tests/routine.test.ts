import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestTips, personalizationReady, scoreTemplate, selectRoutine } from '../src/routine/template.js';
import type { RoutineStep } from '../src/routine/types.js';

const step = (id: string, position: number): RoutineStep => ({
  id,
  position,
  title: `Step ${position}`,
  instruction: 'Rinse, then pat dry.',
  why: 'A short reason naming the inputs.',
  inputs: ['body skin'],
  tipId: null,
});

const generic = {
  slug: 'body-basic',
  title: 'A simple body routine',
  contentVersion: 'body-basic-1.0.0',
  audience: [] as readonly string[],
  steps: [step('s1', 1), step('s2', 2)],
};

const newcomer = { hasSkinBasics: false, ownedCreamCount: 0 };
const ready = { hasSkinBasics: true, ownedCreamCount: 1 };

describe('routine selection', () => {
  it('returns body-basic for every profile today', () => {
    for (const profile of [newcomer, ready, { hasSkinBasics: true, ownedCreamCount: 0 }]) {
      assert.equal(selectRoutine(profile, [generic])?.slug, 'body-basic');
    }
  });

  it('returns null when nothing matches, rather than inventing a routine', () => {
    assert.equal(selectRoutine(newcomer, []), null);
  });

  it('is deterministic: repeated calls and input order changes pick the same template', () => {
    const other = { ...generic, slug: 'aaa-first', audience: [] as readonly string[] };
    const first = selectRoutine(newcomer, [generic, other]);
    const second = selectRoutine(newcomer, [other, generic]);
    assert.deepEqual(first, second);
    assert.equal(first?.slug, 'aaa-first');
  });

  it('every instructional string fits the 140-char wire limit', () => {
    for (const candidate of [generic]) {
      for (const routineStep of candidate.steps) {
        assert.ok(routineStep.instruction.length <= 140, routineStep.instruction);
        assert.ok(routineStep.why.length <= 140, routineStep.why);
      }
    }
  });

  it('never promises treatment or judges tone', () => {
    const banned = /\b(will clear|cure|treat|diagnose|lighten|whiten|brighten|glow|flawless)\b/i;
    for (const routineStep of generic.steps) {
      assert.doesNotMatch(routineStep.instruction, banned);
      assert.doesNotMatch(routineStep.why, banned);
    }
  });
});

describe('personalization gate', () => {
  it('needs skin basics plus at least one owned cream', () => {
    assert.equal(personalizationReady(newcomer), false);
    assert.equal(personalizationReady({ hasSkinBasics: true, ownedCreamCount: 0 }), false);
    assert.equal(personalizationReady({ hasSkinBasics: false, ownedCreamCount: 2 }), false);
    assert.equal(personalizationReady(ready), true);
  });

  it('an empty audience always matches, a personalised audience only matches ready profiles', () => {
    const personalised = { ...generic, slug: 'personal', audience: ['personalised'] };
    assert.equal(scoreTemplate(personalised, newcomer), 0);
    assert.equal(scoreTemplate(personalised, ready), 1);
    assert.equal(scoreTemplate(generic, newcomer), 1);
  });
});

describe('bestTips', () => {
  const tip = (id: string, position: number) => ({
    id,
    topic: 'routine',
    body: 'A reviewed tip body.',
    why: 'A short reason.',
    inputs: [] as readonly string[],
    position,
  });

  it('orders by position, ties by id, and caps the list', () => {
    const tips = [tip('b', 2), tip('a', 1), tip('c', 1), tip('d', 3), tip('e', 4)];
    assert.deepEqual(
      bestTips(tips, 3).map((row) => row.id),
      ['a', 'c', 'b'],
    );
  });
});
