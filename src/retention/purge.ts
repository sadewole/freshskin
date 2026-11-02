import { systemPool } from '../db/client.js';

/**
 * The 24-hour image window (§16.2, §12.4).
 *
 * Runs on the system role because it spans users and has no session. Idempotent by its own
 * predicate: a second run inside the same window selects nothing, so a crash or a double fire
 * converges instead of double-processing.
 *
 * `SKIP LOCKED` keeps two concurrent workers from purging the same batch.
 */

export interface PurgeResult {
  readonly purged: number;
}

async function purgeTable(table: 'skin_analyses' | 'scans', limit: number): Promise<number> {
  const { rows } = await systemPool.query(
    `WITH expired AS (
       SELECT id FROM ${table}
        WHERE image_key IS NOT NULL
          AND created_at < now() - interval '24 hours'
        ORDER BY created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE ${table} target
        SET image_key = NULL, image_deleted_at = now()
       FROM expired
      WHERE target.id = expired.id
      RETURNING target.id`,
    [limit],
  );
  return rows.length;
}

export async function purgeExpiredImages(limit = 5000): Promise<PurgeResult> {
  const skin = await purgeTable('skin_analyses', limit);
  const scans = await purgeTable('scans', limit);
  return { purged: skin + scans };
}
