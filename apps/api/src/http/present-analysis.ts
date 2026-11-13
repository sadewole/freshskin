import type { WireAnalysis } from '@freshskin/contracts';
import { retakeCopy, type RetakeReason } from '../skin/analysis.js';
import type { AnalysisRecord } from '../skin/service.js';

/**
 * The analysis wire shape (§9 S6). A refusal is a normal response with a reason the client can
 * show, never an error: "we could not read this" is a result.
 */
export type { WireAnalysis } from '@freshskin/contracts';

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
