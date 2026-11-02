import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Plan, Scored } from '../src/rec/types.js';

/**
 * Compile-time assertions. `pnpm typecheck` is what enforces these; the test runner only
 * executes them. If a `@ts-expect-error` stops being an error, typecheck fails with
 * "unused '@ts-expect-error directive" and CI goes red.
 */
describe('stage branding', () => {
  it('cannot be constructed outside the pipeline', () => {
    // @ts-expect-error — Scored carries a module-private brand; only scoring() can produce one.
    const forged: Scored = { ranked: [] };
    assert.ok(forged !== undefined);
  });

  it('cannot be passed in as a finished plan', () => {
    const needsPlan = (plan: Plan): number => plan.items.length;
    // @ts-expect-error — an unsealed object is not a Plan.
    const result = needsPlan({ items: [], rejected: [], meta: null });
    assert.equal(typeof result, 'number');
  });
});
