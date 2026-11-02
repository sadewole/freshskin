import { retakeCopy, type RetakeReason } from '../skin/analysis.js';
import type { AnalysisRecord } from '../skin/service.js';

/**
 * The analysis wire shape (§9 S6). A refusal is a normal response with a reason the client can
 * show, never an error: "we could not read this" is a result.
 */
export interface WireAnalysis {
  readonly data: {
    readonly id: string;
    readonly status: string;
    readonly tone_band: string | null;
    readonly undertone: string | null;
    readonly evenness_score: number | null;
    readonly texture_scores: { hydration: number; roughness: number; flakiness: number } | null;
    readonly concerns: readonly string[];
    readonly confidence: number | null;
    readonly evidence: readonly string[];
    readonly retake: { readonly needed: boolean; readonly reason: string | null };
    readonly disclaimer: string;
  };
  readonly meta: { readonly request_id: string };
}

export const ANALYSIS_DISCLAIMER =
  'This is a cosmetic assessment based on one photo. Lighting and camera affect results. ' +
  'If you have a skin condition or a severe reaction, see a dermatologist.';

const RETAKE_PREFIX = 'retake:';

export function presentAnalysis(record: AnalysisRecord, meta: { requestId: string }): WireAnalysis {
  const retakeReason =
    record.status === 'failed' && record.errorCode?.startsWith(RETAKE_PREFIX) === true
      ? (record.errorCode.slice(RETAKE_PREFIX.length) as RetakeReason)
      : null;

  return {
    data: {
      id: record.id,
      status: record.status,
      tone_band: record.toneBand,
      undertone: record.undertone,
      evenness_score: record.evennessScore,
      texture_scores: record.textureScores,
      concerns: record.concerns,
      confidence: record.confidence,
      evidence: record.evidence,
      retake: {
        needed: retakeReason !== null,
        reason: retakeReason === null ? null : retakeCopy(retakeReason),
      },
      disclaimer: ANALYSIS_DISCLAIMER,
    },
    meta: { request_id: meta.requestId },
  };
}
