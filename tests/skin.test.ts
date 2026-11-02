import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assessAnalysis,
  bandConsistent,
  requiresRetake,
  retakeCopy,
  safeEvidence,
  toneFromIta,
  type CaptureQuality,
  type SkinAnalysisResult,
} from '../src/skin/analysis.js';

const raw = (over: Record<string, unknown> = {}) => ({
  ita_degrees: -20,
  undertone: 'warm',
  evenness_score: 62,
  texture_scores: { hydration: 55, roughness: 61, flakiness: 40 },
  concerns: ['dryness', 'uneven tone'],
  confidence: 0.78,
  evidence: ['visible flaking on the upper arm'],
  ...over,
});

const capture = (over: Partial<CaptureQuality> = {}): CaptureQuality => ({
  brightness: 140,
  glareFraction: 0,
  blurScore: 300,
  ...over,
});

const result = (over: Partial<SkinAnalysisResult> = {}): SkinAnalysisResult => ({
  toneBand: 'V',
  itaDegrees: -20,
  undertone: 'warm',
  evennessScore: 60,
  textureScores: { hydration: 50, roughness: 50, flakiness: 40 },
  concerns: [],
  confidence: 0.8,
  evidence: [],
  ...over,
});

describe('toneFromIta', () => {
  it('maps the standard boundaries', () => {
    assert.equal(toneFromIta(60), 'I');
    assert.equal(toneFromIta(55), 'II');
    assert.equal(toneFromIta(41), 'III');
    assert.equal(toneFromIta(28), 'IV');
    assert.equal(toneFromIta(10), 'V');
    assert.equal(toneFromIta(-30), 'V');
    assert.equal(toneFromIta(-30.1), 'VI');
    assert.equal(toneFromIta(-60), 'VI');
  });
});

describe('bandConsistent', () => {
  it('accepts a band within one step of the measurement', () => {
    assert.equal(bandConsistent('V', -20), true);
    assert.equal(bandConsistent('VI', -20), true);
  });

  it('rejects a band that contradicts the measurement', () => {
    assert.equal(bandConsistent('I', -60), false);
    assert.equal(bandConsistent('VI', 55), false);
  });
});

describe('assessAnalysis', () => {
  it('accepts a well-formed, confident response', () => {
    const assessment = assessAnalysis(raw());
    assert.equal(assessment.kind, 'usable');
    assert.equal(assessment.kind === 'usable' && assessment.result.toneBand, 'V');
  });

  it('derives the band when the model omits it', () => {
    const assessment = assessAnalysis(raw({ ita_degrees: -45 }));
    assert.equal(assessment.kind === 'usable' && assessment.result.toneBand, 'VI');
  });

  it('refuses a band that disagrees with the measured pigmentation', () => {
    const assessment = assessAnalysis(raw({ tone_band: 'I', ita_degrees: -60 }));
    assert.equal(assessment.kind, 'rejected');
    assert.equal(assessment.kind === 'rejected' && assessment.code, 'inconsistent');
  });

  it('flags mid confidence as low, not usable', () => {
    const assessment = assessAnalysis(raw({ confidence: 0.5 }));
    assert.equal(assessment.kind, 'low_confidence');
  });

  it('rejects a response the model was not confident about at all', () => {
    const assessment = assessAnalysis(raw({ confidence: 0.2 }));
    assert.equal(assessment.kind, 'rejected');
    assert.equal(assessment.kind === 'rejected' && assessment.code, 'unreadable');
  });

  it('rejects a photo that is not skin', () => {
    const assessment = assessAnalysis(raw({ subject: 'not_skin' }));
    assert.deepEqual(assessment.kind === 'rejected' ? assessment.code : null, 'not_skin');
  });

  it('rejects a malformed response rather than storing a partial one', () => {
    const assessment = assessAnalysis({ evenness_score: 80 });
    assert.equal(assessment.kind, 'rejected');
  });

  it('normalises concerns and drops unknown ones', () => {
    const assessment = assessAnalysis(raw({ concerns: ['Body Acne', 'dryness', 'gluten_intolerance', 'sensitivity'] }));
    assert.deepEqual(assessment.kind !== 'rejected' && assessment.result.concerns, [
      'body_acne',
      'dryness',
      'sensitivity',
    ]);
  });

  it('drops evidence that makes a medical claim', () => {
    const assessment = assessAnalysis(
      raw({ evidence: ['signs of eczema', 'uneven pigmentation on the forearm'] }),
    );
    assert.deepEqual(assessment.kind !== 'rejected' && assessment.result.evidence, [
      'uneven pigmentation on the forearm',
    ]);
  });
});

describe('safeEvidence', () => {
  it('drops tone judgements and diagnoses, keeping observations', () => {
    assert.deepEqual(
      safeEvidence(['lightening would help', 'visible flaking', 'mild dermatitis']),
      ['visible flaking'],
    );
  });
});

describe('requiresRetake', () => {
  it('accepts a clean capture', () => {
    assert.equal(requiresRetake(result(), capture()), null);
  });

  it('asks for a retake on each capture defect', () => {
    assert.equal(requiresRetake(result(), capture({ blurScore: 50 })), 'blurry');
    assert.equal(requiresRetake(result(), capture({ brightness: 50 })), 'too_dark');
    assert.equal(requiresRetake(result(), capture({ brightness: 220 })), 'too_bright');
    assert.equal(requiresRetake(result(), capture({ glareFraction: 0.1 })), 'glare');
  });

  it('refuses a confident reading of dark skin in marginal light', () => {
    assert.equal(
      requiresRetake(result({ toneBand: 'VI' }), capture({ brightness: 75 })),
      'dark_skin_marginal_light',
    );
    // The same light is fine for a light band: the guard is about where the error risk is.
    assert.equal(requiresRetake(result({ toneBand: 'II' }), capture({ brightness: 75 })), null);
  });
});

describe('retakeCopy', () => {
  it('names the defect and asks again', () => {
    for (const reason of ['too_dark', 'too_bright', 'glare', 'blurry', 'dark_skin_marginal_light'] as const) {
      const copy = retakeCopy(reason);
      assert.match(copy, /try again/i);
      assert.ok(copy.length < 140, `${reason} copy too long`);
    }
  });
});
