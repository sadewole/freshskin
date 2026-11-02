import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

/**
 * The keystone test. If this passes trivially, the privileges are not real.
 * Requires a migrated database: `pnpm db:up && pnpm db:migrate`.
 */
const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';
const APP_URL = process.env.DATABASE_URL_APP ?? 'postgres://freshskin_app:app@127.0.0.1:55432/freshskin';
const SUPPORT_URL =
  process.env.DATABASE_URL_SUPPORT ?? 'postgres://freshskin_support:support@127.0.0.1:55432/freshskin';
const SYSTEM_URL =
  process.env.DATABASE_URL_SYSTEM ?? 'postgres://freshskin_system:system@127.0.0.1:55432/freshskin';

const userA = randomUUID();
const userB = randomUUID();

async function reachable(url: string): Promise<boolean> {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function queryAs(url: string, sql: string): Promise<pg.QueryResult> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(sql);
  } finally {
    await client.end();
  }
}

async function expectDenied(url: string, sql: string): Promise<void> {
  await assert.rejects(
    () => queryAs(url, sql),
    (error: unknown) => (error as { code?: string }).code === '42501',
    `expected permission denied for: ${sql}`,
  );
}

/** Runs a statement as the app role with a transaction-scoped identity, like the request path. */
async function asUser<T>(userId: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: APP_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.user_id', userId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

const hasDb = await reachable(ADMIN_URL);

describe('privilege boundary', { skip: hasDb ? false : 'database unreachable' }, () => {
  before(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query(
      'INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4) ON CONFLICT DO NOTHING',
      [userA, `a-${userA}@example.test`, userB, `b-${userB}@example.test`],
    );
    await admin.query(
      'INSERT INTO profiles (user_id, skin_type) VALUES ($1, $2), ($3, $4) ON CONFLICT DO NOTHING',
      [userA, 'dry', userB, 'oily'],
    );
    await admin.end();
  });

  after(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
    await admin.end();
  });

  it('denies the app role any read of catalogue base tables', async () => {
    await expectDenied(APP_URL, 'SELECT * FROM products LIMIT 1');
    await expectDenied(APP_URL, 'SELECT * FROM ingredients LIMIT 1');
    await expectDenied(APP_URL, 'SELECT * FROM product_ingredients LIMIT 1');
  });

  it('allows the app role the gated views', async () => {
    const gated = await queryAs(APP_URL, 'SELECT count(*)::int AS n FROM v_product_recommendable');
    const ingredients = await queryAs(APP_URL, 'SELECT count(*)::int AS n FROM v_product_ingredients');
    assert.ok((gated.rows[0]?.n ?? -1) >= 0);
    assert.ok((ingredients.rows[0]?.n ?? -1) >= 0);
  });

  it('denies the support role base tables but allows its narrow view', async () => {
    await expectDenied(SUPPORT_URL, 'SELECT * FROM products LIMIT 1');
    const result = await queryAs(SUPPORT_URL, 'SELECT count(*)::int AS n FROM v_support_product');
    assert.ok((result.rows[0]?.n ?? -1) >= 0);
  });

  it('keeps system credentials working for workers only', async () => {
    const result = await queryAs(SYSTEM_URL, 'SELECT count(*)::int AS n FROM products');
    assert.ok((result.rows[0]?.n ?? -1) >= 0);
  });

  it('isolates rows by the request identity (RLS)', async () => {
    const seen = await asUser(userA, async (client) => {
      const { rows } = await client.query<{ user_id: string }>('SELECT user_id FROM profiles');
      return rows.map((row) => row.user_id);
    });
    assert.deepEqual(seen, [userA]);
  });

  it('refuses a write outside the request identity (RLS WITH CHECK)', async () => {
    await assert.rejects(
      () =>
        asUser(userA, (client) =>
          client.query('INSERT INTO profiles (user_id, skin_type) VALUES ($1, $2)', [userB, 'normal']),
        ),
      (error: unknown) => (error as { code?: string }).code === '42501',
    );
  });

  it('does not leak the previous request identity through the pool', async () => {
    await asUser(userA, async () => undefined);
    const leftover = await asUser(userB, async (client) => {
      const { rows } = await client.query<{ uid: string | null }>(
        "SELECT nullif(current_setting('app.user_id', true), '')::text AS uid",
      );
      return rows[0]?.uid ?? null;
    });
    assert.equal(leftover, userB);
  });
});
