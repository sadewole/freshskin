# AGENTS.md — working on FreshSkin

FreshSkin is a B2C AI personal-care assistant: photograph skin, scan an ingredient label, get
explained body-cream and fragrance recommendations. Nigeria-first, 3G is the design target.

## Layout and lanes

```
apps/api/          Node HTTP API → api.freshskin.com (server, domain logic, tests, migrations)
apps/web/          React + Vite PWA → app.freshskin.com
apps/marketing/    static site scaffold → freshskin.com (Phase 3)
packages/contracts/  type-only wire contracts (the ONLY cross-lane API surface)
packages/ui/       shared design tokens — tokens.css (colors, type, radii)
docs/decisions/    0001 (shell, part-superseded), 0002 (cross-origin auth — read this)
docs/design/ui-workflow.md   phased plan: Phase 0 tokens done, origin split done
FreshSkin PRD.md   spec, esp. §5 product principles, §8 IA/nav, §9 screens, §15 architecture
```

**Lane ownership (no cross-lane writes):** Web owns `apps/web`; API owns `apps/api`;
Marketing owns `apps/marketing`; Shared (`packages/*`, `docs/decisions/`) is
proposal-only, one writer at a time. Verify with your own lane's typecheck + build.
Auth/CORS settled in decision 0002: host-only cookie on the api origin,
`credentials: 'include'`, `VITE_API_BASE_URL` env, `APP_ORIGIN` allowlist. Don't relitigate.

## Do

- **Read the PRD first for product work** — `FreshSkin PRD.md` §5 principles resolve design
  arguments (earlier wins), §8–§9 define screens and IA.
- **Consume tokens, never invent colors** — every color/font/radius resolves to
  `@freshskin/ui/tokens.css`; no hardcoded hex outside it (`pnpm lint:tokens`, part of `pnpm verify`).
- **Explain or omit** (principle 1) — every score, verdict, recommendation shows a
  one-sentence reason + the inputs behind it. No unexplained number.
- **Deterministic before generative** (principle 2) — rules/allergen blocks are never
  overridden by model output.
- **Keep the pipeline's safety shape** — `apps/api/src/rec/`: four branded stages,
  single `safety/conflicts.ts` detector, registries (not formula functions). New terms/rules
  are data hunks, never branches.
- **Libraries, not hand-rolled design primitives** — icons are `lucide-react`; view/quiz
  transitions are `motion` (shared language in `apps/web/src/ui/motion.ts`, timing mirrors
  the tokens). Never hand-roll glyphs, keyframed entrances, or carousels; fix at the library
  version, not with local CSS.
- **Verify the way this repo verifies** — root: `pnpm typecheck`, `pnpm build`,
  `pnpm test` (191 tests; DB tests need `pnpm db:reset`); web: `pnpm --filter @freshskin/web typecheck`.
  Pre-commit: full typecheck + build + `pnpm test` green, working tree clean otherwise.

## Don't

- **No medical claims, no tone judgment** — cosmetic suitability only; never diagnose/treat/cure;
  never "lightening"/"brightening"; disclaimers stay visible (principles 3–4).
- **No confident wrong answers** — low-confidence analysis asks for a retake; "could not read
  this" beats a guess (principle 5). The scan 60% floor and `avoid`-from-partial-parse ban
  are compile- and DB-enforced — don't weaken them.
- **No competitor IP** — `docs/assets/` webp/mp4s are mood references only. Never ship their
  names, marks, or imagery as FreshSkin's; product imagery = owned/licensed/neutral placeholder.
- **No new env vars, routes, or wire fields without updating both sides** —
  env schema is `VITE_API_BASE_URL` / `APP_ORIGIN`; wire names live only in
  `packages/contracts`; server tests in `apps/api/tests/` pin the §12.3 shape.
- **No `Domain=` on the session cookie, no bearer tokens** (decision 0002). No API-response
  caching of per-user data (Workbox precaches shell only). Images purge at 24h.
- **No lifecycle shortcuts** — scan/status transitions stay guarded (`WHERE status = ANY($from)`);
  consent is per-request capability, re-checked in jobs, never cached.

## B2C bar — appealing, animated, easy

This is a consumer product competing for attention, not an internal tool. Every user-facing
change is judged on three axes:

1. **Appealing** — brand system first (Fraunces display + DM Sans, cream/berry/plum,
   28px cards, pill CTAs per `Landing.dc.html` token source). Real empty/loading/error states
   everywhere (skeletons, illustrated empties — never blank panels or raw errors). Touch
   targets ≥ 44px; 360px-wide has no horizontal scroll; dark theme (derived plum-brown)
   must not regress.
2. **Animated** — motion is expected, but restrained: 150–250ms ease-out, one meaning per
   transition (enter/confirm/verdict-reveal). Honor `prefers-reduced-motion`. Never animate
   layout shifts on slow networks; skeleton in place, then crossfade.
3. **Easy** — happy path in ≤ 3 taps; destructive or consent actions are explicit and
   reversible where possible; every result rateable/disputable (principle 6); offline shows
   cached data with honest messaging, never a dead screen.

Performance is a feature: fonts self-hosted woff2 (a Google Fonts `<link>` violates the
shipped `style-src 'self'` CSP — still open), images lazy + sized, no layout shift on card
load. Target: Lighthouse ≥ 90, p95 recommendation path < 800ms.
