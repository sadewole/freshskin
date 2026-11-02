import { z } from 'zod';

/**
 * The skin analysis contract (§13.3), enforced in code so a malformed or overconfident model
 * response cannot be stored as a result.
 *
 * Everything here is pure: no IO, no clock, no randomness. The provider adapter feeds it raw
 * JSON and it decides whether that JSON is allowed to become an analysis.
 */

export type ToneBand = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
export type Undertone = 'warm' | 'cool' | 'neutral' | 'olive';
export type SkinConcern = 'dryness' | 'flakiness' | 'uneven_tone' | 'body_acne' | 'sensitivity' | 'texture';

export interface TextureScores {
  readonly hydration: number;
  readonly roughness: number;
  readonly flakiness: number;
}

export interface SkinAnalysisResult {
  readonly toneBand: ToneBand;
  readonly itaDegrees: number;
  readonly undertone: Undertone;
  readonly evennessScore: number;
  readonly textureScores: TextureScores;
  readonly concerns: readonly SkinConcern[];
  readonly confidence: number;
  readonly evidence: readonly string[];
}

export type RejectCode = 'not_skin' | 'unreadable' | 'inconsistent';

export type AnalysisAssessment =
  | { readonly kind: 'usable'; readonly result: SkinAnalysisResult }
  | { readonly kind: 'low_confidence'; readonly result: SkinAnalysisResult }
  | { readonly kind: 'rejected'; readonly code: RejectCode; readonly message: string };

export const USABLE_CONFIDENCE = 0.55;
export const FLOOR_CONFIDENCE = 0.4;

const CONCERNS: readonly SkinConcern[] = [
  'dryness',
  'flakiness',
  'uneven_tone',
  'body_acne',
  'sensitivity',
  'texture',
];

const modelOutput = z.object({
  tone_band: z.enum(['I', 'II', 'III', 'IV', 'V', 'VI']).optional(),
  ita_degrees: z.coerce.number().min(-90).max(90).optional(),
  undertone: z.enum(['warm', 'cool', 'neutral', 'olive']).optional(),
  evenness_score: z.coerce.number().min(0).max(100),
  texture_scores: z.object({
    hydration: z.coerce.number().min(0).max(100),
    roughness: z.coerce.number().min(0).max(100),
    flakiness: z.coerce.number().min(0).max(100),
  }),
  concerns: z.array(z.string()).default([]),
  confidence: z.coerce.number().min(0).max(1),
  evidence: z.array(z.string()).default([]),
  subject: z.enum(['skin', 'not_skin']).optional(),
});

export type RawModelOutput = z.input<typeof modelOutput>;

/**
 * Standard Fitzpatrick/ITA mapping. The boundaries are inclusive at the darker end so the
 * function is total and never returns undefined.
 */
export function toneFromIta(ita: number): ToneBand {
  if (ita > 55) return 'I';
  if (ita > 41) return 'II';
  if (ita > 28) return 'III';
  if (ita > 10) return 'IV';
  if (ita >= -30) return 'V';
  return 'VI';
}

const BAND_RANK: Record<ToneBand, number> = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5 };

/** A band may differ from the ITA estimate by at most one; more than that is a model bug. */
export function bandConsistent(band: ToneBand, ita: number): boolean {
  return Math.abs(BAND_RANK[band] - BAND_RANK[toneFromIta(ita)]) <= 1;
}

const BANNED_LANGUAGE = /\b(eczema|psoriasis|dermatitis|melanoma|cancer|lightening|whitening)\b/i;

/**
 * §13.3 language guardrails. Evidence is dropped, not rewritten: if the model editorialised,
 * the observation is not trustworthy.
 */
export function safeEvidence(evidence: readonly string[]): string[] {
  return evidence.filter((line) => !BANNED_LANGUAGE.test(line)).slice(0, 5);
}

function normaliseConcerns(concerns: readonly string[]): SkinConcern[] {
  const found = new Set<SkinConcern>();
  for (const raw of concerns) {
    const candidate = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if ((CONCERNS as readonly string[]).includes(candidate)) found.add(candidate as SkinConcern);
  }
  return [...found].slice(0, 4);
}

