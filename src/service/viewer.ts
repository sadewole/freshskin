import type pg from 'pg';
import { loadFragranceProfile } from '../rec/fragrance-profile.js';
import type { ClimateZone, SkinType, ViewerFacts } from '../rec/types.js';
import type { Sensitivity, Severity } from '../safety/conflicts.js';

/**
 * Everything the pipeline needs to know about who is asking.
 *
 * The newest usable skin analysis feeds the ranking: it supplies concerns when the profile has
 * none, and it resolves a `skin_type` of `unsure` from measured hydration. That is what makes a
 * photo change a recommendation rather than only decorating a profile page.
 */

interface ProfileRow {
  skin_type: SkinType;
  concerns: string[];
  climate_zone: ClimateZone;
  budget_max_ngn: number | null;
  updated_at: Date;
}

interface LatestAnalysisRow {
  id: string;
  concerns: string[] | null;
  texture_scores: { hydration?: number } | null;
  created_at: Date;
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

/** Hydration is the only texture signal a cream recommendation can act on today. */
export function skinTypeFromHydration(hydration: number | undefined, fallback: SkinType): SkinType {
  if (fallback !== 'unsure') return fallback;
  if (hydration === undefined) return 'unsure';
  if (hydration < 45) return 'dry';
  if (hydration > 65) return 'oily';
  return 'normal';
}

export async function loadViewer(client: pg.PoolClient, userId: string): Promise<LoadedViewer> {
  const profileResult = await client.query<ProfileRow>(
    `SELECT skin_type, concerns, climate_zone, budget_max_ngn, updated_at
       FROM profiles WHERE user_id = $1`,
    [userId],
  );

  const analysisResult = await client.query<LatestAnalysisRow>(
    `SELECT id, concerns, texture_scores, created_at
       FROM skin_analyses
      WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId],
  );

  const [fragrance, profile, analysis] = [
    await loadFragranceProfile(client, userId),
    profileResult.rows[0],
    analysisResult.rows[0],
  ];

  const analysisTag = analysis === undefined ? 'no-analysis' : `analysis:${analysis.id}`;
  const quizTag = fragrance === null ? 'no-quiz' : 'quiz';

  if (profile === undefined) {
    return {
      viewer: {
        userId,
        skinType: analysis === undefined ? 'unsure' : skinTypeFromHydration(analysis.texture_scores?.hydration, 'unsure'),
        concerns: analysis?.concerns ?? [],
        climateZone: 'hot_humid',
        budgetMaxNgn: null,
        feedbackAffinity: 0.5,
        fragrance,
      },
      profileVersion: `${analysisTag}|${quizTag}`,
    };
  }

  const concerns = profile.concerns.length > 0 ? profile.concerns : (analysis?.concerns ?? []);

  return {
    viewer: {
      userId,
      skinType: skinTypeFromHydration(analysis?.texture_scores?.hydration, profile.skin_type),
      concerns,
      climateZone: profile.climate_zone,
      budgetMaxNgn: profile.budget_max_ngn,
      feedbackAffinity: 0.5,
      fragrance,
    },
    profileVersion: `${profile.updated_at.toISOString()}|${analysisTag}|${quizTag}`,
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
