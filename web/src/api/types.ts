/**
 * Wire types, mirroring `src/http/present*.ts` field for field.
 *
 * These are deliberately hand-written rather than imported from the server. The server's
 * presenters import `node:crypto` and the domain layer, neither of which belongs in a browser
 * bundle. The cost is that the two can drift — the shape is copied, not referenced, so when a
 * presenter changes its field names, this file is the place to follow.
 */

export type ConsentKind =
  | 'terms'
  | 'privacy'
  | 'image_processing'
  | 'model_training'
  | 'marketing';

export type ProductKind = 'cream' | 'perfume';
export type SavedList = 'wishlist' | 'owned';
export type Strength = 'light' | 'moderate' | 'strong' | 'very_strong';
export type ScanVerdict = 'good' | 'okay' | 'avoid';

export interface Meta {
  readonly request_id: string;
}

export interface Envelope<T, M = Meta> {
  readonly data: T;
  readonly meta: M;
}

// ---------------------------------------------------------------- /me, /meta

export interface Me {
  readonly user_id: string;
  readonly consents: Readonly<Record<ConsentKind, boolean>>;
  readonly has_fragrance_profile: boolean;
}

export interface SiteMeta {
  readonly families: readonly string[];
  readonly concerns: readonly string[];
  readonly occasions: readonly string[];
  readonly consent_kinds: readonly ConsentKind[];
}

export interface FragranceProfileWire {
  readonly families_liked: readonly string[];
  readonly families_disliked: readonly string[];
  readonly notes_loved: readonly string[];
  readonly notes_avoided: readonly string[];
  readonly strength: Strength;
  readonly occasions: readonly string[];
  readonly budget_max_ngn: number | null;
}

export interface FragranceProfileInput {
  readonly families_liked: readonly string[];
  readonly families_disliked: readonly string[];
  readonly notes_loved?: readonly string[];
  readonly notes_avoided?: readonly string[];
  readonly strength: Strength;
  readonly occasions: readonly string[];
  readonly budget_max_ngn?: number | null;
}

// ---------------------------------------------------------------- recommendations

export interface WireProduct {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly price_ngn: number | null;
  readonly attributes: {
    readonly fragrance_free: boolean | null;
    readonly richness: string | null;
  };
}

export interface WireItem {
  readonly recommendation_id: string;
  readonly rank: number;
  /** Already 0–100 (`displayScore` in src/rec/explain.ts). Do not multiply by 100. */
  readonly score: number;
  readonly product: WireProduct;
  readonly reason: string;
  /** Term weights, 0–1 each. */
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

export interface RecommendationResponse {
  readonly data: {
    readonly session_id: string;
    readonly algorithm_version: string;
    readonly profile_version: string;
    readonly items: readonly WireItem[];
    readonly excluded: readonly WireExcluded[];
    readonly total_matched: number;
    readonly filters_applied: Readonly<Record<string, unknown>>;
  };
  readonly meta: Meta & { readonly served_in_ms: number; readonly cached: boolean };
}

export interface CreamQuery {
  readonly maxPrice?: number | null;
  readonly fragranceFree?: boolean;
  readonly limit?: number;
}

// ---------------------------------------------------------------- discovery

export interface SimilarResponse {
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
  readonly meta: Meta;
}

// ---------------------------------------------------------------- saved

export interface SavedItem {
  readonly product_id: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly price_ngn: number | null;
  readonly list: SavedList;
  readonly saved_at: string;
}

export interface SavedResponse {
  readonly data: {
    readonly items: readonly SavedItem[];
    readonly counts: Readonly<Record<SavedList, number>>;
  };
  readonly meta: Meta;
}

// ---------------------------------------------------------------- scans

/** `POST /scans` returns the raw domain object (`{ scanId }`), not an envelope. */
export interface CreatedScan {
  readonly scanId: string;
}

export interface WireFinding {
  readonly label: string;
  readonly severity: string;
  readonly reason: string;
  readonly source: string | null;
}

export interface ScanResponse {
  readonly data: {
    readonly id: string;
    readonly status: 'complete' | 'low_confidence';
    /** Already a 0–100 percentage. Do not multiply by 100 again. */
    readonly match_rate: number;
    readonly matched_count: number;
    readonly verdict: ScanVerdict | null;
    readonly summary: string;
    readonly findings: readonly WireFinding[];
    readonly retake: { readonly needed: boolean; readonly reason: string | null };
  };
  readonly meta: Meta;
}
