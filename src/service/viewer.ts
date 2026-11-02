import type pg from 'pg';
import { loadFragranceProfile } from '../rec/fragrance-profile.js';
import type { ClimateZone, SkinType, ViewerFacts } from '../rec/types.js';
import type { Sensitivity, Severity } from '../safety/conflicts.js';

/**
 * Everything the pipeline needs to know about who is asking. Both recommendation services
 * share it, so a cream and a perfume request can never disagree about the same profile.
 */

interface ProfileRow {
  skin_type: SkinType;
  concerns: string[];
  climate_zone: ClimateZone;
  budget_max_ngn: number | null;
  updated_at: Date;
}

interface SensitivityRow {
  id: string;
  ingredient_id: string | null;
  free_text: string | null;
  severity: Severity;
  applies_to: string[];
}

export interface LoadedViewer {
  readonly viewer: ViewerFacts;
  readonly profileVersion: string;
}

export async function loadViewer(client: pg.PoolClient, userId: string): Promise<LoadedViewer> {
  const { rows } = await client.query<ProfileRow>(
    `SELECT skin_type, concerns, climate_zone, budget_max_ngn, updated_at
       FROM profiles WHERE user_id = $1`,
    [userId],
  );

  const fragrance = await loadFragranceProfile(client, userId);
  const row = rows[0];

  if (row === undefined) {
    return {
      viewer: {
        userId,
        skinType: 'unsure',
        concerns: [],
        climateZone: 'hot_humid',
        budgetMaxNgn: null,
        feedbackAffinity: 0.5,
        fragrance,
      },
      profileVersion: fragrance === null ? 'no-profile' : 'quiz-only',
    };
  }

  return {
    viewer: {
      userId,
      skinType: row.skin_type,
      concerns: row.concerns,
      climateZone: row.climate_zone,
      budgetMaxNgn: row.budget_max_ngn,
      feedbackAffinity: 0.5,
      fragrance,
    },
    // The quiz changes recommendations, so it belongs in the version a stored session is keyed on.
    profileVersion: `${row.updated_at.toISOString()}|${fragrance === null ? 'no-quiz' : 'quiz'}`,
  };
}

export async function loadSensitivities(
  client: pg.PoolClient,
  userId: string,
): Promise<Sensitivity[]> {
  const { rows } = await client.query<SensitivityRow>(
    `SELECT id, ingredient_id, free_text, severity, applies_to
       FROM sensitivities
      WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId],
  );

  return rows.map((row) => ({
    id: row.id,
    ingredientId: row.ingredient_id,
    freeText: row.free_text,
    severity: row.severity,
    appliesTo: row.applies_to.filter(
      (kind): kind is 'cream' | 'perfume' => kind === 'cream' || kind === 'perfume',
    ),
  }));
}
