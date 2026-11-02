import { withUser } from '../db/client.js';

/**
 * Wishlist and owned lists. Removing is a soft delete so the history survives, which means
 * saving again must revive the tombstone rather than insert a duplicate.
 */

export type SavedList = 'wishlist' | 'owned';

export interface SavedItem {
  readonly productId: string;
  readonly name: string;
  readonly brandName: string;
  readonly category: string;
  readonly priceNgn: number | null;
  readonly list: SavedList;
  readonly savedAt: Date;
}

export async function saveItem(
  userId: string,
  productId: string,
  list: SavedList,
): Promise<void> {
  await withUser(userId, async (client) => {
    const revived = await client.query(
      `UPDATE saved_items SET deleted_at = NULL
        WHERE user_id = $1 AND product_id = $2 AND list = $3 AND deleted_at IS NOT NULL`,
      [userId, productId, list],
    );
    if (revived.rowCount !== null && revived.rowCount > 0) return;

    await client.query(
      `INSERT INTO saved_items (user_id, product_id, list) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, productId, list],
    );
  });
}

export async function removeItem(
  userId: string,
  productId: string,
  list: SavedList,
): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE saved_items SET deleted_at = now()
        WHERE user_id = $1 AND product_id = $2 AND list = $3 AND deleted_at IS NULL`,
      [userId, productId, list],
    );
    return (rowCount ?? 0) > 0;
  });
}

export async function listSaved(userId: string): Promise<SavedItem[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{
      product_id: string;
      name: string;
      brand_name: string;
      category: string;
      price_ngn: number | null;
      list: SavedList;
      created_at: Date;
    }>(
      `SELECT s.product_id, p.name, p.brand_name, p.category, p.price_ngn, s.list, s.created_at
         FROM saved_items s
         JOIN v_product_browse p ON p.id = s.product_id
        WHERE s.user_id = $1 AND s.deleted_at IS NULL
        ORDER BY s.created_at DESC`,
      [userId],
    );

    return rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      brandName: row.brand_name,
      category: row.category,
      priceNgn: row.price_ngn,
      list: row.list,
      savedAt: row.created_at,
    }));
  });
}

/**
 * The notes of every perfume the user says they own. Feeds the novelty term (§14.3), which is
 * otherwise a constant and therefore useless.
 */
export async function loadOwnedNotes(
  client: import('pg').PoolClient,
  userId: string,
): Promise<string[]> {
  const { rows } = await client.query<{ notes: string[] | null }>(
    `SELECT array_agg(DISTINCT n.note_name) AS notes
       FROM saved_items s
       JOIN v_perfume_notes n ON n.product_id = s.product_id
      WHERE s.user_id = $1 AND s.list = 'owned' AND s.deleted_at IS NULL`,
    [userId],
  );
  return rows[0]?.notes ?? [];
}
