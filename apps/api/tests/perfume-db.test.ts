import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/close.js';
import { withUser } from '../src/db/client.js';
import { loadFragranceProfile, saveFragranceProfile } from '../src/rec/fragrance-profile.js';
import type { RecommendationRequest } from '../src/rec/types.js';
import { recommendPerfumesFor } from '../src/service/recommend-perfumes.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

async function seeded(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await probe.connect();
    const { rows } = await probe.query('SELECT count(*)::int AS n FROM v_perfume_recommendable');
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const request: RecommendationRequest = { kind: 'perfume', limit: 10, narrowing: {} };
const meta = { requestId: 'req-perf', day: '2026-11-02' };
const userId = randomUUID();
const ready = await seeded();

describe('scent quiz and perfume recommendations', { skip: ready ? false : 'database not seeded' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
      userId,
      `perf-${userId}@example.test`,
    ]);
    await admin.query(
      'INSERT INTO profiles (user_id, skin_type, concerns, climate_zone, budget_max_ngn) VALUES ($1, $2, $3, $4, $5)',
      [userId, 'dry', ['dryness'], 'hot_humid', 80_000],
    );
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    await admin.end();
    await closePools();
  });

  it('round-trips a scent profile, and editing a single answer keeps the rest', async () => {
    await withUser(userId, (client) =>
      saveFragranceProfile(client, userId, {
        familiesLiked: ['Floral', 'Fresh'],
        familiesDisliked: ['Gourmand'],
        notesLoved: ['Rose'],
        notesAvoided: ['Patchouli'],
        strength: 'strong',
        occasions: ['evening'],
        budgetMaxNgn: 60_000,
        quizVersion: 'quiz-1',
      }),
    );

    const stored = await withUser(userId, (client) => loadFragranceProfile(client, userId));
    assert.deepEqual(stored?.familiesLiked, ['Floral', 'Fresh']);
    assert.equal(stored?.strength, 'strong');

    await withUser(userId, (client) =>
      saveFragranceProfile(client, userId, {
        familiesLiked: ['Floral'],
        familiesDisliked: ['Gourmand'],
        notesLoved: ['Rose'],
        notesAvoided: ['Patchouli'],
        strength: 'strong',
        occasions: ['evening'],
        budgetMaxNgn: 60_000,
        quizVersion: 'quiz-1',
      }),
    );

    const edited = await withUser(userId, (client) => loadFragranceProfile(client, userId));
    assert.deepEqual(edited?.familiesLiked, ['Floral']);
    assert.deepEqual(edited?.familiesDisliked, ['Gourmand']);
    assert.equal(edited?.occasions[0], 'evening');
  });

  it('rejects a profile that both likes and dislikes the same family', async () => {
    await assert.rejects(
      () =>
        withUser(userId, (client) =>
          saveFragranceProfile(client, userId, {
            familiesLiked: ['Woody'],
            familiesDisliked: ['Woody'],
            notesLoved: [],
            notesAvoided: [],
            strength: 'moderate',
            occasions: [],
            budgetMaxNgn: null,
            quizVersion: 'quiz-1',
          }),
        ),
      (error: unknown) => (error as { code?: string }).code === '23514',
    );
  });

  it('serves perfume recommendations that respect the disliked family', async () => {
    const response = await recommendPerfumesFor(userId, request, meta);

    assert.ok(response.data.items.length > 0, 'expected at least one perfume');
    for (const item of response.data.items) {
      assert.equal(item.product.category, 'perfume');
    }

    const excludedFamilies = response.data.excluded.filter((item) => item.code === 'family_disliked');
    assert.ok(excludedFamilies.length > 0, 'the seed should contain a Gourmand perfume to exclude');
    assert.match(excludedFamilies[0]?.reason ?? '', /Gourmand/);
  });

  it('replays the same perfume ids on a repeat request', async () => {
    const first = await recommendPerfumesFor(userId, request, meta);
    const second = await recommendPerfumesFor(userId, request, meta);
    assert.deepEqual(
      first.data.items.map((item) => item.recommendation_id),
      second.data.items.map((item) => item.recommendation_id),
    );
  });

  it('falls back to neutral priors when no quiz exists', async () => {
    const other = randomUUID();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
      other,
      `perf-none-${other}@example.test`,
    ]);

    try {
      const response = await recommendPerfumesFor(other, request, meta);
      assert.ok(response.data.items.length > 0);
    } finally {
      await admin.query('DELETE FROM users WHERE id = $1', [other]);
    }
  });
});
