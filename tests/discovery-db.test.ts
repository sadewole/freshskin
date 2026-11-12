import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/close.js';
import { presentPairing, presentSimilar } from '../src/http/present-discovery.js';
import { recommendPairings, recommendSimilar } from '../src/service/discovery.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

async function seeded(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await probe.connect();
    const { rows } = await probe.query('SELECT count(*)::int AS n FROM v_perfume_recommendable');
    return (rows[0]?.n ?? 0) >= 5;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const userId = randomUUID();
const ready = await seeded();

describe('similar-to and pairing', { skip: ready ? false : 'database not seeded' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  let anchorId = '';
  let anchorPrice = 0;

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
      userId,
      `discovery-${userId}@example.test`,
    ]);

    const anchor = await admin.query<{ id: string; price: number }>(
      `SELECT p.id, v.price_ngn AS price
         FROM products p
         JOIN product_notes n ON n.product_id = p.id
         JOIN product_variants v ON v.product_id = p.id
        WHERE p.category = 'perfume'
        GROUP BY p.id, v.price_ngn
        ORDER BY count(n.note_id) DESC, v.price_ngn DESC
        LIMIT 1`,
    );
    anchorId = anchor.rows[0]?.id ?? '';
    anchorPrice = anchor.rows[0]?.price ?? 0;
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    await admin.end();
    await closePools();
  });

  it('finds neighbours of an anchor, never the anchor itself', async () => {
    const response = await recommendSimilar(userId, anchorId);
    assert.ok(response, 'expected an anchor');
    assert.ok((response?.results.length ?? 0) > 0);
    assert.ok(response?.results.every((result) => result.productId !== anchorId));
    assert.ok(response?.results.every((result) => result.label !== 'not_similar'));
  });

  it('returns cheaper alternatives only when asked', async () => {
    const response = await recommendSimilar(userId, anchorId, { cheaperOnly: true });
    assert.ok(response);
    for (const result of response?.results ?? []) {
      assert.ok(
        result.priceNgn !== null && result.priceNgn < anchorPrice,
        `${result.name} is not cheaper than the anchor`,
      );
    }
  });

  it('returns null for an anchor that is not a fragrance', async () => {
    const cream = await admin.query<{ id: string }>(
      `SELECT id FROM products WHERE category = 'cream' LIMIT 1`,
    );
    const response = await recommendSimilar(userId, cream.rows[0]?.id ?? randomUUID());
    assert.equal(response, null);
  });

  it('suggests pairings with an unscented base first, and flags a clash', async () => {
    const response = await recommendPairings(userId, anchorId);
    assert.ok(response);
    assert.equal(response?.pairings.length, 3);
    assert.equal(response?.pairings[0]?.clash, false);
    assert.match(response?.pairings[0]?.rationale ?? '', /Unscented base/);

    const wire = presentPairing(response!, { requestId: 'r1' });
    assert.ok(wire.data.pairings.every((pairing) => pairing.cream_name.length > 0));
  });

  it('wires the similar response in snake_case with price deltas', async () => {
    const response = await recommendSimilar(userId, anchorId);
    const wire = presentSimilar(response!, { requestId: 'r1' });
    assert.equal(wire.data.anchor.id, anchorId);
    assert.ok(wire.data.results.length > 0);
    assert.ok(wire.data.results.every((result) => Array.isArray(result.shared_notes)));
    assert.ok(!JSON.stringify(wire).includes('priceNgn'));
  });
});
