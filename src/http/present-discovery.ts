import type { PairingResponse, SimilarResponse } from '../service/discovery.js';

/** Wire shapes for the two discovery surfaces. Like the others: rename, nest, decide nothing. */

export interface WireSimilar {
  readonly data: {
    readonly anchor: { readonly id: string; readonly name: string; readonly price_ngn: number | null };
    readonly cheaper_only: boolean;
    readonly results: readonly {
      readonly product_id: string;
      readonly name: string;
      readonly score: number;
      readonly label: string;
      readonly shared_notes: readonly string[];
      readonly price_ngn: number | null;
      readonly price_delta_ngn: number | null;
    }[];
  };
  readonly meta: { readonly request_id: string };
}

export interface WirePairing {
  readonly data: {
    readonly perfume: { readonly id: string; readonly name: string; readonly families: readonly string[] };
    readonly pairings: readonly {
      readonly cream_id: string;
      readonly cream_name: string;
      readonly score: number;
      readonly rationale: string;
      readonly clash: boolean;
    }[];
  };
  readonly meta: { readonly request_id: string };
}

export function presentSimilar(
  response: SimilarResponse,
  meta: { requestId: string },
): WireSimilar {
  return {
    data: {
      anchor: {
        id: response.anchor.id,
        name: response.anchor.name,
        price_ngn: response.anchor.priceNgn,
      },
      cheaper_only: response.cheaperOnly,
      results: response.results.map((result) => ({
        product_id: result.productId,
        name: result.name,
        score: result.score,
        label: result.label,
        shared_notes: result.sharedNotes,
        price_ngn: result.priceNgn,
        price_delta_ngn: result.priceDeltaNgn,
      })),
    },
    meta: { request_id: meta.requestId },
  };
}

export function presentPairing(
  response: PairingResponse,
  meta: { requestId: string },
): WirePairing {
  return {
    data: {
      perfume: {
        id: response.perfume.id,
        name: response.perfume.name,
        families: response.perfume.families,
      },
      pairings: response.pairings.map((pairing) => ({
        cream_id: pairing.creamId,
        cream_name: pairing.creamName,
        score: pairing.score,
        rationale: pairing.rationale,
        clash: pairing.clash,
      })),
    },
    meta: { request_id: meta.requestId },
  };
}
