import type { CosmeticSurface } from '../safety/conflicts.js';
import type { TermScores } from './terms.js';

/**
 * Stage branding. `stage` is never exported, so only the function that produces a stage can
 * construct its value. Running scoring before eligibility is not a code-review question; it is
 * a type error.
 */
declare const stage: unique symbol;
export type At<S extends string, T> = T & { readonly [stage]: S };

export type SkinType = 'dry' | 'normal' | 'oily' | 'combination' | 'unsure';
export type ClimateZone = 'hot_humid' | 'hot_dry' | 'temperate' | 'cold';
export type Richness = 'light' | 'medium' | 'rich';
export type Availability = 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
export type RecKind = 'cream' | 'perfume' | 'similar' | 'pairing';
export type ProductKind = 'cream' | 'perfume';

export type Unit = number; // 0..1 by convention, clamped at the term boundary

export interface ProductFacts {
  readonly irritancyAvg: Unit;
  readonly comedogenicMax: number; // 0..5
  readonly humectantRatio: Unit;
  readonly occlusiveRatio: Unit;
  readonly beneficialCount: number;
}

export type StrengthPreference = 'light' | 'moderate' | 'strong' | 'very_strong';

export interface PerfumeFacts {
  readonly familyNames: readonly string[];
  readonly noteNames: readonly string[];
  readonly heartAndBaseNotes: readonly string[];
  readonly longevity: number; // 1..5
  readonly projection: number; // 1..5
  readonly occasions: readonly string[];
}

export interface FragrancePreferences {
  readonly familiesLiked: readonly string[];
  readonly familiesDisliked: readonly string[];
  readonly notesLoved: readonly string[];
  readonly notesAvoided: readonly string[];
  readonly strength: StrengthPreference;
  readonly occasions: readonly string[];
  readonly budgetMaxNgn: number | null;
}

export interface CatalogueProduct {
  readonly id: string;
  readonly name: string;
  readonly brandName: string;
  readonly category: ProductKind;
  readonly priceNgn: number | null;
  readonly availability: Availability;
  readonly richness: Richness | null;
  readonly fragranceFree: boolean | null;
  readonly facts: ProductFacts;
  /** Populated for perfumes, null for creams. The term registry reads only what it needs. */
  readonly perfume: PerfumeFacts | null;
}

export interface Candidate {
  readonly product: CatalogueProduct;
  readonly surface: CosmeticSurface;
}

export interface ViewerFacts {
  readonly userId: string;
  readonly skinType: SkinType;
  readonly concerns: readonly string[];
  readonly climateZone: ClimateZone;
  readonly budgetMaxNgn: number | null;
  /** 0..1; 0.5 when the viewer has no ratings yet (Laplace prior). */
  readonly feedbackAffinity: Unit;
  /** Null until the scent quiz is completed; perfume terms fall back to neutral priors. */
  readonly fragrance: FragrancePreferences | null;
  /** Note names from the user's owned perfumes; empty until they mark something as owned. */
  readonly ownedNotes: readonly string[];
}

/** Subtraction only. No field can name an allergen, a severity, or raise a ceiling. */
export interface Narrowing {
  readonly maxPriceNgn?: number;
  readonly fragranceFree?: boolean;
  readonly inStockOnly?: boolean;
}

export interface RecommendationRequest {
  readonly kind: RecKind;
  readonly limit: number; // 1..24
  readonly narrowing: Narrowing;
  readonly includeOwned?: boolean;
}

export type RejectionCode =
  | 'sensitivity_severe'
  | 'over_budget'
  | 'out_of_stock'
  | 'fragrance_free_required'
  | 'family_disliked'
  | 'not_catalogue_ready';

export interface Rejection {
  readonly productId: string;
  readonly productName: string;
  readonly code: RejectionCode;
  readonly reason: string;
}

export interface ScoredItem extends Candidate {
  readonly terms: TermScores;
  readonly value: Unit;
}

export interface ExplainedItem extends ScoredItem {
  readonly rank: number;
  readonly displayScore: number;
  readonly reason: string;
  readonly flags: readonly string[];
}

export interface EligibleData {
  readonly candidates: readonly Candidate[];
  readonly rejected: readonly Rejection[];
  readonly capped: boolean;
}
export type Eligible = At<'eligible', EligibleData>;

export interface ScoredData {
  readonly ranked: readonly ScoredItem[];
}
export type Scored = At<'scored', ScoredData>;

export interface ConstrainedData {
  readonly page: readonly ScoredItem[];
  readonly overflow: readonly ScoredItem[];
  readonly relaxed: boolean;
}
export type Constrained = At<'constrained', ConstrainedData>;

export interface PlanMeta {
  readonly kind: ProductKind;
  readonly sessionId: string;
  readonly algorithmVersion: string;
  readonly profileVersion: string;
  readonly totalMatched: number;
  readonly narrowing: Narrowing;
}

export interface PlanData {
  readonly items: readonly ExplainedItem[];
  readonly rejected: readonly Rejection[];
  readonly meta: PlanMeta;
}
export type Plan = At<'explained', PlanData>;

export interface RecipeContext {
  readonly productKind: ProductKind;
  readonly viewer: ViewerFacts;
}
