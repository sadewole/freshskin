import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools, withUser } from '../src/db/client.js';
import { presentAnalysis } from '../src/http/present-analysis.js';
import { purgeExpiredImages } from '../src/retention/purge.js';
import {
  completeAnalysis,
  deleteAnalysis,
  getAnalysis,
  listAnalyses,
  submitAnalysis,
  AnalysisNotInFlight,
} from '../src/skin/service.js';
import { loadViewer } from '../src/service/viewer.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

async function reachable(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const raw = (over: Record<string, unknown> = {}) => ({
  ita_degrees: -20,
  undertone: 'warm',
  evenness_score: 62,
  texture_scores: { hydration: 20, roughness: 61, flakiness: 40 },
  concerns: ['dryness'],
  confidence: 0.78,
  evidence: ['visible flaking on the upper arm'],
  ...over,
});

const capture = (over: Record<string, number> = {}) => ({
  brightness: 140,
  glareFraction: 0,
  blurScore: 300,
  ...over,
});

const userId = randomUUID();
const otherId = randomUUID();
const hasDb = await reachable();

describe('skin analysis persistence', { skip: hasDb ? false : 'database unreachable' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)', [
      userId,
      `skin-${userId}@example.test`,
      otherId,
      `skin-other-${otherId}@example.test`,
    ]);
    await admin.query(
      `INSERT INTO profiles (user_id, skin_type, concerns, climate_zone) VALUES ($1, 'unsure', '{}', 'hot_humid')`,
      [userId],
    );
    await admin.query(
      `INSERT INTO consent_records (user_id, kind, policy_version, granted)
       VALUES ($1, 'image_processing', '2026-11-01', true), ($2, 'image_processing', '2026-11-01', true)`,
      [userId, otherId],
    );
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherId]]);
    await admin.end();
    await closePools();
  });

  it('stores a usable analysis and makes it the profile input', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-1', captureMeta: capture() });
    const outcome = await completeAnalysis(userId, analysisId, raw(), capture(), 'model-1');

    assert.equal(outcome.status, 'complete');
    assert.equal(outcome.status === 'complete' && outcome.result.toneBand, 'V');

    const stored = await getAnalysis(userId, analysisId);
    assert.equal(stored?.status, 'complete');
    assert.equal(stored?.textureScores?.hydration, 20);

    const latest = await admin.query<{ latest_analysis_id: string | null }>(
      'SELECT latest_analysis_id FROM profiles WHERE user_id = $1',
      [userId],
    );
    assert.equal(latest.rows[0]?.latest_analysis_id, analysisId);
  });

  it('derives a skin type from hydration when the profile said unsure', async () => {
    const { viewer } = await withUser(userId, (client) => loadViewer(client, userId));
    assert.equal(viewer.skinType, 'dry');
    assert.deepEqual(viewer.concerns, ['dryness']);
  });

  it('stores a low-confidence analysis but does not rank on it', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-2', captureMeta: capture() });
    const before = await admin.query<{ latest_analysis_id: string | null }>(
      'SELECT latest_analysis_id FROM profiles WHERE user_id = $1',
      [userId],
    );

    const outcome = await completeAnalysis(userId, analysisId, raw({ confidence: 0.5 }), capture());
    assert.equal(outcome.status, 'low_confidence');

    const stored = await getAnalysis(userId, analysisId);
    assert.equal(stored?.status, 'low_confidence');

    const after = await admin.query<{ latest_analysis_id: string | null }>(
      'SELECT latest_analysis_id FROM profiles WHERE user_id = $1',
      [userId],
    );
    assert.equal(after.rows[0]?.latest_analysis_id, before.rows[0]?.latest_analysis_id);
  });

  it('refuses dark skin read in marginal light, and says why', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-3', captureMeta: capture({ brightness: 75 }) });
    const outcome = await completeAnalysis(
      userId,
      analysisId,
      raw({ tone_band: 'VI', ita_degrees: -45 }),
      capture({ brightness: 75 }),
    );

    assert.equal(outcome.status, 'retake');
    assert.equal(outcome.status === 'retake' && outcome.reason, 'dark_skin_marginal_light');

    const stored = await getAnalysis(userId, analysisId);
    assert.ok(stored);
    const wire = presentAnalysis(stored, { requestId: 'r1' });
    assert.equal(wire.data.retake.needed, true);
    assert.match(wire.data.retake.reason ?? '', /even light/);
    assert.equal(wire.data.status, 'failed');
  });

  it('records a non-skin photo as a failure, not an analysis', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-4', captureMeta: capture() });
    const outcome = await completeAnalysis(userId, analysisId, raw({ subject: 'not_skin' }), capture());
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.status === 'failed' && outcome.code, 'not_skin');

    const stored = await getAnalysis(userId, analysisId);
    assert.equal(stored?.status, 'failed');
    assert.equal(stored?.toneBand, null);
  });

  it('lets exactly one worker finish an analysis', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-5', captureMeta: capture() });
    await completeAnalysis(userId, analysisId, raw(), capture());

    await assert.rejects(
      () => completeAnalysis(userId, analysisId, raw(), capture()),
      (error: unknown) => error instanceof AnalysisNotInFlight,
    );
  });

  it('hides an analysis from another user', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-6', captureMeta: capture() });
    assert.equal(await getAnalysis(otherId, analysisId), null);
    assert.deepEqual(await listAnalyses(otherId), []);
  });

  it('tombstones on delete, clears the image, and stops ranking on it', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-7', captureMeta: capture() });
    await completeAnalysis(userId, analysisId, raw(), capture());

    assert.equal(await deleteAnalysis(userId, analysisId), true);
    assert.equal(await getAnalysis(userId, analysisId), null);

    const row = await admin.query<{ image_key: string | null; image_deleted_at: Date | null; deleted_at: Date | null }>(
      'SELECT image_key, image_deleted_at, deleted_at FROM skin_analyses WHERE id = $1',
      [analysisId],
    );
    assert.equal(row.rows[0]?.image_key, null);
    assert.ok(row.rows[0]?.image_deleted_at);
    assert.ok(row.rows[0]?.deleted_at);

    const latest = await admin.query<{ latest_analysis_id: string | null }>(
      'SELECT latest_analysis_id FROM profiles WHERE user_id = $1',
      [userId],
    );
    assert.equal(latest.rows[0]?.latest_analysis_id, null);

    assert.equal(await deleteAnalysis(userId, analysisId), false, 'deleting twice is a no-op');
  });

  it('purges images older than 24 hours exactly once', async () => {
    const { analysisId } = await submitAnalysis(userId, { imageKey: 'img-old', captureMeta: capture() });
    await admin.query(
      `UPDATE skin_analyses SET created_at = now() - interval '25 hours' WHERE id = $1`,
      [analysisId],
    );

    const first = await purgeExpiredImages();
    assert.ok(first.purged >= 1, `expected at least one purge, got ${first.purged}`);

    const row = await admin.query<{ image_key: string | null }>(
      'SELECT image_key FROM skin_analyses WHERE id = $1',
      [analysisId],
    );
    assert.equal(row.rows[0]?.image_key, null);

    const second = await purgeExpiredImages();
    assert.equal(second.purged, 0, 'a second run inside the same window must be a no-op');
  });
});
