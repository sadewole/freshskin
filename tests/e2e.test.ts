import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/client.js';
import { recommendCreamsFor } from '../src/service/recommend-creams.js';

/**
 * The whole slice, end to end: RLS-scoped reads, gated views, the pipeline, the wire mapping.
 * Requires a migrated and seeded database (`pnpm db:up && pnpm db:migrate && pnpm db:seed`).
 */
const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

const admin = new pg.Client({ connectionString: ADMIN_URL });

async function catalogueReady(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await probe.connect();
    const { rows } = await probe.query(
      `SELECT count(*)::int AS n FROM v_product_recommendable WHERE category = 'cream'`,
    );
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const seeded = await catalogueReady();
const userId = randomUUID();
const day = '2026-11-02';
const request = { kind: 'cream' as const, limit: 10, narrowing: {} };

describe('recommendation service', { skip: seeded ? false : 'database not migrated/seeded' }, () => {
  before(async () => {
    await admin.connect();
    const { rows } = await admin.query<{ id: string }>(
      `SELECT id FROM ingredients WHERE inci_name = 'Fragrance' LIMIT 1`,
    );
    const fragranceId = rows[0]?.id;
    assert.ok(fragranceId, 'seed must include a Fragrance ingredient');

    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
      userId,
      `e2e-${userId}@example.test`,
    ]);
    await admin.query(
      'INSERT INTO profiles (user_id, skin_type, concerns, climate_zone, budget_max_ngn) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'dry', ['dryness'], 'hot_humid', 20_000],
    );
    await admin.query(
      `INSERT INTO sensitivities (user_id, ingredient_id, severity, applies_to) VALUES ($1, $2, 'severe', $3)`,
      [userId, fragranceId, ['cream']],
    );
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    await admin.end();
    await closePools();
  });

  it('serves ranked, explained recommendations from the gated views', async () => {
    const response = await recommendCreamsFor(userId, request, { requestId: 'req-e2e-1', day });

    assert.ok(response.data.items.length > 0, 'expected at least one recommendation');
    const first = response.data.items[0];
    assert.ok(first);
    assert.ok(first.reason.length > 0 && first.reason.length <= 140);
    assert.ok(first.score >= 0 && first.score <= 100);
    assert.equal(response.data.profile_version.length > 0, true);
  });

  it('never returns a product it excluded, and says why it excluded it', async () => {
    const response = await recommendCreamsFor(userId, request, { requestId: 'req-e2e-2', day });

    const excludedIds = new Set(response.data.excluded.map((item) => item.product_id));
    for (const item of response.data.items) {
      assert.equal(excludedIds.has(item.product.id), false, `${item.product.id} both kept and dropped`);
    }

    const allergenBlocks = response.data.excluded.filter((item) => item.code === 'sensitivity_severe');
    assert.ok(allergenBlocks.length > 0, 'a severe sensitivity must block at least one seeded product');
    assert.match(allergenBlocks[0]?.reason ?? '', /Fragrance/);
  });

  it('replays identically for the same inputs, so a refresh is not a new session', async () => {
    const first = await recommendCreamsFor(userId, request, { requestId: 'req-e2e-3', day });
    const second = await recommendCreamsFor(userId, request, { requestId: 'req-e2e-4', day });

    assert.equal(first.data.session_id, second.data.session_id);
    assert.deepEqual(
      first.data.items.map((item) => item.recommendation_id),
      second.data.items.map((item) => item.recommendation_id),
    );
  });

  it('respects the budget narrowing', async () => {
    const response = await recommendCreamsFor(
      userId,
      { ...request, narrowing: { maxPriceNgn: 8_000 } },
      { requestId: 'req-e2e-5', day },
    );

    for (const item of response.data.items) {
      assert.ok((item.product.price_ngn ?? 0) <= 8_000, `${item.product.name} over budget`);
    }
    assert.ok(
      response.data.excluded.some((item) => item.code === 'over_budget'),
      'expected the seed to contain a product above the limit',
    );
  });

  it('serves inside the 800ms p95 budget on 127 eligible products', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const started = performance.now();
      await recommendCreamsFor(userId, request, { requestId: `req-perf-${i}`, day });
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)] ?? Infinity;
    assert.ok(p95 < 800, `p95 ${Math.round(p95)}ms exceeded the 800ms budget`);
  });
});
