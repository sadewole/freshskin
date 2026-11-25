import pg from 'pg';

/**
 * The system pool has BYPASSRLS and spans users. It belongs to workers only; request-path
 * modules must import `./client.js` instead. `tests/boundaries.test.ts` enforces that split.
 */
const SYSTEM_URL =
  process.env.DATABASE_URL_SYSTEM ?? 'postgres://freshskin_system:system@127.0.0.1:55432/freshskin';

export const systemPool = new pg.Pool({ connectionString: SYSTEM_URL, max: 2 });
