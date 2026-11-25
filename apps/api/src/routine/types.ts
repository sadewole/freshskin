import type { CheckInCompletion, SkinFeel } from '@freshskin/contracts';

/**
 * Routine domain types. Standalone on purpose: this module renders curated cosmetic-hygiene
 * content and makes no recommendation, eligibility, or safety decision, so it imports
 * nothing from rec/ (a boundaries test fails the build if it ever does).
 */

export interface RoutineStep {
  readonly id: string;
  readonly position: number;
  readonly title: string;
  /** Template-first, ≤ 140 chars (enforced by a DB CHECK). */
  readonly instruction: string;
  /** Names the inputs behind the step, ≤ 140 chars (enforced by a DB CHECK). */
  readonly why: string;
  readonly inputs: readonly string[];
  readonly tipId: string | null;
}

export interface RoutineTemplate {
  readonly slug: string;
  readonly title: string;
  readonly contentVersion: string;
  readonly steps: readonly RoutineStep[];
}

export interface StoredCheckIn {
  readonly id: string;
  /** Lagos calendar day, YYYY-MM-DD. */
  readonly checkedOn: string;
  readonly completion: CheckInCompletion;
  readonly feel: SkinFeel | null;
  readonly createdAt: Date;
}
