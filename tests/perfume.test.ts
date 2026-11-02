import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recommend } from '../src/rec/pipeline.js';
import {
  assertWeightsNormalised,
  dislikedPenalty,
  familyAffinity,
  noteOverlap,
  performanceFit,
  perfumeClimateFit,
  TERMS_BY_KIND,
} from '../src/rec/terms.js';
import type {
  Candidate,
  FragrancePreferences,
  PerfumeFacts,
  RecommendationRequest,
  ViewerFacts,
} from '../src/rec/types.js';

const prefs = (over: Partial<FragrancePreferences> = {}): FragrancePreferences => ({
  familiesLiked: ['Floral'],
  familiesDisliked: [],
  notesLoved: ['Rose'],
  notesAvoided: [],
  strength: 'moderate',
  occasions: ['daily'],
  budgetMaxNgn: 60_000,
  ...over,
});

const facts = (over: Partial<PerfumeFacts> = {}): PerfumeFacts => ({
  familyNames: ['Floral'],
  noteNames: ['Rose', 'Cedar'],
  heartAndBaseNotes: ['Rose', 'Cedar'],
  longevity: 3,
  projection: 3,
  occasions: ['daily'],
  ...over,
});

const viewer = (over: Partial<ViewerFacts> = {}): ViewerFacts => ({
  userId: 'u1',
  skinType: 'dry',
  concerns: [],
  climateZone: 'hot_humid',
  budgetMaxNgn: null,
  feedbackAffinity: 0.5,
  fragrance: prefs(),
  ...over,
});

const perfumeCandidate = (over: {
  id: string;
  brand?: string;
  price?: number;
  perfume?: Partial<PerfumeFacts>;
}): Candidate => ({
  product: {
    id: over.id,
    name: `Scent ${over.id}`,
    brandName: over.brand ?? 'House',
    category: 'perfume',
    priceNgn: over.price ?? 30_000,
    availability: 'in_stock',
    richness: null,
    fragranceFree: null,
    facts: {
      irritancyAvg: 0,
      comedogenicMax: 0,
      humectantRatio: 0,
      occlusiveRatio: 0,
      beneficialCount: 0,
    },
    perfume: facts(over.perfume),
  },
  surface: { kind: 'notes', disclosure: 'partial', items: [] },
});

describe('perfume terms', () => {
  it('rewards a liked family', () => {
    assert.equal(familyAffinity(facts({ familyNames: ['Floral'] }), prefs()), 1);
    assert.equal(familyAffinity(facts({ familyNames: ['Woody'] }), prefs()), 0);
  });

  it('is neutral, not zero, when the quiz is not taken', () => {
    assert.equal(familyAffinity(facts(), null), 0.5);
  });

  it('penalises a disliked family that still reached scoring', () => {
    const withDislike = prefs({ familiesLiked: [], familiesDisliked: ['Woody'] });
    assert.equal(familyAffinity(facts({ familyNames: ['Woody'] }), withDislike), 0);
  });

  it('weights a loved base note above a loved top note', () => {
    const baseLoved = prefs({ notesLoved: ['Cedar'] });
    const topLoved = prefs({ notesLoved: ['Bergamot'] });
    const base = noteOverlap(facts({ noteNames: ['Cedar'], heartAndBaseNotes: ['Cedar'] }), baseLoved);
    const top = noteOverlap(
      facts({ noteNames: ['Bergamot'], heartAndBaseNotes: [] }),
      topLoved,
    );
    assert.ok(base > top, `base ${base} should beat top ${top}`);
  });

  it('matches strength preference to longevity', () => {
    const strong = prefs({ strength: 'strong' });
    assert.equal(performanceFit(facts({ longevity: 4 }), strong), 1);
    assert.ok(performanceFit(facts({ longevity: 1 }), strong) < 0.5);
  });

  it('prefers fresh fragrances in humid heat and heavy ones in the cold', () => {
    const fresh = facts({ familyNames: ['Citrus'] });
    const heavy = facts({ familyNames: ['Gourmand'] });
    assert.ok(
      perfumeClimateFit(fresh, viewer({ climateZone: 'hot_humid' })) >
        perfumeClimateFit(heavy, viewer({ climateZone: 'hot_humid' })),
    );
    assert.ok(
      perfumeClimateFit(heavy, viewer({ climateZone: 'cold' })) >
        perfumeClimateFit(fresh, viewer({ climateZone: 'cold' })),
    );
  });

  it('penalises an avoided note', () => {
    const avoids = prefs({ notesAvoided: ['Patchouli'] });
    assert.equal(dislikedPenalty(facts({ noteNames: ['Patchouli'] }), avoids), 1);
    assert.equal(dislikedPenalty(facts({ noteNames: ['Rose'] }), avoids), 0);
  });
});

