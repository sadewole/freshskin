import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchRate,
  matchToken,
  normalise,
  parseLabel,
  repairOcrConfusions,
  splitLabel,
  type LexiconEntry,
} from '../src/scans/tokens.js';

const lexicon: LexiconEntry[] = [
  { ingredientId: 'ing-glycerin', inciName: 'Glycerin', aliases: [] },
  { ingredientId: 'ing-shea', inciName: 'Butyrospermum Parkii Butter', aliases: ['Shea Butter'] },
  { ingredientId: 'ing-fragrance', inciName: 'Fragrance', aliases: ['Parfum'] },
  { ingredientId: 'ing-niacinamide', inciName: 'Niacinamide', aliases: [] },
  { ingredientId: 'ing-tocopherol', inciName: 'Tocopherol', aliases: [] },
];

describe('normalise', () => {
  it('lowercases and drops punctuation and spaces', () => {
    assert.equal(normalise('Butyrospermum  Parkii-Butter'), 'butyrospermumparkiibutter');
  });
});

describe('repairOcrConfusions', () => {
  it('repairs the rn/m and 1/l confusions OCR actually makes', () => {
    assert.equal(repairOcrConfusions('g1ycerin'), 'glycerin');
    assert.equal(repairOcrConfusions('tocopherol'), 'tocopherol');
    assert.equal(repairOcrConfusions('rnagnesium'), 'magnesium');
  });
});

describe('splitLabel', () => {
  it('splits on commas, semicolons and newlines, and drops the heading', () => {
    const parts = splitLabel('Ingredients: Water, Glycerin; Fragrance\nNiacinamide');
    assert.deepEqual(parts, ['Water', 'Glycerin', 'Fragrance', 'Niacinamide']);
  });

  it('strips parenthetical notes', () => {
    assert.deepEqual(splitLabel('Fragrance (Parfum), Glycerin'), ['Fragrance', 'Glycerin']);
  });

  it('drops empty and absurdly long fragments', () => {
    const parts = splitLabel(', , Glycerin, ' + 'x'.repeat(120));
    assert.deepEqual(parts, ['Glycerin']);
  });
});

describe('matchToken', () => {
  it('matches an exact INCI name', () => {
    const match = matchToken('Glycerin', lexicon);
    assert.equal(match.ingredientId, 'ing-glycerin');
    assert.equal(match.method, 'exact');
    assert.equal(match.confidence, 1);
  });

  it('matches through an alias', () => {
    const match = matchToken('Shea Butter', lexicon);
    assert.equal(match.ingredientId, 'ing-shea');
    assert.equal(match.method, 'alias');
  });

  it('matches a near miss with a typo fuzzily', () => {
    const match = matchToken('Glycerine', lexicon);
    assert.equal(match.ingredientId, 'ing-glycerin');
    assert.equal(match.method, 'fuzzy');
    assert.ok(match.confidence >= 0.9 && match.confidence < 1);
  });

  it('matches through an OCR confusion and discounts the confidence', () => {
    const match = matchToken('G1ycer1n', lexicon);
    assert.equal(match.ingredientId, 'ing-glycerin');
    assert.equal(match.method, 'ocr_confusion');
    assert.ok(match.confidence < 1);
  });

  it('refuses to fuzzy-match a very short token', () => {
    assert.equal(matchToken('Cl', lexicon).ingredientId, null);
  });

  it('returns none for an ingredient it does not know, rather than guessing', () => {
    const match = matchToken('Unobtainium', lexicon);
    assert.equal(match.ingredientId, null);
    assert.equal(match.method, 'none');
    assert.equal(match.confidence, 0);
  });
});

describe('parseLabel', () => {
  it('keeps unmatched tokens so the caller can surface them', () => {
    const tokens = parseLabel('Glycerin, Unobtainium, Niacinamide', lexicon);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[1]?.ingredientId, null);
    assert.equal(tokens[1]?.raw, 'Unobtainium');
  });

  it('reports the match rate the verdict gate uses', () => {
    const tokens = parseLabel('Glycerin, Niacinamide, Tocopherol, Unobtainium', lexicon);
    assert.equal(matchRate(tokens), 0.75);
  });

  it('is 0 for an empty label', () => {
    assert.equal(matchRate([]), 0);
  });
});
