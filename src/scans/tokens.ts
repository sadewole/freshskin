import { jaroWinkler } from './jaro-winkler.js';
import type { ParsedToken } from './verdict.js';

/**
 * Turning label text into tokens (§13.4 steps 4-6), minus the OCR call itself.
 *
 * Deterministic on purpose: the fuzzy match, the OCR-confusion pass, and the refusal to invent
 * an ingredient are all testable without a vision vendor in the loop.
 */

export interface LexiconEntry {
  readonly ingredientId: string;
  readonly inciName: string;
  readonly aliases: readonly string[];
}

export type MatchMethod = 'exact' | 'alias' | 'fuzzy' | 'ocr_confusion' | 'none';

export interface TokenMatch {
  readonly ingredientId: string | null;
  readonly inciName: string | null;
  readonly confidence: number;
  readonly method: MatchMethod;
}

export const MATCH_THRESHOLD = 0.9;

/** Lowercase and strip anything that is not a letter or digit. */
export function normalise(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Repair the confusions OCR actually makes on small print. Applied to both sides before
 * comparing, so "rn" and "m" reach each other.
 */
export function repairOcrConfusions(value: string): string {
  return value
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/cl/g, 'd')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/5/g, 's')
    .replace(/8/g, 'b');
}

/**
 * Splits a label into candidate ingredient names. INCI lists are comma-separated, but OCR
 * often returns them one per line or semicolon-delimited, and marketing copy trails the list.
 */
export function splitLabel(rawText: string): string[] {
  return rawText
    .replace(/^\s*(ingredients?|inci)\s*[:\-]\s*/i, '')
    .split(/[,;\n\r]+/)
    .map((part) => part.replace(/\([^)]*\)/g, ' ').trim())
    .map((part) => part.replace(/\s+/g, ' '))
    .filter((part) => part.length >= 2 && part.length <= 80)
    .slice(0, 200);
}

interface Candidate {
  readonly ingredientId: string;
  readonly inciName: string;
  readonly value: string;
  readonly normalised: string;
  readonly isAlias: boolean;
}

function buildCandidates(lexicon: readonly LexiconEntry[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const entry of lexicon) {
    candidates.push({
      ingredientId: entry.ingredientId,
      inciName: entry.inciName,
      value: entry.inciName,
      normalised: normalise(entry.inciName),
      isAlias: false,
    });
    for (const alias of entry.aliases) {
      candidates.push({
        ingredientId: entry.ingredientId,
        inciName: entry.inciName,
        value: alias,
        normalised: normalise(alias),
        isAlias: true,
      });
    }
  }
  return candidates;
}

/**
 * Matches one token. Short strings only match exactly: fuzzy-matching a three-letter token
 * against a lexicon is how you get confident nonsense.
 */
export function matchToken(
  raw: string,
  lexicon: readonly LexiconEntry[],
  candidates: readonly Candidate[] = buildCandidates(lexicon),
): TokenMatch {
  const target = normalise(raw);
  if (target.length === 0) {
    return { ingredientId: null, inciName: null, confidence: 0, method: 'none' };
  }

  const exact = candidates.find((candidate) => candidate.normalised === target);
  if (exact !== undefined) {
    return {
      ingredientId: exact.ingredientId,
      inciName: exact.inciName,
      confidence: 1,
      method: exact.isAlias ? 'alias' : 'exact',
    };
  }

  if (target.length < 4) {
    return { ingredientId: null, inciName: null, confidence: 0, method: 'none' };
  }

  let best: { candidate: Candidate; score: number; confusion: boolean } | null = null;

  for (const candidate of candidates) {
    if (candidate.normalised.length === 0) continue;
    const direct = jaroWinkler(target, candidate.normalised);
    if (direct >= MATCH_THRESHOLD && (best === null || direct > best.score)) {
      best = { candidate, score: direct, confusion: false };
    }
  }

  if (best === null) {
    const repaired = repairOcrConfusions(target);
    for (const candidate of candidates) {
      const repairedCandidate = repairOcrConfusions(candidate.normalised);
      const score = jaroWinkler(repaired, repairedCandidate);
      if (score >= MATCH_THRESHOLD && (best === null || score > best.score)) {
        best = { candidate, score, confusion: true };
      }
    }
  }

  if (best === null) {
    return { ingredientId: null, inciName: null, confidence: 0, method: 'none' };
  }

  return {
    ingredientId: best.candidate.ingredientId,
    inciName: best.candidate.inciName,
    // An OCR-confusion match is slightly discounted: it is inference, not evidence.
    confidence: best.confusion ? Math.round(best.score * 0.95 * 1000) / 1000 : best.score,
    method: best.confusion ? 'ocr_confusion' : 'fuzzy',
  };
}

export function parseLabel(rawText: string, lexicon: readonly LexiconEntry[]): ParsedToken[] {
  const candidates = buildCandidates(lexicon);
  return splitLabel(rawText).map((raw) => ({
    raw,
    ingredientId: matchToken(raw, lexicon, candidates).ingredientId,
  }));
}

export function matchRate(tokens: readonly ParsedToken[]): number {
  if (tokens.length === 0) return 0;
  return tokens.filter((token) => token.ingredientId !== null).length / tokens.length;
}
