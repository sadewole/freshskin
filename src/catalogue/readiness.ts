/**
 * §15.4 catalogue gating.
 *
 * This is NOT the scan-parse threshold. `CatalogueCoverage` answers "is this record
 * trustworthy enough to recommend?"; `ScanCoverage` (scans/verdict.ts) answers "did we read
 * enough of this label to accuse it?". They are different questions with different numbers,
 * and the branded types make passing one where the other belongs a compile error.
 */
export type CatalogueCoverage = number & { readonly __coverage: 'catalogue-inci' };

export const CATALOGUE_READY_AT = 0.95;
export const MIN_DATA_CONFIDENCE = 0.7;

export function asCatalogueCoverage(value: number): CatalogueCoverage | null {
  if (!Number.isFinite(value) || value < 0 || value > 1) return null;
  return value as CatalogueCoverage;
}

export function isCatalogueReady(
  dataConfidence: number,
  coverage: CatalogueCoverage | null,
): boolean {
  if (coverage === null) return false;
  return dataConfidence >= MIN_DATA_CONFIDENCE && coverage >= CATALOGUE_READY_AT;
}
