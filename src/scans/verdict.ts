import type { Collision } from '../safety/conflicts.js';

/**
 * §13.4. The scan-parse gate and the verdict table.
 *
 * `UsableParse` carries a module-private brand, so `decideVerdict` cannot be called with a
 * partial parse: the value simply cannot be constructed elsewhere. The database restates the
 * same rule as a CHECK constraint, for writers that never go through this code.
 */

export type ScanCoverage = number & { readonly __coverage: 'scan-parse' };

export const VERDICT_PARSE_FLOOR = 0.6;
export const VERDICT_MIN_MATCHED = 5;

// A real runtime symbol, not `declare`: the parse value carries it, so the brand is present in
// both the type system and the object. It is not exported, so no other module can forge one.
const usableParse: unique symbol = Symbol('freshskin.usable-parse');

export interface UsableParse {
  readonly [usableParse]: true;
  readonly usable: true;
  readonly matchRate: ScanCoverage;
  readonly matched: number;
}

export type InsufficientReason = 'empty_label' | 'too_few_recognised' | 'match_rate_too_low';

export interface InsufficientParse {
  readonly usable: false;
  readonly reason: InsufficientReason;
  readonly matchRate: number;
  readonly matched: number;
}

export interface ParsedToken {
  readonly raw: string;
  readonly ingredientId: string | null;
}

export function assessParse(tokens: readonly ParsedToken[]): UsableParse | InsufficientParse {
  const total = tokens.length;
  const matched = tokens.filter((token) => token.ingredientId !== null).length;

  if (total === 0) {
    return { usable: false, reason: 'empty_label', matchRate: 0, matched: 0 };
  }

  const matchRate = matched / total;

  if (matched < VERDICT_MIN_MATCHED) {
    return { usable: false, reason: 'too_few_recognised', matchRate, matched };
  }
  if (matchRate < VERDICT_PARSE_FLOOR) {
    return { usable: false, reason: 'match_rate_too_low', matchRate, matched };
  }

  return {
    [usableParse]: true,
    usable: true,
    matchRate: matchRate as ScanCoverage,
    matched,
  };
}

export type FindingSeverity = 'beneficial' | 'neutral' | 'caution' | 'avoid';

export interface Finding {
  readonly label: string;
  readonly severity: FindingSeverity;
  readonly reason: string;
  readonly source?: string;
}

export type Verdict =
  | { readonly kind: 'good'; readonly findings: readonly Finding[] }
  | { readonly kind: 'okay'; readonly findings: readonly Finding[]; readonly cautions: readonly Finding[] }
  | { readonly kind: 'avoid'; readonly findings: readonly Finding[]; readonly cause: Finding }
  | { readonly kind: 'insufficient_evidence'; readonly parse: InsufficientParse };

export interface ScanSubject {
  readonly concerns: readonly string[];
  readonly collisions: readonly Collision[];
  readonly highIrritantCount: number;
  readonly comedogenicHits: number;
  readonly fragranceAllergen: boolean;
  readonly beneficialCount: number;
}

/**
 * The verdict table as one pass. Detection of collisions stays in safety/; this decides what
 * each collision *means* for a scanned label.
 */
export function deriveFindings(subject: ScanSubject): readonly Finding[] {
  const findings: Finding[] = [];

  for (const collision of subject.collisions) {
    if (collision.severity === 'severe') {
      findings.push({
        label: collision.hit.inciName,
        severity: 'avoid',
        reason: `You asked us to avoid ${collision.hit.inciName}.`,
        source: 'your sensitivities',
      });
    } else {
      findings.push({
        label: collision.hit.inciName,
        severity: 'caution',
        reason: `${collision.hit.inciName} is on your sensitivity list (${collision.severity}).`,
        source: 'your sensitivities',
      });
    }
  }

  const nonSevere = subject.collisions.filter((c) => c.severity !== 'severe');
  if (nonSevere.length >= 2 && !findings.some((f) => f.severity === 'avoid')) {
    findings.push({
      label: 'formula',
      severity: 'avoid',
      reason: 'Two or more ingredients on your sensitivity list.',
      source: 'your sensitivities',
    });
  }

  if (subject.highIrritantCount >= 2 && subject.concerns.includes('sensitivity')) {
    findings.push({
      label: 'formula',
      severity: 'avoid',
      reason: 'Two or more high-irritation ingredients, and you flagged sensitivity.',
      source: 'ingredient knowledge base',
    });
  }

  if (subject.comedogenicHits >= 2 && subject.concerns.includes('body_acne')) {
    findings.push({
      label: 'formula',
      severity: 'caution',
      reason: 'Contains several comedogenic ingredients and you flagged body acne.',
      source: 'ingredient knowledge base',
    });
  }

  if (subject.fragranceAllergen && subject.concerns.includes('sensitivity')) {
    findings.push({
      label: 'Fragrance allergens',
      severity: 'caution',
      reason: 'Contains fragrance allergens and you flagged sensitivity.',
      source: 'ingredient knowledge base',
    });
  }

  if (subject.beneficialCount >= 3) {
    findings.push({
      label: 'beneficial ingredients',
      severity: 'beneficial',
      reason: 'Contains three or more ingredients that suit your concerns.',
      source: 'ingredient knowledge base',
    });
  }

  return findings;
}

export function decideVerdict(parse: UsableParse, findings: readonly Finding[]): Verdict {
  const blocking = findings.find((finding) => finding.severity === 'avoid');
  if (blocking !== undefined) {
    return { kind: 'avoid', findings, cause: blocking };
  }

  const cautions = findings.filter((finding) => finding.severity === 'caution');
  const beneficial = findings.filter((finding) => finding.severity === 'beneficial');

  if (cautions.length === 0 && beneficial.length > 0) {
    return { kind: 'good', findings };
  }

  // `parse` is deliberately unused beyond its type: its presence is the precondition.
  void parse;
  return { kind: 'okay', findings, cautions };
}

export function explainVerdict(verdict: Verdict): string {
  switch (verdict.kind) {
    case 'good':
      return 'A good match for your skin.';
    case 'okay':
      return verdict.cautions.length === 0
        ? 'Workable, with nothing that stands out either way.'
        : `Workable, with ${verdict.cautions.length} thing${verdict.cautions.length === 1 ? '' : 's'} to watch.`;
    case 'avoid':
      return `Not a good match for you: ${verdict.cause.reason}`;
    case 'insufficient_evidence':
      return insufficientCopy(verdict.parse.reason);
  }
}

function insufficientCopy(reason: InsufficientReason): string {
  switch (reason) {
    case 'empty_label':
      return 'We could not find any text on this label. Try again with the list filling the frame.';
    case 'too_few_recognised':
      return 'We only recognised a few ingredients, so we will not guess. Try again with a closer, straighter photo.';
    case 'match_rate_too_low':
      return 'Too much of this label was unreadable to judge it fairly. Try again in better light.';
  }
}
