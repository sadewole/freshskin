/**
 * "Similar to" search (§14.3, FR-8). Pure note arithmetic: no model, no user profile, so the
 * same anchor always produces the same neighbours and a reviewer can check the maths.
 */

export interface ScentProfile {
  readonly noteNames: readonly string[];
  readonly heartAndBaseNotes: readonly string[];
  readonly familyNames: readonly string[];
  readonly longevity: number;
  readonly projection: number;
}

export type SimilarityLabel = 'very_close' | 'close' | 'loosely_similar' | 'not_similar';

export interface Similarity {
  readonly score: number;
  readonly sharedNotes: readonly string[];
  readonly label: SimilarityLabel;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const weightOf = (profile: ScentProfile, note: string): number =>
  profile.heartAndBaseNotes.includes(note) ? 1.3 : 1;

/** Weighted cosine over note sets, so heart and base notes count for more than top notes. */
export function noteCosine(a: ScentProfile, b: ScentProfile): number {
  if (a.noteNames.length === 0 || b.noteNames.length === 0) return 0;

  const shared = a.noteNames.filter((note) => b.noteNames.includes(note));
  if (shared.length === 0) return 0;

  const dot = shared.reduce((sum, note) => sum + weightOf(a, note) * weightOf(b, note), 0);
  const normA = Math.sqrt(a.noteNames.reduce((sum, note) => sum + weightOf(a, note) ** 2, 0));
  const normB = Math.sqrt(b.noteNames.reduce((sum, note) => sum + weightOf(b, note) ** 2, 0));

  return clamp01(dot / (normA * normB));
}

export function familyMatch(a: ScentProfile, b: ScentProfile): number {
  if (a.familyNames.length === 0 || b.familyNames.length === 0) return 0;
  const shared = a.familyNames.filter((family) => b.familyNames.includes(family)).length;
  return clamp01(shared / Math.max(a.familyNames.length, b.familyNames.length));
}

/** "Accords" are approximated by Jaccard overlap until the catalogue carries real accord data. */
export function accordMatch(a: ScentProfile, b: ScentProfile): number {
  if (a.noteNames.length === 0 || b.noteNames.length === 0) return 0;
  const shared = a.noteNames.filter((note) => b.noteNames.includes(note)).length;
  const union = new Set([...a.noteNames, ...b.noteNames]).size;
  return clamp01(shared / union);
}

export function performanceMatch(a: ScentProfile, b: ScentProfile): number {
  const longevity = 1 - Math.abs(a.longevity - b.longevity) / 4;
  const projection = 1 - Math.abs(a.projection - b.projection) / 4;
  return clamp01((longevity + projection) / 2);
}

export function labelFor(score: number): SimilarityLabel {
  if (score >= 0.8) return 'very_close';
  if (score >= 0.65) return 'close';
  if (score >= 0.5) return 'loosely_similar';
  return 'not_similar';
}

export function similarity(anchor: ScentProfile, candidate: ScentProfile): Similarity {
  const note = noteCosine(anchor, candidate);
  const score =
    0.55 * note +
    0.2 * familyMatch(anchor, candidate) +
    0.15 * accordMatch(anchor, candidate) +
    0.1 * performanceMatch(anchor, candidate);

  return {
    score: Math.round(score * 1000) / 1000,
    sharedNotes: anchor.noteNames.filter((name) => candidate.noteNames.includes(name)),
    label: labelFor(score),
  };
}

export interface SimilarCandidate {
  readonly productId: string;
  readonly priceNgn: number | null;
  readonly profile: ScentProfile;
}

export interface SimilarResult {
  readonly productId: string;
  readonly score: number;
  readonly label: SimilarityLabel;
  readonly sharedNotes: readonly string[];
  readonly priceDeltaNgn: number | null;
}

/**
 * Ranks neighbours of an anchor. The anchor is excluded by id, and `cheaperOnly` filters by
 * price *before* ranking so the result is a cheap list, not a ranked list that happens to be
 * cheap at the top.
 */
export function findSimilar(
  anchor: { productId: string; priceNgn: number | null; profile: ScentProfile },
  candidates: readonly SimilarCandidate[],
  options: { cheaperOnly?: boolean; limit?: number } = {},
): SimilarResult[] {
  const limit = options.limit ?? 8;

  return candidates
    .filter((candidate) => candidate.productId !== anchor.productId)
    .filter((candidate) =>
      options.cheaperOnly === true
        ? candidate.priceNgn !== null && anchor.priceNgn !== null && candidate.priceNgn < anchor.priceNgn
        : true,
    )
    .map((candidate) => {
      const result = similarity(anchor.profile, candidate.profile);
      return {
        productId: candidate.productId,
        score: result.score,
        label: result.label,
        sharedNotes: result.sharedNotes,
        priceDeltaNgn:
          candidate.priceNgn === null || anchor.priceNgn === null
            ? null
            : candidate.priceNgn - anchor.priceNgn,
      };
    })
    .filter((result) => result.label !== 'not_similar')
    .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId))
    .slice(0, limit);
}
