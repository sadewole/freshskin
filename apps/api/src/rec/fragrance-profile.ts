import type pg from 'pg';
import type { FragrancePreferences, StrengthPreference } from './types.js';

/**
 * The scent quiz's persistence. Families are stored by canonical name (decision D1), and the
 * table rejects a family that is both liked and disliked, so the recommender cannot inherit a
 * contradictory profile.
 */

export interface FragranceProfileInput {
  readonly familiesLiked: readonly string[];
  readonly familiesDisliked: readonly string[];
  readonly notesLoved: readonly string[];
  readonly notesAvoided: readonly string[];
  readonly strength: StrengthPreference;
  readonly occasions: readonly string[];
  readonly budgetMaxNgn: number | null;
  readonly quizVersion: string;
}

export async function saveFragranceProfile(
  client: pg.PoolClient,
  userId: string,
  input: FragranceProfileInput,
): Promise<void> {
  await client.query(
    `INSERT INTO fragrance_profiles
       (user_id, families_liked, families_disliked, notes_loved, notes_avoided,
        strength_pref, occasions, budget_max_ngn, quiz_version, completed_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
     ON CONFLICT (user_id) DO UPDATE SET
       families_liked     = EXCLUDED.families_liked,
       families_disliked  = EXCLUDED.families_disliked,
       notes_loved        = EXCLUDED.notes_loved,
       notes_avoided      = EXCLUDED.notes_avoided,
       strength_pref      = EXCLUDED.strength_pref,
       occasions          = EXCLUDED.occasions,
       budget_max_ngn     = EXCLUDED.budget_max_ngn,
       quiz_version       = EXCLUDED.quiz_version,
       completed_at       = COALESCE(fragrance_profiles.completed_at, now()),
       updated_at         = now()`,
    [
      userId,
      input.familiesLiked,
      input.familiesDisliked,
      input.notesLoved,
      input.notesAvoided,
      input.strength,
      input.occasions,
      input.budgetMaxNgn,
      input.quizVersion,
    ],
  );
}

interface FragranceProfileRow {
  families_liked: string[];
  families_disliked: string[];
  notes_loved: string[];
  notes_avoided: string[];
  strength_pref: StrengthPreference;
  occasions: string[];
  budget_max_ngn: number | null;
}

export async function loadFragranceProfile(
  client: pg.PoolClient,
  userId: string,
): Promise<FragrancePreferences | null> {
  const { rows } = await client.query<FragranceProfileRow>(
    `SELECT families_liked, families_disliked, notes_loved, notes_avoided,
            strength_pref, occasions, budget_max_ngn
       FROM fragrance_profiles WHERE user_id = $1`,
    [userId],
  );

  const row = rows[0];
  if (row === undefined) return null;

  return {
    familiesLiked: row.families_liked,
    familiesDisliked: row.families_disliked,
    notesLoved: row.notes_loved,
    notesAvoided: row.notes_avoided,
    strength: row.strength_pref,
    occasions: row.occasions,
    budgetMaxNgn: row.budget_max_ngn,
  };
}
