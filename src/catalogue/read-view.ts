import type pg from 'pg';
import { projectProduct } from './projection.js';
import type { Candidate } from '../rec/types.js';

/**
 * Reads only gated views. The app role has no privilege on the base tables, so this module
 * cannot be "simplified" into a direct select without failing at runtime.
 */
export interface LoadedCatalogue {
  readonly candidates: readonly Candidate[];
  readonly drafts: readonly { readonly productId: string; readonly reason: string }[];
  readonly capped: boolean;
}

const CANDIDATE_LIMIT = 500;

export async function loadCreamCandidates(client: pg.PoolClient): Promise<LoadedCatalogue> {
  const products = await client.query(
    `SELECT id, name, brand_name, category, richness, fragrance_free, price_ngn, availability
       FROM v_product_recommendable
      WHERE category = 'cream'
      ORDER BY data_confidence DESC, verified_at DESC NULLS LAST, id
      LIMIT $1`,
    [CANDIDATE_LIMIT],
  );

  if (products.rows.length === 0) {
    return { candidates: [], drafts: [], capped: false };
  }

  const ids = products.rows.map((row) => String(row.id));
  const ingredients = await client.query(
    `SELECT product_id, ingredient_id, inci_name, is_allergen, irritation_risk, comedogenic_rating, functions
       FROM v_product_ingredients
      WHERE product_id = ANY($1::uuid[])`,
    [ids],
  );

  const byProduct = new Map<string, unknown[]>();
  for (const row of ingredients.rows) {
    const key = String(row.product_id);
    const bucket = byProduct.get(key);
    if (bucket === undefined) byProduct.set(key, [row]);
    else bucket.push(row);
  }

  const candidates: Candidate[] = [];
  const drafts: { productId: string; reason: string }[] = [];

  for (const row of products.rows) {
    const result = projectProduct(row, byProduct.get(String(row.id)) ?? []);
    if (result.kind === 'candidate') candidates.push(result.candidate);
    else drafts.push({ productId: result.productId, reason: result.reason });
  }

  return { candidates, drafts, capped: products.rows.length >= CANDIDATE_LIMIT };
}
