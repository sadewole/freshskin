import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jaroWinkler } from '../src/scans/jaro-winkler.js';

const close = (actual: number, expected: number, tolerance = 0.01): void => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ~${expected}, got ${actual}`);
};

describe('jaroWinkler', () => {
  it('is 1 for identical strings', () => {
    assert.equal(jaroWinkler('glycerin', 'glycerin'), 1);
  });

  it('is 0 when nothing matches', () => {
    assert.equal(jaroWinkler('abc', 'xyz'), 0);
  });

  it('matches the published MARTHA/MARHTA value', () => {
    close(jaroWinkler('MARTHA', 'MARHTA'), 0.961);
  });

  it('matches the published DIXON/DICKSONX value', () => {
    close(jaroWinkler('DIXON', 'DICKSONX'), 0.813);
  });

  it('matches the published DWAYNE/DUANE value', () => {
    close(jaroWinkler('DWAYNE', 'DUANE'), 0.84);
  });

  it('rewards a shared prefix', () => {
    const withPrefix = jaroWinkler('glycerine', 'glycerin');
    const withoutPrefix = jaroWinkler('xlycerine', 'glycerin');
    assert.ok(withPrefix > withoutPrefix);
  });

  it('never exceeds 1', () => {
    assert.ok(jaroWinkler('a', 'a') <= 1);
    assert.ok(jaroWinkler('parfum', 'parfum') <= 1);
  });
});
