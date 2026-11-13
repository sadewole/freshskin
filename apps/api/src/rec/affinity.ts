/**
 * §14.2 feedbackAffinity, as one pure function.
 *
 * Laplace smoothing with a prior of 3 ("no opinion") over 5 pseudo-ratings, so a single angry
 * rating cannot bury a whole category and a brand-new user starts exactly neutral.
 */
export const PRIOR_RATING = 3;
export const PRIOR_COUNT = 5;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

export function feedbackAffinity(ratings: readonly number[]): number {
  const valid = ratings.filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
  const sum = valid.reduce((total, rating) => total + rating, 0);
  const smoothed = (sum + PRIOR_RATING * PRIOR_COUNT) / (valid.length + PRIOR_COUNT);
  // Map the 1..5 scale onto 0..1: 1 -> 0, 3 -> 0.5, 5 -> 1.
  return clamp01((smoothed - 1) / 4);
}

/** No data must read as neutral, not as dislike. */
export const NEUTRAL_AFFINITY = feedbackAffinity([]);
