import pg from 'pg';

const APP_URL =
  process.env.DATABASE_URL_APP ?? 'postgres://freshskin_app:app@127.0.0.1:55432/freshskin';

if (process.env.DATABASE_URL && !process.env.DATABASE_URL_APP) {
  // A single URL is the admin URL; deriving the app URL from it would be a footgun.
  console.warn('DATABASE_URL_APP is unset; falling back to the local test role.');
}

export const appPool = new pg.Pool({ connectionString: APP_URL, max: 10 });

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
