# FreshSkin

An AI personal-care assistant: photograph your skin, scan an ingredient label, and get explained body-cream and fragrance recommendations.

This repository contains **nine slices of the data layer** — the catalogue and recommendation pipeline, the ingredient-scan lifecycle, recommendation persistence with feedback, label tokenisation, the perfume path, skin analysis, anonymous identity with a consent ledger, saved items, and the discovery surfaces — built to the design in [docs/design/data-layer.md](docs/design/data-layer.md) against the spec in [FreshSkin PRD.md](FreshSkin PRD.md).

## What this slice proves

Each claim below is enforced by a test, not by convention:

| Claim | Test |
| --- | --- |
| The app role cannot read catalogue base tables | `tests/privileges.test.ts` — expects `42501` on `products`, `ingredients`, `product_ingredients` |
| The app reads only through gated views | same file — `v_product_recommendable`, `v_product_ingredients` succeed |
| Support sees operational data and nothing else | same file — denied on base tables, allowed on `v_support_product` |
| Row-level security isolates users | same file — a request sees only its own profile, and cannot write another user's |
| A pooled connection cannot leak the previous request's identity | same file — `SET LOCAL` verified across two users |
| Allergen detection has one home | `tests/safety.test.ts` — declared match, free-text match, applies-to filtering, severity ordering |
| A severe sensitivity is excluded and explained | `tests/pipeline.test.ts` — excluded with code and reason; mild does not exclude |
| Budget/stock narrowing only subtracts | same file — price narrowing excludes, unavailable products never recommended |
| Ranking, diversity, and reasons behave | same file — richer textures first for dry skin, 2-per-brand cap, ≤140-char reasons |
| A refresh is a replay, not a new session | same file and `tests/e2e.test.ts` — identical session and recommendation ids |
| Stage order cannot be skipped | `tests/types.test.ts` — `@ts-expect-error` asserts only the pipeline can build a stage value |
| The wire carries `recommendation_id` and `excluded[]` | `tests/present.test.ts` — §12.3 shape, snake_case, no domain names leaked |
| End to end inside the 800 ms budget | `tests/e2e.test.ts` — 127 eligible products, p95 measured over 5 runs |
| A label we could not read gets no verdict | `tests/scans.test.ts` — the 60% floor, the five-match floor, and the boundary case |
| `avoid` cannot come from a partial parse | `tests/types.test.ts` — `decideVerdict` will not accept an `InsufficientParse` |
| The database enforces the same rules | `tests/scans-db.test.ts` — a hand-written `avoid` at 40% raises `23514` |
| Exactly one worker can finalise a scan | same file — the second completion throws `ScanNotInFlight` |
| Scan findings are stored and isolated per user | same file — findings rows written, another user sees `null` |
| A served page is persisted, and a replay is free | `tests/feedback-db.test.ts` — same ids on a repeat request, no duplicate rows |
| Feedback is idempotent and ownership-checked | same file — a repeat action keeps one row; another user's id returns `not_found` |
| A rating moves the affinity term, one rating cannot dominate | `tests/affinity.test.ts` — no data is exactly neutral, and a lone 1-star is damped |
| Label text becomes tokens without inventing ingredients | `tests/tokens.test.ts` — exact, alias, fuzzy, OCR-confusion, and short-token refusal |
| The fuzzy matcher matches published Jaro-Winkler values | `tests/jaro-winkler.test.ts` — MARTHA/MARHTA, DIXON/DICKSONX, DWAYNE/DUANE |
| A real label runs text to verdict through the lexicon view | `tests/scan-text-db.test.ts` — 7 of 8 tokens resolve, one unknown is surfaced, verdict computed |
| Perfume terms are weighted and bounded | `tests/perfume.test.ts` — both registries normalise to 1, penalties capped at 0.3 |
| A disliked family is excluded, a liked one ranks first | same file — `family_disliked` rejection and ranking order |
| The quiz round-trips and rejects contradictory answers | `tests/perfume-db.test.ts` — edit keeps the rest; liking and disliking one family raises `23514` |
| Perfumes serve end to end and replay | same file — no Gourmand in results when Gourmand is disliked, same ids twice |
| Tone bands agree with measured pigmentation | `tests/skin.test.ts` — the ITA boundaries, and a contradictory band is refused |
| Confidence decides usable, low, or refused | same file — 0.5 is low, 0.2 is rejected, `not_skin` is rejected |
| Dark skin in thin light is refused, not guessed | same file and `skin-db.test.ts` — the bias guard fires on band V/VI at low brightness |
| A photo actually changes the ranking | `skin-db.test.ts` — hydration 20 on an `unsure` profile becomes `dry` for the recommender |
| Images purge at 24h exactly once | same file — the second run is a no-op, and the system role has only the grant it needs |
| Sessions resolve only for a live token, and store only a hash | `tests/auth.test.ts` — revoked and expired tokens resolve to null, raw token absent from the table |
| No image-backed row can exist without image consent | same file — the service throws `ConsentMissing` and the database raises `42501` below it |
| Withdrawal is an append, and under-16s cannot consent | same file — latest record wins; the minor is refused |
| Lists are private, idempotent, and revivable | `tests/saved.test.ts` — one live row per list, re-saving revives the tombstone |
| Owning a perfume lowers novelty for similar scents | same file plus `tests/perfume.test.ts` — owned notes reach the ranker |
| "Similar to" is deterministic note arithmetic | `tests/similar.test.ts` — heart and base notes weigh more, the anchor is never returned |
| Cheaper alternatives are filtered before ranking | same file and `discovery-db.test.ts` — every result is under the anchor's price |
| Pairings lead with an unscented base and flag clashes | `tests/pairing.test.ts` — scented creams are offered with a warning, not hidden |

