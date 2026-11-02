import pg from 'pg';

const APP_URL =
  process.env.DATABASE_URL_APP ?? 'postgres://freshskin_app:app@127.0.0.1:55432/freshskin';
const SYSTEM_URL =
  process.env.DATABASE_URL_SYSTEM ?? 'postgres://freshskin_system:system@127.0.0.1:55432/freshskin';

if (process.env.DATABASE_URL && !process.env.DATABASE_URL_APP) {
  // A single URL is the admin URL; deriving the app URL from it would be a footgun.
  console.warn('DATABASE_URL_APP is unset; falling back to the local test role.');
}

export const appPool = new pg.Pool({ connectionString: APP_URL, max: 10 });

/**
 * The system pool has BYPASSRLS. It is imported only by jobs/ — an import-graph test
 * (tests/boundaries.test.ts) fails if a request-path module reaches it.
 */
export const systemPool = new pg.Pool({ connectionString: SYSTEM_URL, max: 2 });

/**
 * Runs `fn` as the app role with the request's user set for the transaction only.
 * `SET LOCAL` semantics via set_config(..., true): a pooled connection cannot leak the
 * previous request's identity, because the setting dies at COMMIT.
 */
export async function withUser<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
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
    client.release();
  }
}

let closed = false;

/** Idempotent: test suites share process-level pools and may close them more than once. */
export async function closePools(): Promise<void> {
  if (closed) return;
  closed = true;
  await Promise.all([appPool.end(), systemPool.end()]);
}