/**
 * Turns a raw provider response into a decision. Refusal is a first-class outcome: the caller
 * must not be able to store a result the model was not confident about.
 */
export function assessAnalysis(raw: unknown): AnalysisAssessment {
  const parsed = modelOutput.safeParse(raw);
  if (!parsed.success) {
    return { kind: 'rejected', code: 'unreadable', message: 'the model response did not match the contract' };
  }

  const output = parsed.data;

  if (output.subject === 'not_skin') {
    return { kind: 'rejected', code: 'not_skin', message: 'no skin was detected in this photo' };
  }

  // The ITA estimate is authoritative; the band is derived, then checked against whatever the
  // model claimed. Disagreement means one of the two was wrong, so neither is trusted.
  const ita = output.ita_degrees ?? itaForBand(output.tone_band ?? 'III');

  if (output.tone_band !== undefined && !bandConsistent(output.tone_band, ita)) {
    return {
      kind: 'rejected',
      code: 'inconsistent',
      message: 'tone band disagreed with the measured pigmentation',
    };
  }

  const result: SkinAnalysisResult = {
    toneBand: output.tone_band ?? toneFromIta(ita),
    itaDegrees: ita,
    undertone: output.undertone ?? 'neutral',
    evennessScore: Math.round(output.evenness_score),
    textureScores: {
      hydration: Math.round(output.texture_scores.hydration),
      roughness: Math.round(output.texture_scores.roughness),
      flakiness: Math.round(output.texture_scores.flakiness),
    },
    concerns: normaliseConcerns(output.concerns),
    confidence: Math.round(output.confidence * 100) / 100,
    evidence: safeEvidence(output.evidence),
  };

  if (result.confidence < FLOOR_CONFIDENCE) {
    return { kind: 'rejected', code: 'unreadable', message: 'the model could not read this photo' };
  }
  if (result.confidence < USABLE_CONFIDENCE) {
    return { kind: 'low_confidence', result };
  }
  return { kind: 'usable', result };
}

function itaForBand(band: ToneBand): number {
  switch (band) {
    case 'I':
      return 60;
    case 'II':
      return 48;
    case 'III':
      return 34;
    case 'IV':
      return 19;
    case 'V':
      return -10;
    case 'VI':
      return -45;
  }
}

// ---------------------------------------------------------------------------
// Capture quality and the bias guard
// ---------------------------------------------------------------------------

export interface CaptureQuality {
  readonly brightness: number; // 0..255 mean luminance
  readonly glareFraction: number; // 0..1 saturated pixels
  readonly blurScore: number;
}

export type RetakeReason =
  | 'too_dark'
  | 'too_bright'
  | 'glare'
  | 'blurry'
  | 'dark_skin_marginal_light';

/**
 * The bias guard in §13.3: for the darkest bands, thin exposure margins produce confident
 * errors, so we ask for a retake instead of guessing. This is the one place where a *good*
 * looking result is still refused.
 */
export function requiresRetake(result: SkinAnalysisResult, capture: CaptureQuality): RetakeReason | null {
  if (capture.blurScore < 100) return 'blurry';
  if (capture.brightness < 70) return 'too_dark';
  if (capture.brightness > 200) return 'too_bright';
  if (capture.glareFraction > 0.03) return 'glare';

  const darkBand = result.toneBand === 'V' || result.toneBand === 'VI';
  if (darkBand && capture.brightness < 80) return 'dark_skin_marginal_light';

  return null;
}

export function retakeCopy(reason: RetakeReason): string {
  switch (reason) {
    case 'too_dark':
      return 'This photo is too dark to read your skin. Try again facing a window.';
    case 'too_bright':
      return 'This photo is washed out. Try again out of direct sunlight.';
    case 'glare':
      return 'There is glare on your skin. Try again without a direct light source.';
    case 'blurry':
      return 'This photo is blurry. Try again and hold the phone steady.';
    case 'dark_skin_marginal_light':
      return 'Skin this tone needs even light to read accurately. Try again facing a window.';
  }
}
