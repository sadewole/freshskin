import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessContact,
  worstSeverity,
  type CosmeticSurface,
  type Sensitivity,
} from '../src/safety/conflicts.js';

const surface: CosmeticSurface = {
  kind: 'inci',
  disclosure: 'full',
  items: [
    { ingredientId: 'ing-fragrance', inciName: 'Fragrance', isAllergen: true },
    { ingredientId: 'ing-glycerin', inciName: 'Glycerin', isAllergen: false },
  ],
};

const sensitivity = (over: Partial<Sensitivity>): Sensitivity => ({
  id: 's1',
  ingredientId: null,
  freeText: null,
  severity: 'severe',
  appliesTo: ['cream', 'perfume'],
  ...over,
});

describe('assessContact', () => {
  it('matches a declared ingredient id', () => {
    const collisions = assessContact([sensitivity({ ingredientId: 'ing-fragrance' })], surface, 'cream');
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0]?.kind, 'declared');
    assert.equal(collisions[0]?.severity, 'severe');
  });

  it('matches unresolved free text on a normalised token, never silently dropping it', () => {
    const collisions = assessContact([sensitivity({ freeText: 'fragrance' })], surface, 'cream');
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0]?.kind, 'free_text_unresolved');
  });

  it('ignores a sensitivity that does not apply to the product kind', () => {
    const collisions = assessContact(
      [sensitivity({ ingredientId: 'ing-fragrance', appliesTo: ['perfume'] })],
      surface,
      'cream',
    );
    assert.deepEqual(collisions, []);
  });

  it('returns nothing when the surface does not contain the ingredient', () => {
    const collisions = assessContact([sensitivity({ ingredientId: 'ing-absent' })], surface, 'cream');
    assert.deepEqual(collisions, []);
  });
});

describe('worstSeverity', () => {
  it('is null for no collisions', () => {
    assert.equal(worstSeverity([]), null);
  });

  it('orders mild below severe regardless of input order', () => {
    const mild = sensitivity({ id: 'm', severity: 'mild', ingredientId: 'ing-glycerin' });
    const severe = sensitivity({ id: 's', severity: 'severe', ingredientId: 'ing-fragrance' });
    const collisions = assessContact([mild, severe], surface, 'cream');
    assert.equal(worstSeverity(collisions), 'severe');
    assert.equal(worstSeverity([...collisions].reverse()), 'severe');
  });
});
