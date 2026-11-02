import { createHash } from 'node:crypto';
import type { ExplainedItem, Plan } from '../rec/types.js';

/**
 * The only place that knows the wire shape (§12.3). Pure: no branching on domain rules,
 * no decisions — a rename and a nesting. Nothing in rec/ knows a snake_case field name.
 */

export interface WireProduct {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly price_ngn: number | null;
  readonly attributes: { readonly fragrance_free: boolean | null; readonly richness: string | null };
}

export interface WireItem {
  readonly recommendation_id: string;
  readonly rank: number;
  readonly score: number;
  readonly product: WireProduct;
  readonly reason: string;
  readonly breakdown: Readonly<Record<string, number>>;
  readonly excluded_conflicts: readonly string[];
  readonly flags: readonly string[];
}

export interface WireExcluded {
  readonly product_id: string;
  readonly name: string;
  readonly code: string;
  readonly reason: string;
}

export interface WireResponse {
  readonly data: {
    readonly session_id: string;
    readonly algorithm_version: string;
    readonly profile_version: string;
    readonly items: readonly WireItem[];
    readonly excluded: readonly WireExcluded[];
    readonly total_matched: number;
    readonly filters_applied: Readonly<Record<string, unknown>>;
  };
  readonly meta: {
    readonly request_id: string;
    readonly served_in_ms: number;
    readonly cached: boolean;
  };
}

/** Stable per (session, product): the same recommendation always carries the same id. */
export function recommendationId(sessionId: string, productId: string): string {
  const digest = createHash('sha256').update(`${sessionId}:${productId}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

const toWireItem = (
  sessionId: string,
  item: ExplainedItem,
  storedIds: ReadonlyMap<string, string> | undefined,
): WireItem => ({
  recommendation_id: storedIds?.get(item.product.id) ?? recommendationId(sessionId, item.product.id),
  rank: item.rank,
  score: item.displayScore,
  product: {
    id: item.product.id,
    name: item.product.name,
    brand: item.product.brandName,
    category: item.product.category,
    price_ngn: item.product.priceNgn,
    attributes: {
      fragrance_free: item.product.fragranceFree,
      richness: item.product.richness,
    },
  },
  reason: item.reason,
  breakdown: { ...item.terms },
  excluded_conflicts: [],
  flags: [...item.flags],
});

export function present(
  plan: Plan,
  meta: { requestId: string; servedInMs: number; cached: boolean },
  storedIds?: ReadonlyMap<string, string>,
): WireResponse {
  return {
    data: {
      session_id: plan.meta.sessionId,
      algorithm_version: plan.meta.algorithmVersion,
      profile_version: plan.meta.profileVersion,
      items: plan.items.map((item) => toWireItem(plan.meta.sessionId, item, storedIds)),
      excluded: plan.rejected.map((rejection) => ({
        product_id: rejection.productId,
        name: rejection.productName,
        code: rejection.code,
        reason: rejection.reason,
      })),
      total_matched: plan.meta.totalMatched,
      filters_applied: { ...plan.meta.narrowing },
    },
    meta: {
      request_id: meta.requestId,
      served_in_ms: meta.servedInMs,
      cached: meta.cached,
    },
  };
}
