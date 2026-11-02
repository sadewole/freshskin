import type pg from 'pg';
import type { Plan } from './types.js';

/**
 * Persistence for recommendations and feedback. Everything takes a client already scoped by
 * `withUser`, so RLS is in force for every statement here.
 */

export type FeedbackAction = 'view' | 'save' | 'dismiss' | 'rate' | 'purchase_intent';
export type DismissReasonCode =
  | 'too_expensive'
  | 'wrong_scent'
  | 'wrong_skin'
  | 'already_own'
  | 'not_available'
  | 'other';

export interface FeedbackInput {
  readonly recommendationId: string;
  readonly action: FeedbackAction;
  readonly dismissReason?: DismissReasonCode;
  readonly rating?: number;
  readonly note?: string;
}

export type FeedbackOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'not_found' | 'invalid_rating' };

/**
 * Writes the served page and returns the real row ids. `ON CONFLICT DO NOTHING` makes a repeat
 * request a no-op: the same session cannot produce duplicate rows, so a refresh is a replay.
 */
export async function rememberRecommendations(
  client: pg.PoolClient,
  userId: string,
  plan: Plan,
): Promise<Map<string, string>> {
  for (const item of plan.items) {
    await client.query(
      `INSERT INTO recommendations
         (user_id, session_id, kind, product_id, rank, score, breakdown, reason_text,
          algorithm_version, profile_version)
       VALUES ($1, $2, 'cream', $3, $4, $5, $6::jsonb, $7, $8, $9)
       ON CONFLICT (session_id, product_id) DO NOTHING`,
      [
        userId,
        plan.meta.sessionId,
        item.product.id,
        item.rank,
        item.displayScore,
        JSON.stringify(item.terms),
        item.reason,
        plan.meta.algorithmVersion,
        plan.meta.profileVersion,
      ],
    );
  }

  const { rows } = await client.query<{ id: string; product_id: string }>(
    `SELECT id, product_id FROM recommendations
      WHERE session_id = $1 AND user_id = $2`,
    [plan.meta.sessionId, userId],
  );

  return new Map(rows.map((row) => [row.product_id, row.id]));
}

/** Ratings only; dismissals and views do not move the affinity term. */
export async function loadRatings(client: pg.PoolClient, userId: string): Promise<number[]> {
  const { rows } = await client.query<{ rating: number | null }>(
    `SELECT rating FROM feedback
      WHERE user_id = $1 AND action = 'rate' AND rating IS NOT NULL`,
    [userId],
  );
  return rows.flatMap((row) => (row.rating === null ? [] : [row.rating]));
}

/**
 * Records one action. RLS hides other users' recommendations, so the ownership check is a
 * plain select: a caller cannot attach feedback to a row they cannot see.
 */
export async function recordFeedback(
  client: pg.PoolClient,
  userId: string,
  input: FeedbackInput,
): Promise<FeedbackOutcome> {
  if (input.action === 'rate' && (input.rating === undefined || input.rating < 1 || input.rating > 5)) {
    return { ok: false, reason: 'invalid_rating' };
  }

  const { rows } = await client.query<{ id: string }>(
    'SELECT id FROM recommendations WHERE id = $1 AND user_id = $2',
    [input.recommendationId, userId],
  );
  if (rows.length === 0) return { ok: false, reason: 'not_found' };

  await client.query(
    `INSERT INTO feedback (recommendation_id, user_id, action, dismiss_reason, rating, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (recommendation_id, action) DO UPDATE SET
       dismiss_reason = COALESCE(EXCLUDED.dismiss_reason, feedback.dismiss_reason),
       rating         = COALESCE(EXCLUDED.rating, feedback.rating),
       note           = COALESCE(EXCLUDED.note, feedback.note),
       updated_at     = now()`,
    [
      input.recommendationId,
      userId,
      input.action,
      input.dismissReason ?? null,
      input.rating ?? null,
      input.note ?? null,
    ],
  );

  return { ok: true };
}

export interface StoredRecommendation {
  readonly id: string;
  readonly productId: string;
  readonly rank: number;
  readonly score: number;
  readonly reason: string;
}

export async function loadSession(
  client: pg.PoolClient,
  userId: string,
  sessionId: string,
): Promise<StoredRecommendation[]> {
  const { rows } = await client.query<{
    id: string;
    product_id: string;
    rank: number;
    score: string;
    reason_text: string;
  }>(
    `SELECT id, product_id, rank, score, reason_text
       FROM recommendations
      WHERE session_id = $1 AND user_id = $2
      ORDER BY rank`,
    [sessionId, userId],
  );

  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    rank: row.rank,
    score: Number(row.score),
    reason: row.reason_text,
  }));
}
