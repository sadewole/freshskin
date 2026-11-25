import { createHash, randomBytes } from 'node:crypto';
import { appPool } from '../db/client.js';

/**
 * Anonymous-first identity (decision D9). A session is a random token handed to the client; the
 * database stores only its SHA-256, and only via definer functions, so the app role cannot read
 * the sessions table at all.
 */

export const SESSION_DAYS = 90;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export interface IssuedSession {
  readonly token: string;
  readonly userId: string;
}

export async function createAnonymousSession(days = SESSION_DAYS): Promise<IssuedSession> {
  const token = randomBytes(32).toString('base64url');
  const { rows } = await appPool.query<{ user_id: string }>(
    `SELECT app.create_anonymous_session($1, now() + ($2 || ' days')::interval) AS user_id`,
    [hashToken(token), String(days)],
  );
  const userId = rows[0]?.user_id;
  if (userId === undefined) throw new Error('session creation returned no user');
  return { token, userId };
}

export async function resolveSession(token: string): Promise<string | null> {
  if (token.length === 0 || token.length > 256) return null;
  const { rows } = await appPool.query<{ user_id: string | null }>(
    'SELECT app.resolve_session($1) AS user_id',
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function revokeSession(token: string): Promise<boolean> {
  const { rows } = await appPool.query<{ revoked: boolean }>(
    'SELECT app.revoke_session($1) AS revoked',
    [hashToken(token)],
  );
  return rows[0]?.revoked === true;
}