## Quickstart

Requires Docker and Node 22+, with `node` on your `PATH`.

> If `pnpm test` reports `node: not found`, your Node install is not on `PATH`. Prefix the command with the directory that contains it, e.g. `PATH="$(dirname "$(command -v node)"):$PATH" pnpm test`.

```bash
pnpm install

# Postgres 16 on port 55432
pnpm db:up

# Apply db/migrations/*.sql in order
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/freshskin pnpm db:migrate

# 5 brands, 12 ingredients, 150 creams (23 of them correctly stay draft)
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/freshskin pnpm db:seed

pnpm typecheck
pnpm test
```

`pnpm db:reset` does the first three steps in one go.

## Run the app

The server serves both `/api/v1` and the built client from `app/public`. Build the client,
then start the server:

```bash
pnpm build          # compiled server in dist/, client in app/public/
pnpm start          # http://127.0.0.1:3000
```

For development, run the two watch processes in separate terminals:

```bash
pnpm dev:server     # tsc --watch + node --watch on dist/app/server.js
pnpm web:dev        # Vite on :5173, proxying /api to :3000
```

`pnpm build:server` builds only the server, and `pnpm web:build` builds only the client.
`app/public/` is generated; do not edit it by hand.

## Layout

```
db/migrations/      hand-written SQL is the source of truth (roles, tables, RLS, views, grants)
app/                Node HTTP server: routing, cookies, rate limiting, static hosting
app/public/         generated client build (Vite output); not tracked
web/                React + Vite client source
packages/contracts/ type-only wire contracts shared by the server and the client
src/db/             schema mirror, pools, withUser (transaction-scoped identity)
src/catalogue/      readiness gate, gated-view reads, projection to domain types
src/safety/         the single home of allergen and sensitivity detection
src/rec/            types, term and rule registries, diversity, explanations, pipeline,
                    affinity, and recommendation/feedback persistence
src/scans/          parse gating, verdict table, lifecycle, persistence, label tokenisation
src/skin/           analysis contract, confidence bands, bias guard, persistence
src/auth/           anonymous sessions (token hashing, expiry, revocation)
src/consent/        append-only consent ledger and gating
src/saved/          wishlist and owned lists, and the owned-note feed
src/rec/similar.ts  note-based similarity for "more like this"
src/rec/pairing.ts  cream and perfume layering scores
src/retention/      24-hour image purge across analyses and scans
src/service/        composition roots for creams and perfumes, shared viewer loading
src/http/           presenters that map domain types onto @freshskin/contracts
tests/              privilege, safety, pipeline, wire, type-level, module-boundary, end-to-end
scripts/            migrate and seed
```

`src/rec/pipeline.ts` is the only file that knows the stage order. `packages/contracts` is the only place wire field names are declared.

## The two thresholds

They are deliberately not the same number and not the same type:

- `CATALOGUE_READY_AT = 0.95` — is this catalogue record trustworthy enough to recommend? (`src/catalogue/readiness.ts`)
- `VERDICT_PARSE_FLOOR = 0.60` — did we read enough of this label to accuse it? (`src/scans/verdict.ts`, with `VERDICT_MIN_MATCHED = 5`)

Sharing one constant is the bug this separation prevents.

## What is not built yet

- The OCR call itself and image preprocessing; `completeScanFromText` starts from recognised
  text, and the vendor port is not implemented
- Scan submission idempotency (`Idempotency-Key` replay)
- The image pipeline and the vision provider; `completeAnalysis` starts from a model response
- Email OTP accounts on top of anonymous sessions
- Export and erasure jobs

## Notes for whoever picks this up

- `db/migrations/` is the source of truth. Drizzle is used for typing, not for migrations, because drizzle-kit's support for `CHECK`s, generated columns, and `security_invoker` views was the flagged risk in the design. Revisit with a spike, not a rewrite.
- Three roles exist by decision D3: `freshskin_app`, `freshskin_system`, `freshskin_support`. The system role has `BYPASSRLS` and is confined to workers.
- Catalogue views are `SECURITY DEFINER` so the app role needs no base-table privilege; user-data views must be `SECURITY INVOKER` so RLS applies.
- The test runner is `node:test` with a `tsc` build rather than vitest: this environment's Node cannot load Rollup's signed native binary. Nothing in the source depends on the runner.
