import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/close.js';
import { withUser } from '../src/db/client.js';
import { listSaved, loadOwnedNotes, removeItem, saveItem } from '../src/saved/items.js';

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

const userId = randomUUID();
const otherId = randomUUID();
const hasDb = await reachable();

describe('saved items', { skip: hasDb ? false : 'database unreachable' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  let productId = '';
  let perfumeId = '';

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)', [
      userId,
      `saved-${userId}@example.test`,
      otherId,
      `saved-other-${otherId}@example.test`,
    ]);

    const cream = await admin.query<{ id: string }>(
      `SELECT p.id FROM products p WHERE p.category = 'cream' AND p.status = 'ready' LIMIT 1`,
    );
    const perfume = await admin.query<{ id: string }>(
      `SELECT p.id FROM products p JOIN product_notes n ON n.product_id = p.id
        WHERE p.category = 'perfume' LIMIT 1`,
    );

    productId = cream.rows[0]?.id ?? '';
    perfumeId = perfume.rows[0]?.id ?? '';
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userId, otherId]]);
    await admin.end();
    await closePools();
  });

  it('saves to the wishlist and lists it back', async () => {
    assert.ok(productId, 'expected a seeded cream');
    await saveItem(userId, productId, 'wishlist');

    const items = await listSaved(userId);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.productId, productId);
    assert.equal(items[0]?.list, 'wishlist');
    assert.ok((items[0]?.name.length ?? 0) > 0);
  });

  it('is idempotent: saving twice keeps one live row', async () => {
    await saveItem(userId, productId, 'wishlist');
    const rows = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM saved_items
        WHERE user_id = $1 AND product_id = $2 AND list = 'wishlist' AND deleted_at IS NULL`,
      [userId, productId],
    );
    assert.equal(rows.rows[0]?.n, 1);
  });

  it('removes by soft delete, and re-saving revives the row', async () => {
    assert.equal(await removeItem(userId, productId, 'wishlist'), true);
    assert.equal(await removeItem(userId, productId, 'wishlist'), false, 'removing twice is a no-op');
    assert.equal((await listSaved(userId)).length, 0);

    await saveItem(userId, productId, 'wishlist');
    assert.equal((await listSaved(userId)).length, 1);

    const live = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM saved_items
        WHERE user_id = $1 AND product_id = $2 AND deleted_at IS NULL`,
      [userId, productId],
    );
    assert.equal(live.rows[0]?.n, 1, 'reviving must not create a second live row');
  });

  it('keeps lists private to their owner', async () => {
    assert.deepEqual(await listSaved(otherId), []);
  });

  it('rejects an unknown product instead of storing a dangling reference', async () => {
    await assert.rejects(
      () => saveItem(userId, randomUUID(), 'wishlist'),
      (error: unknown) => (error as { code?: string }).code === '23503',
    );
  });

  it('exposes owned perfume notes, which feed the novelty term', async () => {
    assert.ok(perfumeId, 'expected a seeded perfume with notes');
    await saveItem(userId, perfumeId, 'owned');

    const notes = await withUser(userId, (client) => loadOwnedNotes(client, userId));
    assert.ok(notes.length > 0, 'owned perfume should contribute its notes');

    const other = await withUser(otherId, (client) => loadOwnedNotes(client, otherId));
    assert.deepEqual(other, []);
  });
});
