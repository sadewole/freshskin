import type pg from 'pg';
import { withUser } from '../db/client.js';
import {
  assessAnalysis,
  requiresRetake,
  type CaptureQuality,
  type RejectCode,
  type RetakeReason,
  type SkinAnalysisResult,
  type TextureScores,
} from './analysis.js';

/**
 * Skin analysis persistence. Same shape as scans: a guarded UPDATE claims the lifecycle, so
 * two workers cannot both finish one analysis, and a refusal is stored as a refusal.
 */

export class AnalysisNotInFlight extends Error {
  constructor(analysisId: string) {
    super(`analysis ${analysisId} is not in flight`);
    this.name = 'AnalysisNotInFlight';
  }
}

export type CompleteOutcome =
  | { readonly status: 'complete'; readonly analysisId: string; readonly result: SkinAnalysisResult }
  | { readonly status: 'low_confidence'; readonly analysisId: string; readonly result: SkinAnalysisResult }
  | { readonly status: 'failed'; readonly analysisId: string; readonly code: RejectCode; readonly message: string }
  | { readonly status: 'retake'; readonly analysisId: string; readonly reason: RetakeReason };

export async function submitAnalysis(
  userId: string,
  input: { imageKey: string | null; captureMeta: CaptureQuality },
): Promise<{ analysisId: string }> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO skin_analyses (user_id, image_key, capture_meta, status)
       VALUES ($1, $2, $3::jsonb, 'queued')
       RETURNING id`,
      [userId, input.imageKey, JSON.stringify(input.captureMeta)],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('analysis insert returned no row');
    return { analysisId: id };
  });
}

export async function completeAnalysis(
  userId: string,
  analysisId: string,
  raw: unknown,
  capture: CaptureQuality,
  modelVersion = 'unknown',
): Promise<CompleteOutcome> {
  return withUser(userId, async (client) => {
    const claimed = await client.query(
      `UPDATE skin_analyses SET status = 'processing', updated_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'queued'`,
      [analysisId, userId],
    );

    if (claimed.rowCount === 0) {
      const { rows } = await client.query<{ status: string }>(
        'SELECT status FROM skin_analyses WHERE id = $1 AND user_id = $2',
        [analysisId, userId],
      );
      if (rows[0]?.status !== 'processing') throw new AnalysisNotInFlight(analysisId);
    }

    const assessment = assessAnalysis(raw);

    if (assessment.kind === 'rejected') {
      await finish(client, analysisId, userId, {
        status: 'failed',
        errorCode: assessment.code,
      });
      return { status: 'failed', analysisId, code: assessment.code, message: assessment.message };
    }

    // The bias guard: a confident reading of dark skin in thin light is exactly the case where
    // a wrong answer is most likely, so it is refused rather than stored.
    const retake = requiresRetake(assessment.result, capture);
    if (retake !== null) {
      await finish(client, analysisId, userId, { status: 'failed', errorCode: `retake:${retake}` });
      return { status: 'retake', analysisId, reason: retake };
    }

    const usable = assessment.kind === 'usable';

    await finish(client, analysisId, userId, {
      status: usable ? 'complete' : 'low_confidence',
      result: assessment.result,
      modelVersion,
    });

    if (usable) {
      // Profile wiring: the newest usable analysis becomes the ranking input. A row may not
      // exist yet, which is a no-op rather than an error.
      await client.query(
        `UPDATE profiles SET latest_analysis_id = $1, updated_at = now() WHERE user_id = $2`,
        [analysisId, userId],
      );
    }

    return usable
      ? { status: 'complete', analysisId, result: assessment.result }
      : { status: 'low_confidence', analysisId, result: assessment.result };
  });
}

async function finish(
  client: pg.PoolClient,
  analysisId: string,
  userId: string,
  input:
    | { status: 'failed'; errorCode: string }
    | { status: 'complete' | 'low_confidence'; result: SkinAnalysisResult; modelVersion: string },
): Promise<void> {
  if (input.status === 'failed') {
    const { rowCount } = await client.query(
      `UPDATE skin_analyses
          SET status = 'failed', error_code = $3, updated_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'processing'`,
      [analysisId, userId, input.errorCode],
    );
    if (rowCount === 0) throw new AnalysisNotInFlight(analysisId);
    return;
  }

  const result = input.result;
  const { rowCount } = await client.query(
    `UPDATE skin_analyses
        SET status = $3,
            tone_band = $4,
            ita_degrees = $5,
            undertone = $6,
            evenness_score = $7,
            texture_scores = $8::jsonb,
            concerns = $9,
            confidence = $10,
            evidence = $11,
            model_version = $12,
            updated_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'processing'`,
    [
      analysisId,
      userId,
      input.status,
      result.toneBand,
      result.itaDegrees,
      result.undertone,
      result.evennessScore,
      JSON.stringify(result.textureScores),
      result.concerns,
      result.confidence,
      result.evidence,
      input.modelVersion,
    ],
  );
  if (rowCount === 0) throw new AnalysisNotInFlight(analysisId);
}

export interface AnalysisRecord {
  readonly id: string;
  readonly status: string;
  readonly toneBand: string | null;
  readonly undertone: string | null;
  readonly evennessScore: number | null;
  readonly textureScores: TextureScores | null;
  readonly concerns: readonly string[];
  readonly confidence: number | null;
  readonly evidence: readonly string[];
  readonly errorCode: string | null;
  readonly imageKey: string | null;
  readonly createdAt: Date;
}

interface AnalysisRow {
  id: string;
  status: string;
  tone_band: string | null;
  undertone: string | null;
  evenness_score: number | null;
  texture_scores: TextureScores | null;
  concerns: string[] | null;
  confidence: string | null;
  evidence: string[] | null;
  error_code: string | null;
  image_key: string | null;
  created_at: Date;
}

const toRecord = (row: AnalysisRow): AnalysisRecord => ({
  id: row.id,
  status: row.status,
  toneBand: row.tone_band,
  undertone: row.undertone,
  evennessScore: row.evenness_score,
  textureScores: row.texture_scores,
  concerns: row.concerns ?? [],
  confidence: row.confidence === null ? null : Number(row.confidence),
  evidence: row.evidence ?? [],
  errorCode: row.error_code,
  imageKey: row.image_key,
  createdAt: row.created_at,
});

export async function getAnalysis(userId: string, analysisId: string): Promise<AnalysisRecord | null> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<AnalysisRow>(
      `SELECT id, status, tone_band, undertone, evenness_score, texture_scores, concerns,
              confidence, evidence, error_code, image_key, created_at
         FROM skin_analyses
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [analysisId, userId],
    );
    const row = rows[0];
    return row === undefined ? null : toRecord(row);
  });
}

export async function listAnalyses(userId: string, limit = 20): Promise<AnalysisRecord[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<AnalysisRow>(
      `SELECT id, status, tone_band, undertone, evenness_score, texture_scores, concerns,
              confidence, evidence, error_code, image_key, created_at
         FROM skin_analyses
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.map(toRecord);
  });
}

/**
 * Tombstones the row and clears the image immediately, then drops it from the profile if it
 * was the one rankings used.
 */
export async function deleteAnalysis(userId: string, analysisId: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE skin_analyses
          SET deleted_at = now(), image_key = NULL, image_deleted_at = now(), updated_at = now()
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [analysisId, userId],
    );
    if (rowCount === 0) return false;

    await client.query(
      `UPDATE profiles SET latest_analysis_id = NULL, updated_at = now()
        WHERE user_id = $1 AND latest_analysis_id = $2`,
      [userId, analysisId],
    );
    return true;
  });
}
