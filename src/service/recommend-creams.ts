import type pg from 'pg';
import { withUser } from '../db/client.js';
import { loadCreamCandidates } from '../catalogue/read-view.js';
import { recommend } from '../rec/pipeline.js';
import type { ClimateZone, RecommendationRequest, SkinType, ViewerFacts } from '../rec/types.js';
import type { Sensitivity, Severity } from '../safety/conflicts.js';
import { present, type WireResponse } from '../http/present.js';

/**
 * The composition root for GET /recommendations/creams. Everything below the handler but
 * nothing belonging to HTTP: one transaction, two view reads, one RLS-scoped read, one pure
 * pipeline call, one wire mapping.
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

async function loadViewer(
  client: pg.PoolClient,
  userId: string,
): Promise<{ viewer: ViewerFacts; profileVersion: string }> {
  const { rows } = await client.query<ProfileRow>(
    `SELECT skin_type, concerns, climate_zone, budget_max_ngn, updated_at
       FROM profiles WHERE user_id = $1`,
    [userId],
  );
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
      },
      profileVersion: 'no-profile',
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
    },
    profileVersion: row.updated_at.toISOString(),
  };
}

async function loadSensitivities(client: pg.PoolClient, userId: string): Promise<Sensitivity[]> {
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
    appliesTo: row.applies_to.filter((kind): kind is 'cream' | 'perfume' => kind === 'cream' || kind === 'perfume'),
  }));
}

export async function recommendCreamsFor(
  userId: string,
  request: RecommendationRequest,
  options: { requestId: string; day: string },
): Promise<WireResponse> {
  const started = performance.now();

  const plan = await withUser(userId, async (client) => {
    const { candidates, capped } = await loadCreamCandidates(client);
    const { viewer, profileVersion } = await loadViewer(client, userId);
    const sensitivities = await loadSensitivities(client, userId);

    return recommend({
      viewer,
      sensitivities,
      candidates,
      request,
      profileVersion,
      capped,
      day: options.day,
    });
  });

  return present(plan, {
    requestId: options.requestId,
    servedInMs: Math.round(performance.now() - started),
    cached: false,
  });
}
