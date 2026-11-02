import { explainVerdict, type Finding } from '../scans/verdict.js';
import type { ScanResult } from '../scans/service.js';

/**
 * The scan half of the wire surface. Pure, like present.ts: it renames and nests, and makes
 * no decisions. A refused verdict is a normal response with a retake reason, never a 500.
 */

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
    readonly match_rate: number;
    readonly matched_count: number;
    readonly verdict: 'good' | 'okay' | 'avoid' | null;
    readonly summary: string;
    readonly findings: readonly WireFinding[];
    readonly retake: { readonly needed: boolean; readonly reason: string | null };
  };
  readonly meta: { readonly request_id: string };
}

const toWireFinding = (finding: Finding): WireFinding => ({
  label: finding.label,
  severity: finding.severity,
  reason: finding.reason,
  source: finding.source ?? null,
});

export function presentScan(result: ScanResult, meta: { requestId: string }): WireScanResponse {
  const summary =
    result.verdict === null
      ? explainVerdict({
          kind: 'insufficient_evidence',
          parse: {
            usable: false,
            reason: result.insufficientReason ?? 'match_rate_too_low',
            matchRate: result.matchRate,
            matched: result.matched,
          },
        })
      : explainVerdict(result.verdict);

  return {
    data: {
      id: result.scanId,
      status: result.status,
      match_rate: Math.round(result.matchRate * 100) / 100,
      matched_count: result.matched,
      verdict:
        result.verdict === null || result.verdict.kind === 'insufficient_evidence'
          ? null
          : result.verdict.kind,
      summary,
      findings: result.findings.map(toWireFinding),
      retake: {
        needed: result.verdict === null,
        reason: result.insufficientReason,
      },
    },
    meta: { request_id: meta.requestId },
  };
}
