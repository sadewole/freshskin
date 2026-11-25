/**
 * The HTTP wire contract. Type-only: no Node or browser APIs, no domain imports.
 *
 * Both sides import this module: `src/http/present*.ts` constructs these shapes, and
 * `web/src/api/client.ts` reads them. A field rename therefore breaks one side at compile time
 * instead of drifting silently.
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
  readonly meta: Meta & { readonly served_in_ms: number; readonly cached: boolean };
}

export type RecommendationResponse = WireResponse;

export interface CreamQuery {
  readonly maxPrice?: number | null;
  readonly fragranceFree?: boolean;
  readonly limit?: number;
}

// ---------------------------------------------------------------- discovery

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
  readonly meta: Meta;
}

export type SimilarResponse = WireSimilar;

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
  readonly meta: Meta;
}

// ---------------------------------------------------------------- saved

export interface WireSavedItem {
  readonly product_id: string;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly price_ngn: number | null;
  readonly list: SavedList;
  readonly saved_at: string;
}

export type SavedItem = WireSavedItem;

export interface WireSaved {
  readonly data: {
    readonly items: readonly WireSavedItem[];
    readonly counts: Readonly<Record<SavedList, number>>;
  };
  readonly meta: Meta;
}

export type SavedResponse = WireSaved;

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

export interface WireScanResponse {
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

export type ScanResponse = WireScanResponse;

// ---------------------------------------------------------------- routine, tips, check-ins
//
// Curated body-care routine + reviewed tips + weekly self-reported check-ins (decision 0004).
// Follows the WirePairing shape: snake_case, { data, meta }, pre-rendered strings, no trend
// fields — progress surfaces the latest two check-ins only (PRD §6.4 carve-out).

export type CheckInCompletion = 'skipped' | 'partly' | 'done';
export type SkinFeel = 'drier' | 'about_same' | 'more_comfortable' | 'not_sure';
export type TipTopic = 'routine' | 'scent' | 'sun' | 'ingredients';

export interface WireRoutineStep {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  /** Template-first, ≤ 140 chars. */
  readonly instruction: string;
  /** Names the inputs behind the step, ≤ 140 chars. */
  readonly why: string;
  readonly inputs: readonly string[];
  readonly tip_id: string | null;
}

export interface WireTip {
  readonly id: string;
  readonly topic: TipTopic;
  /** ≤ 140 chars, reviewed once before serving. */
  readonly body: string;
  readonly why: string;
  readonly inputs: readonly string[];
}

export interface WireRoutine {
  readonly data: {
    readonly routine: {
      readonly slug: string;
      readonly title: string;
      readonly content_version: string;
      readonly steps: readonly WireRoutineStep[];
    };
    readonly tips: readonly WireTip[];
    readonly disclaimer: string;
  };
  readonly meta: Meta;
}

export type RoutineResponse = WireRoutine;

export interface WireCheckIn {
  readonly id: string;
  /** Lagos calendar day, YYYY-MM-DD. */
  readonly checked_on: string;
  readonly completion: CheckInCompletion;
  readonly feel: SkinFeel | null;
  readonly created_at: string;
}

/** Latest two only. No history arrays, no trend fields. */
export interface WireCheckIns {
  readonly data: {
    readonly today: string;
    readonly latest: WireCheckIn | null;
    readonly previous: WireCheckIn | null;
    readonly streak_days: number;
    readonly checked_in_today: boolean;
    readonly total_check_ins: number;
    readonly disclaimer: string;
  };
  readonly meta: Meta;
}

export type CheckInsResponse = WireCheckIns;

export interface CheckInInput {
  readonly completion: CheckInCompletion;
  readonly feel?: SkinFeel | null;
  /** Offline queue only; server accepts at most ±1 day around the Lagos day, else 400. */
  readonly checked_on?: string;
}

// ---------------------------------------------------------------- skin analysis

export interface WireAnalysis {
  readonly data: {
    readonly id: string;
    readonly status: string;
    readonly tone_band: string | null;
    readonly undertone: string | null;
    readonly evenness_score: number | null;
    readonly texture_scores: {
      hydration: number;
      roughness: number;
      flakiness: number;
    } | null;
    readonly concerns: readonly string[];
    readonly confidence: number | null;
    readonly evidence: readonly string[];
    readonly retake: { readonly needed: boolean; readonly reason: string | null };
    readonly disclaimer: string;
  };
  readonly meta: Meta;
}
