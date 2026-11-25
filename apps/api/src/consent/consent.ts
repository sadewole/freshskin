import type pg from 'pg';
import { withUser } from '../db/client.js';

/**
 * The consent ledger (§16.3): append-only, versioned, granular, and withdrawable.
 *
 * The latest record per kind wins, so withdrawal is another append rather than an update. A
 * database trigger enforces the image-processing consent independently, so this module is the
 * good error message in front of an invariant that holds anyway.
 */

export type ConsentKind =
  | 'terms'
  | 'privacy'
  | 'image_processing'
  | 'model_training'
  | 'marketing';

export const CONSENT_KINDS: readonly ConsentKind[] = [
  'terms',
  'privacy',
  'image_processing',
  'model_training',
  'marketing',
];

export const IMAGE_CONSENT: ConsentKind = 'image_processing';

export class ConsentMissing extends Error {
  constructor(readonly kind: ConsentKind) {
    super(`consent not granted: ${kind}`);
    this.name = 'ConsentMissing';
  }
}

export class UnderageBlocked extends Error {
  constructor() {
    super('users under 16 cannot consent to processing');
    this.name = 'UnderageBlocked';
  }
}

export async function recordConsent(
  userId: string,
  kind: ConsentKind,
  granted: boolean,
  policyVersion: string,
): Promise<void> {
  await withUser(userId, async (client) => {
    if (kind === 'terms' && granted) {
      const { rows } = await client.query<{ age_band: string | null }>(
        'SELECT age_band FROM users WHERE id = $1',
        [userId],
      );
      if (rows[0]?.age_band === 'under_16') throw new UnderageBlocked();
    }

    await client.query(
      `INSERT INTO consent_records (user_id, kind, policy_version, granted)
       VALUES ($1, $2, $3, $4)`,
      [userId, kind, policyVersion, granted],
    );
  });
}

export async function hasConsent(
  client: pg.PoolClient,
  userId: string,
  kind: ConsentKind,
): Promise<boolean> {
  const { rows } = await client.query<{ granted: boolean }>(
    `SELECT granted FROM consent_records
      WHERE user_id = $1 AND kind = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [userId, kind],
  );
  return rows[0]?.granted === true;
}

export async function requireConsent(
  client: pg.PoolClient,
  userId: string,
  kind: ConsentKind,
): Promise<void> {
  if (!(await hasConsent(client, userId, kind))) throw new ConsentMissing(kind);
}

export async function loadConsents(userId: string): Promise<Record<ConsentKind, boolean>> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ kind: ConsentKind; granted: boolean }>(
      `SELECT DISTINCT ON (kind) kind, granted
         FROM consent_records
        WHERE user_id = $1
        ORDER BY kind, created_at DESC, id DESC`,
      [userId],
    );

    const out = Object.fromEntries(CONSENT_KINDS.map((kind) => [kind, false])) as Record<
      ConsentKind,
      boolean
    >;
    for (const row of rows) out[row.kind] = row.granted;
    return out;
  });
}
