import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/close.js';
import { withUser } from '../src/db/client.js';
import { feedbackAffinity, NEUTRAL_AFFINITY } from '../src/rec/affinity.js';
import { loadRatings, recordFeedback } from '../src/rec/store.js';
import { recommendCreamsFor } from '../src/service/recommend-creams.js';
import type { RecommendationRequest } from '../src/rec/types.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

async function seededCatalogue(): Promise<boolean> {
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

const request: RecommendationRequest = { kind: 'cream', limit: 5, narrowing: {} };
const meta = { requestId: 'req-fb', day: '2026-11-02' };

const userA = randomUUID();
const userB = randomUUID();
const seeded = await seededCatalogue();

describe('recommendation persistence and feedback', { skip: seeded ? false : 'database not seeded' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)', [
      userA,
      `fb-a-${userA}@example.test`,
      userB,
      `fb-b-${userB}@example.test`,
    ]);
    await admin.query(
      'INSERT INTO profiles (user_id, skin_type, concerns, climate_zone, budget_max_ngn) VALUES ($1, $2, $3, $4, $5)',
      [userA, 'dry', ['dryness'], 'hot_humid', 20_000],
    );
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
    await admin.end();
    await closePools();
  });

  it('returns ids that exist, and replays them on a repeat request', async () => {
    const first = await recommendCreamsFor(userA, request, meta);
    const second = await recommendCreamsFor(userA, request, meta);

    assert.ok(first.data.items.length > 0);
    assert.deepEqual(
      first.data.items.map((item) => item.recommendation_id),
      second.data.items.map((item) => item.recommendation_id),
    );

    const { rows } = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM recommendations WHERE user_id = $1',
      [userA],
    );
    assert.equal(rows[0]?.n, first.data.items.length, 'a replay must not duplicate rows');

    for (const item of first.data.items) {
      const found = await admin.query('SELECT id FROM recommendations WHERE id = $1', [
        item.recommendation_id,
      ]);
      assert.equal(found.rowCount, 1, `wire id ${item.recommendation_id} has no row`);
    }
  });

  it('stores the reason verbatim, so a refresh cannot reword it', async () => {
    const response = await recommendCreamsFor(userA, request, meta);
    const first = response.data.items[0];
    assert.ok(first);

    const { rows } = await admin.query<{ reason_text: string }>(
      'SELECT reason_text FROM recommendations WHERE id = $1',
      [first.recommendation_id],
    );
    assert.equal(rows[0]?.reason_text, first.reason);
  });

  it('records an action once, and lets a rating be changed', async () => {
    const response = await recommendCreamsFor(userA, request, meta);
    const target = response.data.items[0];
    assert.ok(target);

    await withUser(userA, (client) =>
      recordFeedback(client, userA, { recommendationId: target.recommendation_id, action: 'view' }),
    );
    await withUser(userA, (client) =>
      recordFeedback(client, userA, { recommendationId: target.recommendation_id, action: 'view' }),
    );

    const views = await admin.query(
      `SELECT count(*)::int AS n FROM feedback WHERE recommendation_id = $1 AND action = 'view'`,
      [target.recommendation_id],
    );
    assert.equal(views.rows[0]?.n, 1, 'the same action twice must not create two rows');

    await withUser(userA, (client) =>
      recordFeedback(client, userA, {
        recommendationId: target.recommendation_id,
        action: 'rate',
        rating: 5,
      }),
    );
    await withUser(userA, (client) =>
      recordFeedback(client, userA, {
        recommendationId: target.recommendation_id,
        action: 'rate',
        rating: 3,
      }),
    );

    const rating = await admin.query<{ rating: number; n: number }>(
      `SELECT rating, count(*) OVER ()::int AS n FROM feedback
        WHERE recommendation_id = $1 AND action = 'rate'`,
      [target.recommendation_id],
    );
    assert.equal(rating.rows[0]?.rating, 3, 'a re-rating updates in place');
    assert.equal(rating.rows[0]?.n, 1);
  });

  it('refuses feedback on a recommendation the user cannot see', async () => {
    const others = await recommendCreamsFor(userB, request, meta);
    const target = others.data.items[0];
    assert.ok(target);

    const outcome = await withUser(userA, (client) =>
      recordFeedback(client, userA, { recommendationId: target.recommendation_id, action: 'save' }),
    );
    assert.deepEqual(outcome, { ok: false, reason: 'not_found' });

    const leaked = await admin.query(
      'SELECT count(*)::int AS n FROM feedback WHERE recommendation_id = $1',
      [target.recommendation_id],
    );
    assert.equal(leaked.rows[0]?.n, 0, 'another user must not be able to attach feedback');
  });

  it('rejects a rating outside the 1..5 scale before touching the database', async () => {
    const response = await recommendCreamsFor(userA, request, meta);
    const target = response.data.items[0];
    assert.ok(target);

    const outcome = await withUser(userA, (client) =>
      recordFeedback(client, userA, {
        recommendationId: target.recommendation_id,
        action: 'rate',
        rating: 9,
      }),
    );
    assert.deepEqual(outcome, { ok: false, reason: 'invalid_rating' });
  });

  it('moves the affinity term once the user has rated', async () => {
    const response = await recommendCreamsFor(userA, request, meta);
    for (const item of response.data.items) {
      await withUser(userA, (client) =>
        recordFeedback(client, userA, {
          recommendationId: item.recommendation_id,
          action: 'rate',
          rating: 5,
        }),
      );
    }

    const ratings = await withUser(userA, (client) => loadRatings(client, userA));
    assert.equal(ratings.length, response.data.items.length);
    assert.ok(feedbackAffinity(ratings) > NEUTRAL_AFFINITY);
  });
});
