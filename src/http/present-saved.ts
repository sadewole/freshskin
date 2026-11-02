import type { SavedItem, SavedList } from '../saved/items.js';

/** The saved-items wire shape. Two lists, one response, no per-list endpoint needed. */
export interface WireSaved {
  readonly data: {
    readonly items: readonly {
      readonly product_id: string;
      readonly name: string;
      readonly brand: string;
      readonly category: string;
      readonly price_ngn: number | null;
      readonly list: SavedList;
      readonly saved_at: string;
    }[];
    readonly counts: Readonly<Record<SavedList, number>>;
  };
  readonly meta: { readonly request_id: string };
}

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
