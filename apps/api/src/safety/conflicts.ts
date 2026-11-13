/**
 * The single home of allergen and sensitivity *detection* (§14.2, §14.3, §13.4).
 *
 * Consumers do not re-derive a conflict; they apply a consequence to what this module returns.
 * That is the difference between one rule and three copies of it.
 */

export type Severity = 'mild' | 'moderate' | 'severe';

export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  mild: 1,
  moderate: 2,
  severe: 3,
};

export type SurfaceKind = 'inci' | 'notes';
export type ProductKind = 'cream' | 'perfume';

export interface SurfaceItem {
  readonly ingredientId: string | null;
  readonly inciName: string;
  readonly isAllergen: boolean;
}

export interface CosmeticSurface {
  readonly kind: SurfaceKind;
  readonly items: readonly SurfaceItem[];
  /** Perfumes frequently disclose nothing; the difference is a product fact, not an error. */
  readonly disclosure: 'full' | 'partial';
}

export interface Sensitivity {
  readonly id: string;
  readonly ingredientId: string | null;
  readonly freeText: string | null;
  readonly severity: Severity;
  readonly appliesTo: readonly ProductKind[];
}

export interface Collision {
  readonly sensitivity: Sensitivity;
  readonly hit: SurfaceItem;
  /** `declared` matched an ingredient id; `free_text_unresolved` matched on a normalised token. */
  readonly kind: 'declared' | 'free_text_unresolved';
  readonly severity: Severity;
}

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Pure, total, no IO. Returns one collision per matching sensitivity, in input order.
 * Unresolved free text still collides: it is weak evidence, not no evidence.
 */
export function assessContact(
  sensitivities: readonly Sensitivity[],
  surface: CosmeticSurface,
  productKind: ProductKind,
): readonly Collision[] {
  const collisions: Collision[] = [];

  for (const sensitivity of sensitivities) {
    if (!sensitivity.appliesTo.includes(productKind)) continue;

    const hit = surface.items.find((item) => {
      if (sensitivity.ingredientId !== null && item.ingredientId !== null) {
        return item.ingredientId === sensitivity.ingredientId;
      }
      if (sensitivity.freeText !== null) {
        return normalise(item.inciName) === normalise(sensitivity.freeText);
      }
      return false;
    });

    if (hit === undefined) continue;

    collisions.push({
      sensitivity,
      hit,
      kind: sensitivity.ingredientId === null ? 'free_text_unresolved' : 'declared',
      severity: sensitivity.severity,
    });
  }

  return collisions;
}

export function worstSeverity(collisions: readonly Collision[]): Severity | null {
  let worst: Severity | null = null;
  for (const collision of collisions) {
    if (worst === null || SEVERITY_RANK[collision.severity] > SEVERITY_RANK[worst]) {
      worst = collision.severity;
    }
  }
  return worst;
}
