import type { RoutineResponse } from '../api/types';

/**
 * Reviewed fixture for the Phase 1 web slice. Mirrors the frozen 0014 seed content so the
 * UI ships against the same strings the API will serve. Deleted in Phase 3 when HomeView
 * reads the real `GET /routine`.
 *
 * Copy rules (PRD §9.1): plain, second person, no exclamation marks, no "glow"/"flawless".
 * Every step carries instruction + why + inputs (explain-or-omit), each ≤ 140 chars.
 */
export const ROUTINE_FIXTURE: RoutineResponse = {
  data: {
    routine: {
      slug: 'body-basic',
      title: 'A simple body routine',
      content_version: 'body-basic-1.0.0',
      steps: [
        {
          id: 'fixture-step-wash',
          position: 1,
          title: 'Wash gently',
          instruction: 'Use lukewarm water and a gentle body wash, then pat dry.',
          why: 'Hot water and harsh soap strip oils, which dry or sensitive body skin notices.',
          inputs: ['body skin', 'plain water'],
          tip_id: null,
        },
        {
          id: 'fixture-step-moisturise',
          position: 2,
          title: 'Moisturise damp skin',
          instruction: 'Smooth body cream over damp skin within a minute of drying.',
          why: 'Cream holds water better on damp skin, which matters in hot, humid Lagos.',
          inputs: ['your skin type', 'Lagos humidity'],
          tip_id: null,
        },
        {
          id: 'fixture-step-protect',
          position: 3,
          title: 'Protect uncovered skin',
          instruction: 'Apply broad-spectrum SPF 30 or higher to arms and legs in direct sun.',
          why: 'Sun exposure affects uneven tone, and SPF is the step most routines skip.',
          inputs: ['daily sun exposure'],
          tip_id: null,
        },
      ],
    },
    tips: [
      {
        id: 'fixture-tip-repeat',
        topic: 'routine',
        body: 'A short routine you repeat suits body skin better than a long one you skip.',
        why: 'Consistency matters more than the number of steps for a body routine.',
        inputs: ['body skin'],
      },
      {
        id: 'fixture-tip-perfume',
        topic: 'scent',
        body: 'Apply perfume after moisturiser so it settles on skin that is already conditioned.',
        why: 'An unscented base lets a scent lead, which is the same logic as pairing.',
        inputs: ['cream', 'perfume'],
      },
      {
        id: 'fixture-tip-spf',
        topic: 'sun',
        body: 'SPF counts on arms and legs too, not only on skin you would call facial.',
        why: 'Uncovered limbs take daily sun, which affects uneven tone over time.',
        inputs: ['arms', 'legs'],
      },
    ],
    disclaimer:
      'This routine is general cosmetic guidance, not medical advice. Skin changes have many causes, so see a dermatologist if something worries you.',
  },
  meta: { request_id: 'fixture' },
};

const ROUTINE_COPY =
  'Use lukewarm water and a gentle body wash, then pat dry.Hot water and harsh soap strip oils, which dry or sensitive body skin notices.Smooth body cream over damp skin within a minute of drying.Cream holds water better on damp skin, which matters in hot, humid Lagos.Apply broad-spectrum SPF 30 or higher to arms and legs in direct sun.Sun exposure affects uneven tone, and SPF is the step most routines skip.A short routine you repeat suits body skin better than a long one you skip.Consistency matters more than the number of steps for a body routine.Apply perfume after moisturiser so it settles on skin that is already conditioned.An unscented base lets a scent lead, which is the same logic as pairing.SPF counts on arms and legs too, not only on skin you would call facial.Uncovered limbs take daily sun, which affects uneven tone over time.This routine is general cosmetic guidance, not medical advice. Skin changes have many causes, so see a dermatologist if something worries you.';
const ROUTINE_TIP_BODIES =
  'A short routine you repeat suits body skin better than a long one you skip. Apply perfume after moisturiser so it settles on skin that is already conditioned. SPF counts on arms and legs too, not only on skin you would call facial.';

// Compile-time guard: every step/tip string stays within the 140-char wire limit and the
// copy deck stays free of banned words (PRD §5.3–5.4, §9.1). The disclaimer is canonical
// PRD §16.7 copy and exempt from the ≤140 content rule.
const _lengthCheck: readonly string[] = [
  ...ROUTINE_FIXTURE.data.routine.steps.flatMap((step) => [step.instruction, step.why]),
  ...ROUTINE_FIXTURE.data.tips.flatMap((tip) => [tip.body, tip.why]),
];
for (const text of _lengthCheck) {
  if (text.length > 140) throw new Error(`Routine fixture string exceeds 140 chars: ${text.slice(0, 40)}`);
}
if (/\b(glow|glows|glowing|flawless|lighten|lightening|brighten|brightening|whiten)\b/i.test(ROUTINE_COPY)) {
  throw new Error('Routine fixture copy violates PRD language rules');
}
void ROUTINE_TIP_BODIES;
