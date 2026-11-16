# 0005 — Marketing token additions: additive only

**Status:** accepted · **Date:** 2026-12-08
**Lane:** Shared (`packages/ui/tokens.css`), proposed by Marketing, one writer at a time.
**Context:** `apps/marketing` build (plan: `apps/marketing` full page, Algoglow-anchored).

## Decision

Extend `packages/ui/tokens.css` with the token groups below. **Every addition is new; no
existing custom property changes value or meaning.** `apps/web` therefore resolves exactly as
it does today — this is a pure superset, which is why it needs no web-lane review.

## What is added

1. **Tone scale `--tone-1 … --tone-6`** (`#f3d5be → #3a2417`). These are the six swatches the
   mockup's "Every skin tone" section already hardcodes inline. Promoting them to tokens lets
   the strip and the marketing imagery share one source. They are *reference* colours for
   describing tone bands, never a verdict — PRD §5 "skin tone analysed, never judged".
2. **`--sand`, `--green-tint`** — the two remaining mockup section grounds (How-it-works cards
   2 and 3) that had no token.
3. **`--rule`, `--ghost-ink`** — hairline grid rules and oversize ghost type, derived from
   `--ink` with `color-mix`. Both are *derivations*, so they follow dark theme automatically
   instead of needing a second hardcoded pair.
4. **`--type-*` scale** — display, heading, statement, body, kicker, card, numeral. Values are
   the mockup's own (clamped) sizes; the scale exists so sections stop re-declaring clamps.
5. **`--space-1 … --space-8`** — a fixed rhythm for section padding and inner gaps.

## Why tokens and not local CSS variables

`pnpm lint:tokens` bans hex outside this file across `apps/marketing/src`. Keeping the six tone
swatches in the marketing stylesheet would either fail that gate or force an exception that
weakens it for everyone. The tone scale is genuinely shared vocabulary (the app's scan result
will read the same bands), so it belongs in Shared.

## Rejected

- **A separate `apps/marketing/tokens.css`** — forks the palette, and the first divergence
  would be a bug nobody notices until the two brands drift.
- **Hardcoding the mockup values inline as the mockup does** — fails `lint:tokens` and puts
  colour authorship outside the one file the convention names.
- **Redefining `--line-brand`, `--blush`, etc.** — any value change is a web-lane change;
  additive additions keep this a one-lane decision.
- **A third "marketing" theme (`--m-` prefix)** — there is one brand. Prefixes would imply two.

## Consequences

- `packages/ui/tokens.css` grows by one block plus four dark-theme derivations; light values of
  existing tokens are untouched.
- **One existing token gains a dark value: `--ink-soft`.** It is the body-copy ink and sat in
  the brand block, so it never swapped — every paragraph rendered dark brown on the near-black
  ground in dark theme, in both lanes. It now has a derived dark value beside `--ink` and
  `--muted`. This is a bug fix, not a palette change: the light value is unchanged, and
  `apps/web` inherits the correction.
- **Brand grounds do not swap, so text on them must not use the swapping tokens.** `--blush`,
  `--sand`, `--green-tint` and `--berry-deep` keep their light values in dark theme. Anything
  printed on them uses `--ink-brand` / `--cream`, never `--ink` / `--muted` / `--ink-soft`, or
  dark mode prints cream on blush. Marketing enforces this per component; the contrast audit
  in the build plan is what catches a regression.
- `--ghost-ink` and `--rule` use `color-mix`, so they inherit whatever `--ink` resolves to —
  including inside the dark theme's `@media` block, with no extra rules.
- Marketing may now use these names freely; adding more tone bands means editing this note's
  list (keep it in sync).
