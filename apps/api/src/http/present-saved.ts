import type { WireSaved } from '@freshskin/contracts';
import type { SavedItem } from '../saved/items.js';

/** The saved-items wire shape. Two lists, one response, no per-list endpoint needed. */
export type { WireSaved } from '@freshskin/contracts';

export function presentSaved(items: readonly SavedItem[], meta: { requestId: string }): WireSaved {
  return {
    data: {
      items: items.map((item) => ({
        product_id: item.productId,
        name: item.name,
        brand: item.brandName,
        category: item.category,
        price_ngn: item.priceNgn,
        list: item.list,
        saved_at: item.savedAt.toISOString(),
      })),
      counts: {
        wishlist: items.filter((item) => item.list === 'wishlist').length,
        owned: items.filter((item) => item.list === 'owned').length,
      },
    },
    meta: { request_id: meta.requestId },
  };
}
