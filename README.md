# FreshSkin

An AI personal-care assistant: photograph your skin, scan an ingredient label, and get explained body-cream and fragrance recommendations.

This repository contains **three slices of the data layer** — the catalogue and recommendation pipeline, the ingredient-scan lifecycle, and recommendation persistence with feedback — built to the design in [docs/design/data-layer.md](docs/design/data-layer.md) against the spec in [FreshSkin PRD.md](FreshSkin PRD.md).

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

## Layout

```
db/migrations/      hand-written SQL is the source of truth (roles, tables, RLS, views, grants)
src/db/             schema mirror, pools, withUser (transaction-scoped identity)
src/catalogue/      readiness gate, gated-view reads, projection to domain types
src/safety/         the single home of allergen and sensitivity detection
src/rec/            types, term and rule registries, diversity, explanations, pipeline,
                    affinity, and recommendation/feedback persistence
src/scans/          parse gating, verdict table, lifecycle, persistence
src/service/        composition root for GET /recommendations/creams
src/http/           the only modules that know the wire shapes (recommendation and scan)
tests/              privilege, safety, pipeline, wire, type-level, end-to-end
scripts/            migrate and seed
```

`src/rec/pipeline.ts` is the only file that knows the stage order. `src/http/present.ts` is the only file that knows a snake_case field name.

## The two thresholds

They are deliberately not the same number and not the same type:

- `CATALOGUE_READY_AT = 0.95` — is this catalogue record trustworthy enough to recommend? (`src/catalogue/readiness.ts`)
- `VERDICT_PARSE_FLOOR = 0.60` — did we read enough of this label to accuse it? (`src/scans/verdict.ts`, with `VERDICT_MIN_MATCHED = 5`)

Sharing one constant is the bug this separation prevents.

## What is not built yet

- The OCR worker and image pipeline; scans currently accept parsed tokens from a caller
- Scan submission idempotency (`Idempotency-Key` replay)
- Profiles and fragrance preferences beyond the read path used here
- Saved items and the wishlist
- The HTTP framework and routes (the service functions are the seam)
- Perfume scoring terms
- Authentication, consent ledger, export and erasure jobs

## Notes for whoever picks this up

- `db/migrations/` is the source of truth. Drizzle is used for typing, not for migrations, because drizzle-kit's support for `CHECK`s, generated columns, and `security_invoker` views was the flagged risk in the design. Revisit with a spike, not a rewrite.
- Three roles exist by decision D3: `freshskin_app`, `freshskin_system`, `freshskin_support`. The system role has `BYPASSRLS` and is confined to workers.
- Catalogue views are `SECURITY DEFINER` so the app role needs no base-table privilege; user-data views must be `SECURITY INVOKER` so RLS applies.
- The test runner is `node:test` with a `tsc` build rather than vitest: this environment's Node cannot load Rollup's signed native binary. Nothing in the source depends on the runner.