describe('weights', () => {
  it('are normalised for both kinds', () => {
    assert.doesNotThrow(() => assertWeightsNormalised(TERMS_BY_KIND.cream));
    assert.doesNotThrow(() => assertWeightsNormalised(TERMS_BY_KIND.perfume));
  });

  it('reject a registry whose positive weights drift off 1', () => {
    assert.throws(() => assertWeightsNormalised([{ id: 'x', weight: 0.9, appliesTo: ['cream'], compute: () => 1 }]));
  });

  it('reject an unbounded penalty', () => {
    assert.throws(() =>
      assertWeightsNormalised([
        { id: 'x', weight: 1, appliesTo: ['perfume'], compute: () => 1 },
        { id: 'p', weight: -0.5, appliesTo: ['perfume'], compute: () => 1 },
      ]),
    );
  });
});

describe('perfume ranking', () => {
  const request: RecommendationRequest = { kind: 'perfume', limit: 10, narrowing: {} };

  const run = (candidates: readonly Candidate[], v: ViewerFacts = viewer()) =>
    recommend({
      viewer: v,
      sensitivities: [],
      candidates,
      request,
      profileVersion: 'pv-1',
      capped: false,
      day: '2026-11-02',
    });

  it('uses the perfume term registry and marks the plan kind', () => {
    const plan = run([perfumeCandidate({ id: 'a' })]);
    assert.equal(plan.meta.kind, 'perfume');
    assert.deepEqual(Object.keys(plan.items[0]?.terms ?? {}).sort(), [
      'budget_fit',
      'climate_fit',
      'disliked_penalty',
      'family_affinity',
      'note_overlap',
      'novelty',
      'occasion_fit',
      'performance_fit',
    ]);
  });

  it('ranks the liked family above an unrelated one', () => {
    const plan = run([
      perfumeCandidate({ id: 'woody', perfume: { familyNames: ['Woody'], noteNames: ['Cedar'], heartAndBaseNotes: ['Cedar'] } }),
      perfumeCandidate({ id: 'floral', perfume: { familyNames: ['Floral'], noteNames: ['Rose'], heartAndBaseNotes: ['Rose'] } }),
    ]);
    assert.equal(plan.items[0]?.product.id, 'floral');
  });

  it('excludes a disliked family outright', () => {
    const plan = run([perfumeCandidate({ id: 'woody', perfume: { familyNames: ['Woody'] } })], viewer({
      fragrance: prefs({ familiesDisliked: ['Woody'], familiesLiked: ['Floral'] }),
    }));

    assert.equal(plan.items.length, 0);
    assert.equal(plan.rejected[0]?.code, 'family_disliked');
    assert.match(plan.rejected[0]?.reason ?? '', /Woody/);
  });

  it('still recommends when the quiz was skipped, using neutral priors', () => {
    const plan = run([perfumeCandidate({ id: 'a' })], viewer({ fragrance: null }));
    assert.equal(plan.items.length, 1);
  });

  it('caps a family at three in the page', () => {
    const plan = run(
      Array.from({ length: 6 }, (_, index) =>
        perfumeCandidate({ id: `floral-${index}`, brand: `House ${index}` }),
      ),
    );
    assert.equal(plan.items.length, 3);
  });
});
