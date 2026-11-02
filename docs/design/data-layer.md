# FreshSkin data layer — design

**Status:** synthesized, ready to build · **Date:** November 2, 2026
**Method:** three independent candidates (domain-first, schema-first, pipeline-first), scored against a rubric fixed before fan-out, then synthesized. Base and grafts recorded in [Synthesis decision](#synthesis-decision).
**Scope:** the boundary between Postgres, the TypeScript domain logic, and the HTTP API. Not the UI, not the AI pipelines.

## Problem

FreshSkin's data layer holds ~750 products with an INCI and note graph, health-adjacent per-user profiles, a two-stage recommendation engine with non-bypassable safety exclusions, an image-to-verdict pipeline with 24-hour retention, and export/erasure duties. Four boundaries are designed at once: Postgres↔domain, domain↔HTTP, request↔job, and user-data↔catalogue-data.

The failure modes that matter are not slow queries. They are:

- allergen rules re-derived in three places, then drifting;
- a `jsonb` attribute decoding to `undefined` and scoring as `NaN`;
- a request handler and a nightly purge sharing one privileged connection;
- a caller that filters candidates itself and quietly drops an exclusion;
- an `avoid` verdict emitted from a half-parsed label;
- a hand-maintained export or cascade list that misses a table added next month.

The design's job is to make those not expressible, not merely discouraged.

## Usage (caller's view)

Written before the types; the sketch below was derived from these four call sites.

**1 — the recommendation endpoint, in full.** The route knows nothing about scoring, exclusions, or storage.

```ts
// http/routes/recommendations.ts
export async function getCreams(c: Ctx) {
  const viewer = await viewers.require(c);              // 401/403; consent already enforced
  const req    = CreamQuery.parse(c.req.query());       // -> RecommendationRequest
  const plan   = await planRecommendations(req, viewer);
  const ids    = await recommendationStore.remember(plan);
  return json(present(plan, ids), 200, { 'x-request-id': c.get('requestId') });
}
```

**2 — feedback, which needs the id the wire now carries.**

```ts
// http/routes/feedback.ts
const [rec] = await recommendationStore.byIds([body.recommendation_id], viewer);
await feedback.record({ viewer, rec, action: body.action, reason: body.dismiss_reason });
```

**3 — scan submission. Consent is an argument, not a check to remember.**

```ts
// http/routes/scans.ts
const viewer = await viewers.requireWith(c, 'image_processing');
const scan   = await scans.start({ viewer, idemKey: requiredHeader(c.req, 'Idempotency-Key'), imageKey });
return json({ id: scan.id }, 202);                      // replay returns the original id
```

**4 — the purge job. The only importer of the RLS-bypassing client.**

```ts
// jobs/purge-images.ts
import { systemDb } from '../db/system';
await purgeExpiredImages(systemDb, { olderThanHours: 24, limit: 5000 });
```

What no caller writes, in any of these: `WHERE data_confidence >= 0.7`, `WHERE user_id = $1`, a consent check, `0.60` or `0.95`, a `deleted_at IS NULL`, or a status-transition guard.

## Shape

### Module map

```
db/         schema.ts  rls.sql  grants.sql  user.ts (withUser)  system.ts (BYPASSRLS)
catalogue/  projection.ts (row+jsonb -> ProductFacts, Zod)  readiness.ts  views/*.sql
safety/     conflicts.ts          <- the one home for allergen/sensitivity detection
rec/        pipeline.ts  types.ts  terms.ts  rules.ts  diversity.ts  explain.ts  viewer.ts
http/       present.ts (pure, branch-free)  routes/*.ts
scans/      verdict.ts  lifecycle.ts
jobs/       purge-images.ts  export.ts  import-catalogue.ts
```

`rec/pipeline.ts` is the only file that knows the stage order. `http/` may import `rec/index.ts` and its own `present.ts`; it may not import `db/*`, `rec/terms.ts`, `rec/rules.ts`, or `catalogue/views/*` (dependency-cruiser rule, plus an import-graph test). `catalogue/` may not import `rec/` or `http/`.

### The pipeline

Recommendation is four typed stages over one shared `Candidate`. Each stage's output is branded with a module-private symbol, so only the producing stage can construct it and skipping a stage is a type error rather than a convention.

```ts
// rec/types.ts
declare const stage: unique symbol;                   // never exported
type At<S extends string, T> = T & { readonly [stage]: S };

export type Eligible    = At<'eligible',    { candidates: readonly Candidate[]; rejected: readonly Rejection[]; capped: boolean }>;
export type Scored      = At<'scored',      { ranked: readonly ScoredItem[] }>;
export type Constrained = At<'constrained', { page: readonly ScoredItem[]; overflow: readonly ScoredItem[]; relaxed: boolean }>;
export type Plan        = At<'explained',   { sessionId: SessionId; algorithmVersion: AlgorithmVersion;
                                              profileVersion: ProfileVersion; items: readonly ExplainedItem[];
                                              rejected: readonly Rejection[]; totalMatched: number;
                                              narrowing: Narrowing }>;

export interface Candidate {
  readonly product: CatalogueProduct;      // typed projection; never a DB row
  readonly surface: CosmeticSurface;       // normalised allergen-bearing surface
}
export interface ScoredItem    extends Candidate { readonly terms: TermScores; readonly value: number }
export interface ExplainedItem extends ScoredItem { readonly rank: number; readonly displayScore: DisplayScore;
                                                    readonly reason: Reason; readonly flags: readonly Flag[] }

export interface RecommendationRequest {
  readonly kind: 'cream' | 'perfume' | 'similar' | 'pairing';
  readonly limit: number;                            // 1..24
  readonly narrowing: Narrowing;                     // subtraction only
  readonly includeOwned?: boolean;                   // the only widening toggle, and not a safety property
}

export interface Narrowing {                         // no field can name an allergen, a severity, or raise a ceiling
  readonly maxPriceNgn?: number; readonly fragranceFree?: boolean; readonly inStockOnly?: boolean;
  readonly families?: readonly Family[]; readonly cheaperOnly?: boolean;
}
```

```ts
// rec/pipeline.ts — the only composition of the four stages
export async function planRecommendations(req: RecommendationRequest, viewer: Viewer): Promise<Plan> {
  throw notImplemented('planRecommendations');
}

function eligibility(recipe: Recipe, pool: readonly Candidate[], v: ViewerFacts): Eligible { /* not implemented */ }
function scoring(recipe: Recipe, e: Eligible, v: ViewerFacts): Scored { /* not implemented */ }
function constrain(recipe: Recipe, s: Scored, v: ViewerFacts, req: RecommendationRequest): Constrained { /* not implemented */ }
function explain(recipe: Recipe, c: Constrained, v: ViewerFacts): Plan { /* not implemented */ }

function seal(items: readonly ExplainedItem[], meta: PlanMeta): Plan { /* the sole constructor of Plan */ }
```

Public surface: `planRecommendations`, `Plan`, `RecommendationRequest`. The stage functions are deliberately not exported — exporting them would make skipping the safety chain a one-line mistake.

### Two registries, no formula function

```ts
// rec/terms.ts — the registry IS the formula
export interface ScoreTerm {
  readonly id: TermId; readonly weight: number;      // negative weights allowed (dislikedPenalty)
  readonly appliesTo: readonly RecKind[];
  readonly compute: (c: Candidate, v: ViewerFacts, ctx: RecipeContext) => Unit;
}
export const SCORE_TERMS: readonly ScoreTerm[];      // not implemented

// rec/rules.ts — the registry IS the exclusion set
export interface ExclusionRule {
  readonly id: ExclusionId; readonly appliesTo: readonly RecKind[]; readonly order: number;
  readonly evaluate: (c: Candidate, v: ViewerFacts, ctx: RecipeContext) => Rejection | null;
}
export const EXCLUSION_RULES: readonly ExclusionRule[];
```

Adding a term is one hunk in `terms.ts`:

```ts
{ id: 'occlusive_balance', weight: 0.05, appliesTo: ['cream'],
  compute: (c, v) => balance(c.product.ingredients, v.climateZone) },
```

`TermId = typeof SCORE_TERMS[number]['id']`, so the `breakdown` type, the stored column, and the wire field all widen by themselves. Adding an exclusion is one element in `rules.ts`. `evaluate()` never receives `RecommendationRequest`, so caller input cannot reach a hard exclusion.

`algorithmVersion` is a hash of both registries. A new term therefore invalidates the session cache and stamps new `recommendations` rows without anyone remembering to bump a string.

Weights are asserted to sum to 1.0 per kind at module load, and a separate test transcribes §14.2/§14.3 literals to catch registry typos.

### One home for safety

```ts
// safety/conflicts.ts
export type Collision = { readonly sensitivity: Sensitivity; readonly hit: SurfaceItem;
                          readonly kind: 'declared' | 'free_text_unresolved'; readonly severity: Severity };
export function assessContact(sensitivities: readonly Sensitivity[], surface: CosmeticSurface): readonly Collision[];
export function worstSeverity(cs: readonly Collision[]): Severity | null;
export const SEVERITY_RANK: Readonly<Record<Severity, number>>;
```

Detection and ordering live here and only here. The three consumers apply their own **consequence**, never their own detection:

| Consumer | Consequence |
| --- | --- |
| cream eligibility | `worstSeverity === 'severe'` → exclude with `sensitivity_severe` |
| perfume flagging | any collision → `allergen_present` flag and a caution clause; sets `allergens_undisclosed` when notes are all we have |
| scan verdict (§13.4) | severe → `avoid`; mild/moderate with 2+ matches → `avoid`; else `okay` with a warning |

### The jsonb seam

`products.attributes` stays `jsonb` at rest — it is the shape the import pipeline actually receives — but it is promoted at the seam so no logic layer ever reads it:

- Generated stored columns `richness text` and `fragrance_free boolean` are indexed for the browse filter, so filtering is not a sequential scan over an untyped field.
- A `CHECK` asserts the jsonb shape per category: a cream must carry a boolean `fragrance_free` and a `richness` in `('light','medium','rich')`. A malformed row cannot be written, by hand or by import.
- `catalogue/projection.ts` parses `attributes` into a `ProductFacts` discriminated union with Zod and is the only file that knows the field names. A parse failure demotes the product to `draft` rather than crashing a request or scoring `undefined` as `0`.

This is the cheapest fix for the likeliest silent bug in the whole schema: a `jsonb` key that decodes to `undefined` and quietly changes a score.

### Two thresholds, two types

The catalogue gate (95% INCI match) and the scan gate (60% parse) answer different questions and must never be unified. They live in different modules *and* different branded types, so passing one where the other is expected does not compile.

```ts
// catalogue/readiness.ts
export type CatalogueCoverage = number & { readonly __coverage: 'catalogue-inci' };  // >= 0.95
export const CATALOGUE_READY_AT = 0.95;

// scans/verdict.ts
export type ScanCoverage = number & { readonly __coverage: 'scan-parse' };           // >= 0.60
export const VERDICT_PARSE_FLOOR = 0.60;
export const VERDICT_MIN_MATCHED = 5;
```

### Consent as a capability

`viewers.require(c)` mints a `ViewerWith<...>` per request from the session cookie and the append-only consent ledger. The capability is never cached across requests, so withdrawal takes effect on the next request. Jobs use `viewerForJob(job, userId, purposes)`, which re-reads consent at run time — consent may have been withdrawn between queue and execution.

```ts
scans.start({ viewer }: { viewer: ViewerWith<'image_processing'> }, ...)   // an unconsented viewer does not typecheck
```

### RLS and privileges

Two roles, and the split is the guarantee:

- `freshskin_app` — no `BYPASSRLS`, policies on every user-owned table using `app.current_user_id()`, and **no `SELECT` on `products`, `product_variants`, or `product_ingredients`**. Catalogue reads go through `security_invoker` views. A developer who writes `db.select().from(products)` gets `permission denied` on the first test run.
- `freshskin_system` — `BYPASSRLS`, credentials present only in the worker process, imported only by `jobs/`. An import-graph test fails if anything else reaches it.
- `freshskin_support` — read-only, `SELECT` on `v_support_*` views only, which exclude images, free-text sensitivities, and email. It exists so that an incident does not create pressure to hand out system credentials.

`SET LOCAL app.user_id` only, inside a transaction. A session-level `SET` through a transaction pooler would leak one user's identity into the next request; a lint rule bans bare `SET`.

A `BEFORE INSERT` trigger on `skin_analyses` and `scans` raises `CONSENT_MISSING` when image-processing consent is absent. Triggers fire for the system role too, which makes this stronger than RLS.

### Lifecycle, and the image that stopped existing

The state machine is the `WHERE` clause: `UPDATE ... WHERE id = $1 AND status = ANY($from)`; `rowCount = 0` means a conflict, not a corruption. Two workers cannot both finalise. A `BEFORE UPDATE` trigger rejects illegal edges that a backfill or a psql session might attempt.

```sql
CHECK (verdict IS NULL OR (match_rate >= 0.60 AND jsonb_array_length(parsed) >= 5))
CHECK (status <> 'complete' OR (match_rate IS NOT NULL AND parsed IS NOT NULL))
```

`image_key` is nullable, and every read returns a sum type, so the 24-hour gap is a branch rather than an exception:

```ts
export type PresentableImage =
  | { readonly kind: 'available'; readonly url: SignedUrl; readonly expiresAt: Instant }
  | { readonly kind: 'purged'; readonly deletedAt: Instant };
```

The purge is idempotent by its predicate (`WHERE image_key IS NOT NULL AND created_at < now() - interval '24 hours'`), and object deletes are best-effort after the row update, so a crash converges on the next run.

### Export and erasure

The set of tables to export or erase is **derived by introspecting the Drizzle schema** for `user_id` columns and `user_id` primary keys, not hand-listed. The one hand-written list is the legally-retained exception set (`consent_records`, aggregate counts), which §16.4 fixes. A coverage test fails when a new user-owned table has no export mapping.

Erasure runs as a job: 7-day grace, then objects before rows inside one transaction ordered by the FK graph, marked in `data_requests` so a crash resumes rather than restarts.

### The wire boundary

`present(plan, ids)` is pure and branch-free: it maps `Plan` to the §12.3 shape, including the `recommendation_id` each item now carries and the `excluded[]` array §14.2 promises. Nesting (`product`, `breakdown`) exists only here. Nothing in `rec/` or `catalogue/` knows a snake_case field name.

### Data flow (the dominant read, traced)

1. `viewers.load` — one query: profile, fragrance profile, sensitivities⋈ingredients, decayed feedback aggregate, owned/dismissed. Produces `ViewerFacts` plus a derived `profileVersion` (hash of the four `max(updated_at)`s; a wire field, never a column).
2. `catalogue.eligiblePool` — one query: `products` where `status = 'ready' AND is_active`, `category = $1`, ordered by the v1 editorial key (`data_confidence` desc, `verified_at` desc, `id`; no popularity signal exists yet), `LIMIT 500`, with the cheapest variant and one `ANY($ids)` fetch of ingredients.
3. `eligibility` — CPU, folds `EXCLUSION_RULES` in `order`.
4. `scoring` — CPU, folds `SCORE_TERMS`; `value = clamp01(Σwᵢtᵢ / Σwᵢ₊)`.
5. `constrain` — CPU: drop dismissed and owned items, apply quotas (2 per brand, 3 per primary family in the top 10), take overflow first, set `relaxed` when the page cannot be filled.
6. `explain` — CPU: deterministic template from `ReasonFacts` (top two terms plus one caution), ≤140 chars, no term names, no promises.
7. `recommendationStore.remember` — one batch insert, `unique(session_id, product_id)`.
8. `present` — pure map to §12.3.

Two round trips, ~2 ms of arithmetic over 450 products. `sessionId = uuidv5(ns, hash(userId, kind, narrowing, profileVersion, algorithmVersion, asOfDay))`, so a repeated `GET` is a replay of an identical run, not a duplicate write, and a refresh never rewords a stored reason.

## Where invariants live

| Invariant | Home | Why there |
| --- | --- | --- |
| Stage order cannot be skipped | types — private `unique symbol` brands | only the producing stage can construct the next input |
| `avoid` never from a partial parse | types — `UsableParse` gates `decideVerdict`; DB `CHECK` | both the in-memory path and a backfill are covered |
| Two thresholds never unified | types — `CatalogueCoverage` ≠ `ScanCoverage` | crossing them is a compile error |
| Allergen detection has one home | `safety/conflicts.ts` | three consumers, one detector |
| Hard exclusions cannot be bypassed | runtime — single `EXCLUSION_RULES` fold; `Narrowing` has no widening field; privilege blocks raw catalogue reads | no option type offers an escape hatch |
| Consent per purpose | types — `ViewerWith<...>` + job-time re-check | withdrawal is immediate |
| Draft products are unrecommendable | DB — generated `status` column, one predicate, indexed | cannot be written by a handler |
| RLS on every user-owned row | DB — `FORCE ROW LEVEL SECURITY`, no `BYPASSRLS` for the app role | binds every writer, including psql |
| System scope unreachable from a handler | privilege + import-graph test | absence of permission survives refactors |
| Lifecycle exclusivity | DB — guarded `UPDATE` + `BEFORE UPDATE` trigger | a concurrency fact, not a value |
| Image gone after 24h | types — `PresentableImage.purged` is a branch | cannot be ignored without failing to typecheck |
| Export completeness | derived from the Drizzle schema + coverage test | no hand-synced list |
| Stored reason immutability | DB — session fingerprint + `ON CONFLICT` | derive the key, do not remember to check |

## Synthesis decision

**Base: the pipeline candidate.** It wins the two rubric items most tied to extensibility — R2 (a new term or rule is one file, zero callers, with self-invalidating cache keys) and R6 (three public symbols hiding four stages, two registries, and the safety module). It also keeps policy in typed TypeScript that a reviewing agent can read, rather than in SQL that a reviewer may skim as plumbing.

**Grafts:**

| Graft | From | Why it improves the base |
| --- | --- | --- |
| Revoke `SELECT` on catalogue base tables; reads through `security_invoker` views | schema-first | Turns RLS from convention-plus-arch-test into a privilege. The wrong query now fails on the first run instead of in production. |
| Branded `CatalogueCoverage` / `ScanCoverage` types | schema-first | Stronger than two constants plus an arch test: crossing the thresholds is a compile error. |
| Export/erasure table set derived from the Drizzle schema | domain-first | Removes the hand-synced cascade list, the base's one clear red flag. |
| Consent minted per request, re-checked in jobs, never cached | domain-first | Makes withdrawal provably immediate for background work too. |
| `recommendation_id` and `excluded[]` on the wire | pipeline (as a flagged gap) | §12.3 was missing both; see the PRD amendment. |
| Deterministic session id from a hash of the full input | pipeline, echo in schema-first | Makes a writing `GET` idempotent and explains `profile_version` as a derived value. |

**Convergence worth trusting.** All three candidates independently arrived at: the two thresholds must stay separate; allergen logic needs exactly one home; a purged image is a normal branch rather than an error; and stored reason text needs a derived, not remembered, idempotency key. Independent agreement on four non-obvious points is stronger evidence than any single argument.

**Cross-judge: skipped.** The protocol requires a judge from a different model family; only one model is available here, so a same-model judge would add ceremony without independence. The rubric was scored by reading all three packages end to end. This is the degraded mode the adapter documents.

**Rejected as base — domain-first.** Eight workspace packages, two connection pools, a `product_facts` trigger, and lint rules generated from a boundary graph. It is the most rigorous of the three, and it is a poor fit for two engineers, eight engineer-days, and 750 products. `product_facts` is a denormalisation bought against a 12,500-row join that would run in single-digit milliseconds at this scale.

**Rejected as base — schema-first.** Elegant, and the strongest of the three on privilege enforcement. It loses on R2: adding an exclusion is an enum value plus a `WHEN` in a view — two files — and its own tradeoffs section admits SQL will be reviewed as plumbing. For a codebase an agent extends by copying the nearest example, a registry in TypeScript is a better target than a view definition.

## Tradeoffs accepted

- **Branded stage types cost type ceremony and slightly worse stack traces.** Bought R3/R4. Casting between stages is banned by lint; `seal` is the only cast.
- **Weights are data in `terms.ts`, not literals in a formula.** A reader must jump to see `0.30`. Bought R2. A transcription test guards against typos.
- **The eligibility pool is capped at 500, ordered editorially until real popularity exists.** Buys a bounded query. It can bury a good long-tail product; `capped: true` makes the truncation visible rather than silent, and D2 is the reminder to revisit it.
- **Two round trips instead of one join.** Bought a clean RLS story and two simple indexes; ~4 ms.
- **`GET /recommendations/*` writes rows.** Forced by §12.3 and by `POST /feedback`'s foreign key. Made safe by the derived session id.
- **`unknown` availability is treated like `out_of_stock` for recommendations, always.** §14.2 makes the stock rule conditional on a request filter; we treat it as unconditional here because recommending what cannot be bought is worse than a little lost recall. Browse still shows it.
- **Reasons are template-first in v1.** §13.6's four-call ceiling makes per-item phrasing impossible. The model rephrases at most the top 3.
- **Catalogue reads are view-only**, so the app pays a view-plan tax for a privilege boundary. Accepted: plans are reviewed once, privileges hold forever.
- **Three database roles** (app, system, support) are operational overhead. Accepted: process-level absence of privilege is the only version of "unreachable" that survives a refactor.

## Alternatives considered

**Rich domain model with repositories** (the domain-first base). Loses on three counts: it protects one entry point while import, purge, and backfill bypass it; it needs a hand-written mapper beside every generated row type; and it puts eligibility in a `boolean`-returning method that forces a second `whyExcluded()` for §14.2's excluded list, which then drifts. Rejected, not because it is wrong in general — it is wrong at 750 products and eight engineer-days.

**All policy in SQL views** (the schema-first base). The privilege half is grafted. The policy half is rejected: explanation is a ≤140-character string transform with banned phrasings, which is untestable in plpgsql, and every weight change becomes a migration.

**Exported stage functions** — four public entry points, composition at the call site, so skipping `eligibility` becomes a one-line mistake in a file that knows nothing about allergens. Rejected.

**A nightly materialised recommendation table.** Rejected: a sensitivity or budget edit must take effect on the next request (§16.3 withdrawal is immediate), and a stale row could serve a product the viewer is now allergic to. Kept only as the circuit-breaker degradation path in §17.2, clearly labelled.

**One `scoring.ts` with `if (category === 'cream')`.** Rejected: a new term edits two branches, and the cream/perfume asymmetry (negative weights, quotas) ends up encoded as branches rather than data.

## Decisions taken

Three questions were open at synthesis. They are now settled, so implementation does not stall on them.

| # | Question | Decision | Consequence |
| --- | --- | --- | --- |
| D1 | Fragrance families are free text, so a typo silently disables a `families_disliked` exclusion | **Canonical family table, validated at import.** Six families plus subfamilies in a lookup table; `products.families` references it. An unrecognised value demotes the product to `draft` rather than failing open. | Adds a table and a migration; makes bad data loud instead of silent. The import rejects the row, so it never reaches a recommendation. |
| D2 | The 500-candidate cap has no popularity signal to order by at launch | **Deterministic editorial order:** `data_confidence` desc, `verified_at` desc, then `id`, until real usage data exists. | Reproducible and honest. `capped: true` still reports truncation. Revisit when the catalogue exceeds the cap and the ordering starts deciding who gets seen. |
| D3 | Support queries and dashboards have no legal read path | **Read-only `freshskin_support` role** with `SELECT` on a narrow `v_support_*` view set that excludes images, free-text sensitivities, and email. | Ad-hoc queries have somewhere safe to go, and the limit is a grant rather than a convention. A fourth role to provision. |

## Open questions and risks

1. **Perfumes without INCI** degrade allergen detection to declared notes. The flag is honest; the safety is partial. This is a data problem, and it is the weakest link in R1.
2. **Free-text sensitivities** that fail resolution match on normalised tokens and always add a caution, never an exclusion. Recall risk, accepted for v1.
3. **drizzle-kit coverage** for `CHECK`s, generated columns, `security_invoker` views, and partial indexes is the least mature area; the schema-first candidate flagged it too. Fallback: hand-written SQL migrations as the source of truth with `pgView(...).existing()` for types. Worth a one-day spike first.
4. **RLS and pooling** — `SET LOCAL` inside a transaction only. The single most dangerous implementation detail here.
5. **`total_matched`** must be a separate count, not the pool length, or it lies whenever the pool exceeds the cap.
6. **Anonymous → active transition** changes `user_id` scope and therefore session ids; recommendations must not replay across it.
7. **Erasure vs stored reasons** — `reason_text` embeds profile facts ("suits your dry skin"), so deletion must cascade `recommendations`, not rely on the FK alone.
8. **`v_product_rating` scope** is unresolved in the PRD: §14.2's `feedbackAffinity` is per user, §14.5 says no cross-user pooling. Reading it as "this user's rating of this product, else 0.5" is the only consistent reading.

## Next implementation step

One vertical slice, creams only, because it exercises the whole thesis:

1. `db/schema.ts`: `products`, `product_variants`, `product_ingredients`, `ingredients`, `profiles`, `sensitivities` — with the generated `status` column and the two jsonb `CHECK`s.
2. `db/rls.sql` + `db/grants.sql`: `FORCE ROW LEVEL SECURITY`, policies, `SECURITY INVOKER` views, and `REVOKE SELECT ON products FROM freshskin_app`.
3. **Write the failing test first:** `SELECT * FROM products` as `freshskin_app` must raise `permission denied`. That test is the design; if it passes trivially, the privileges are not real.
4. `catalogue/projection.ts` and `safety/conflicts.ts`, with table tests including one severe, one moderate, and one unresolved free-text sensitivity.
5. `rec/` with two terms and two rules wired through all four stages; `http/present.ts` against a golden §12.3 fixture.
6. Acceptance: p95 < 800 ms over a 450-product seed; a `severe` sensitivity never appears in `items` and always appears in `excluded` with its code; a second identical `GET` replays byte-identical; a deliberate attempt to call `scoring` before `eligibility` fails to typecheck; `http/` cannot reach `db/system` or `rec/terms`.

Then add the remaining terms as pure data, and repeat the shape for perfumes and scans.
