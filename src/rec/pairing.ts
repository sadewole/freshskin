/**
 * Cream and perfume pairing (§5.4, FR-9).
 *
 * The catalogue does not yet carry a scent family for creams, so the pairing decision rests on
 * the one honest signal we have: whether the cream is fragranced at all. Lying about a richer
 * match would be worse than admitting the limitation in the copy.
 */

export interface CreamForPairing {
  readonly productId: string;
  readonly name: string;
  readonly fragranceFree: boolean | null;
}

export interface PerfumeForPairing {
  readonly productId: string;
  readonly name: string;
  readonly familyNames: readonly string[];
}

export interface PairingSuggestion {
  readonly creamId: string;
  readonly perfumeId: string;
  readonly score: number;
  readonly rationale: string;
  readonly clash: boolean;
}

export function scorePairing(cream: CreamForPairing, perfume: PerfumeForPairing): PairingSuggestion {
  const base = { creamId: cream.productId, perfumeId: perfume.productId };

  if (cream.fragranceFree === true) {
    return {
      ...base,
      score: 1,
      rationale: `Unscented base, so ${perfume.name} leads the layering.`,
      clash: false,
    };
  }

  if (cream.fragranceFree === false) {
    return {
      ...base,
      score: 0.45,
      rationale: `This cream is scented and may compete with ${perfume.name}.`,
      clash: true,
    };
  }

  return {
    ...base,
    score: 0.6,
    rationale: `We do not know whether this cream is scented, so layer it lightly.`,
    clash: false,
  };
}

/**
 * The best pairings for one perfume, best first. A clash is still offered rather than hidden,
 * because the user may already own that cream; the warning is the point.
 */
export function bestPairings(
  creams: readonly CreamForPairing[],
  perfume: PerfumeForPairing,
  limit = 3,
): PairingSuggestion[] {
  return creams
    .map((cream) => scorePairing(cream, perfume))
    .sort((a, b) => b.score - a.score || a.creamId.localeCompare(b.creamId))
    .slice(0, limit);
}
