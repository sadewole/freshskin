import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessParse,
  decideVerdict,
  deriveFindings,
  explainVerdict,
  type ParsedToken,
  type ScanSubject,
  type UsableParse,
} from '../src/scans/verdict.js';
import type { Collision, Sensitivity } from '../src/safety/conflicts.js';

const tokens = (matched: number, total: number): ParsedToken[] =>
  Array.from({ length: total }, (_, index) => ({
    raw: `token-${index}`,
    ingredientId: index < matched ? `ing-${index}` : null,
  }));

const sensitivity = (severity: Collision['severity']): Sensitivity => ({
  id: `s-${severity}`,
  ingredientId: 'ing-0',
  freeText: null,
  severity,
  appliesTo: ['cream'],
});

const collision = (severity: Collision['severity'], inciName = 'Fragrance'): Collision => ({
  sensitivity: sensitivity(severity),
  hit: { ingredientId: 'ing-0', inciName, isAllergen: true },
  kind: 'declared',
  severity,
});

const subject = (over: Partial<ScanSubject> = {}): ScanSubject => ({
  concerns: [],
  collisions: [],
  highIrritantCount: 0,
  comedogenicHits: 0,
  fragranceAllergen: false,
  beneficialCount: 0,
  ...over,
});

const usable = (): UsableParse => {
  const parse = assessParse(tokens(6, 8));
  assert.ok(parse.usable);
  return parse;
};

describe('assessParse', () => {
  it('rejects an empty label', () => {
    const parse = assessParse([]);
    assert.equal(parse.usable, false);
    assert.equal(parse.usable === false && parse.reason, 'empty_label');
  });

  it('rejects fewer than five recognised ingredients', () => {
    const parse = assessParse(tokens(4, 4));
    assert.equal(parse.usable, false);
    assert.equal(parse.usable === false && parse.reason, 'too_few_recognised');
  });

  it('rejects a match rate below 60%', () => {
    const parse = assessParse(tokens(5, 10));
    assert.equal(parse.usable, false);
    assert.equal(parse.usable === false && parse.reason, 'match_rate_too_low');
  });

  it('accepts exactly the floor: five matched at 60%', () => {
    const parse = assessParse(tokens(6, 10));
    assert.equal(parse.usable, true);
    assert.equal(parse.matchRate, 0.6);
    assert.equal(parse.matched, 6);
  });

  it('accepts a fully recognised label', () => {
    const parse = assessParse(tokens(9, 9));
    assert.equal(parse.usable, true);
    assert.equal(parse.matchRate, 1);
  });
});

describe('deriveFindings', () => {
  it('turns a severe collision into a blocking finding naming the ingredient', () => {
    const findings = deriveFindings(subject({ collisions: [collision('severe', 'Fragrance (Parfum)')] }));
    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.severity, 'avoid');
    assert.match(findings[0]?.reason ?? '', /Fragrance \(Parfum\)/);
  });

  it('blocks when two or more non-severe sensitivities are present', () => {
    const findings = deriveFindings(
      subject({ collisions: [collision('mild', 'Lanolin'), collision('moderate', 'Coconut Oil')] }),
    );
    assert.ok(findings.some((finding) => finding.severity === 'avoid'));
    assert.ok(findings.some((finding) => finding.label === 'formula'));
  });

  it('does not block on a single mild sensitivity', () => {
    const findings = deriveFindings(subject({ collisions: [collision('mild')] }));
    assert.ok(findings.every((finding) => finding.severity !== 'avoid'));
    assert.ok(findings.some((finding) => finding.severity === 'caution'));
  });

  it('blocks two high-irritation ingredients only for users who flagged sensitivity', () => {
    const flagged = deriveFindings(subject({ highIrritantCount: 2, concerns: ['sensitivity'] }));
    assert.ok(flagged.some((finding) => finding.severity === 'avoid'));

    const unflagged = deriveFindings(subject({ highIrritantCount: 2, concerns: ['dryness'] }));
    assert.ok(unflagged.every((finding) => finding.severity !== 'avoid'));
  });

  it('cautions on comedogenic load only for body-acne users', () => {
    const acne = deriveFindings(subject({ comedogenicHits: 3, concerns: ['body_acne'] }));
    assert.ok(acne.some((finding) => finding.severity === 'caution'));

    const other = deriveFindings(subject({ comedogenicHits: 3, concerns: ['dryness'] }));
    assert.equal(other.length, 0);
  });

  it('records beneficial ingredients when three or more suit the concerns', () => {
    const findings = deriveFindings(subject({ beneficialCount: 3 }));
    assert.equal(findings[0]?.severity, 'beneficial');
  });
});

describe('decideVerdict', () => {
  it('returns avoid whenever a blocking finding exists', () => {
    const findings = deriveFindings(subject({ collisions: [collision('severe')] }));
    const verdict = decideVerdict(usable(), findings);
    assert.equal(verdict.kind, 'avoid');
    assert.ok(verdict.kind === 'avoid' && verdict.cause.severity === 'avoid');
  });

  it('returns good when nothing is flagged and something is beneficial', () => {
    const verdict = decideVerdict(usable(), deriveFindings(subject({ beneficialCount: 4 })));
    assert.equal(verdict.kind, 'good');
  });

  it('returns okay with cautions when there is something to watch', () => {
    const findings = deriveFindings(subject({ collisions: [collision('mild')] }));
    const verdict = decideVerdict(usable(), findings);
    assert.equal(verdict.kind, 'okay');
    assert.equal(verdict.kind === 'okay' && verdict.cautions.length, 1);
  });

  it('returns okay when there is nothing to say at all', () => {
    assert.equal(decideVerdict(usable(), []).kind, 'okay');
  });
});

describe('explainVerdict', () => {
  it('never promises an outcome', () => {
    const verdict = decideVerdict(usable(), deriveFindings(subject({ beneficialCount: 4 })));
    assert.doesNotMatch(explainVerdict(verdict), /\b(will|cure|clear|treat|diagnose)\b/i);
  });

  it('gives a specific retake reason for each refusal', () => {
    for (const reason of ['empty_label', 'too_few_recognised', 'match_rate_too_low'] as const) {
      const copy = explainVerdict({
        kind: 'insufficient_evidence',
        parse: { usable: false, reason, matchRate: 0.4, matched: 3 },
      });
      assert.ok(copy.length > 20, `copy too thin for ${reason}`);
      assert.match(copy, /try again/i);
    }
  });
});
