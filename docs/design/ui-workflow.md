# FreshSkin UI/Design Workflow — from current app to working product

**Status:** plan · **Date:** 2026-11-13
**Inputs:** `docs/assets/` (brand inspiration), `docs/design/design system/` (Landing mockup + tokens),
`docs/archive/freshskin-prd-v0.1-archive.md` §15 (web/PWA architecture), current `web/` app.

## 1. What we have

| Input | What it gives us |
| --- | --- |
| `docs/assets/*.webp` | Visual direction: premium beauty (Solène berry/plum + botanical), clinical-AI trust (AlgoGlow stat blocks, phone mockup, coach chat), social proof patterns (avatar clusters, ratings). **Inspiration only — these are other brands' aesthetics; do not ship their names, marks, or imagery as FreshSkin's.** |
| `Landing.dc.html` | The authoritative token source: Fraunces (display serif) + DM Sans (body); cream `#FBF5EC` / `#FFFCF7`, ink `#2E1B14`, muted `#5A463C`/`#6B5448`, berry `#A62B52`, green `#35604A`, line `#E6D8C8`; large radii (28–36px), pill CTAs, `clamp()` display headlines, 1200px container. |
| PRD §15 | Architecture: `freshskin.com` (static marketing, SEO) + `app.freshskin.com` (PWA) + `api.freshskin.com`; PWA reqs TA-1…TA-9; passwordless/Google auth, host-only cookies, iOS caveats, UTM capture; stack React+TS/Vite/Workbox/TanStack Query/IndexedDB. |
| Current `web/` | Working app shell (consent gate → Home/Scan/Saved/Profile), real API wiring, plain-CSS system, `vite-plugin-pwa` + icons present. Gaps: unbranded slate/teal theme, top-tab nav, text-only scan, no camera, no offline shell, no marketing site, TanStack Query/IndexedDB not yet adopted. |

## 2. Guiding decisions

1. **Tokens first, components second.** All visual work consumes CSS custom properties extracted from the Landing mockup — no new hex values in components.
2. **Reskin before restructure.** Phase 1 changes only styles + static markup order; no API, routing, or state changes, so it can't break the working app.
3. **App before marketing.** The PWA is the product; the landing site reuses the same tokens/assets later.
4. **Competitor imagery stays out.** Brand assets are mood references. Product imagery = FreshSkin's own product shots or neutral placeholders until then.

## 3. Phases

### Phase 0 — Design tokens & foundations
Extract the mockup's values into a real theme. No view logic changes.
- Create `web/src/styles/tokens.css` (`:root` custom properties: color, type scale, radii, shadows, spacing) sourced 1:1 from the mockup's `<helmet>` + inline styles.
- Add Fraunces + DM Sans via `web/index.html` (Google Fonts link, `display=swap`, system fallbacks).
- Decide dark mode: current app supports `prefers-color-scheme`; mockup is light-only. Decision: keep a dark theme derived from tokens (deep plum-brown bg, cream ink) rather than dropping it — record values in tokens.css.
- Split `styles.css` → `tokens.css` + `base.css` + per-view files only if it passes ~400 lines; otherwise keep one file (existing convention).
- **Acceptance:** every color/font/radius used in the app resolves to a token; no hardcoded hex outside `tokens.css`; Light + dark render without contrast regressions (spot-check body text ≥ 4.5:1).

### Phase 1 — App reskin (highest visible payoff, no backend changes)
Apply the brand to existing screens, markup order only.
- Shell (`App.tsx` + styles): cream background, serif wordmark, bottom tab bar on mobile viewports (PWA pattern) instead of top pills; keep sticky top bar on desktop.
- Home/recommendations (`HomeView.tsx`, `ProductCard.tsx`): product cards with image slot + placeholder treatment, score as berry pill/badge, flags as soft chips, reason copy as primary text, "How this was calculated" stays in `<details>`; safety-excluded list keeps its honest, calm styling (never alarming).
- Scent quiz (`ScentQuiz.tsx`): two-step feel (like → avoid → strength) within the same component state; chip groups in berry active state.
- Scan result (`ScanView.tsx`): verdict panel in mockup card style (28px radius, tinted per verdict: green/amber/red edge), match-rate as progress bar, findings list; text-paste UI unchanged functionally.
- Saved/Profile/ConsentGate: card-ify lists, consent ledger as readable rows, keep gate's derived-from-session behavior untouched.
- Loading/empty/error (`ui/Async.tsx`): skeleton cards for lists, illustrated empty states (CSS/placeholder, not competitor art), consistent error note.
- **Acceptance:** all five routes render in the new theme; no API/type/state changes in the diff (reviewable as styles + JSX order only); keyboard + screen-reader behavior unchanged or better; 400px-wide layout has no horizontal scroll.

### Phase 2 — Scan upgrade (camera + result experience)
Per PRD §15.3 TA-5/TA-7; first functional (not visual) change.
- `getUserMedia` capture with file-upload fallback + permission explainer copy.
- Client-side resize/compress before upload (per TA-7), retry on failure.
- Connect to the real photo pipeline when available; keep the text path as fallback. Preserve the `queued` state for worker-offline.
- Result screen: verdict card (Phase 1 style) + per-ingredient findings + retake guidance.
- **Acceptance:** on desktop (no camera) upload path works; oversized images are compressed client-side; failed uploads offer retry; every scan state (idle/running/queued/result/error) has a designed screen.

### Phase 3 — Marketing site (PRD §15.2)
Static, CDN-hosted, SEO-focused; consumes Phase 0 tokens so brand matches the app.
- Scaffold (Astro or Next.js SSG — still open, see §5) with: hero (headline + CTA → `app.freshskin.com` with UTM passthrough), trust strip (stats/social proof per AlgoGlow pattern), product-analysis section, coach/chat teaser, FAQ, footer.
- Public ingredient/note pages (`/ingredients/:slug`) as the SEO channel, each with app CTA.
- Reuse brand *patterns* from `docs/assets`, never their marks; hero uses FreshSkin-owned or licensed media (the two `.mp4` files are inspiration placeholders, not shippable brand film).
- **Acceptance:** static export, no app JS shipped to marketing; CTA carries UTM params; Lighthouse performance/SEO ≥ 90 on the landing page.

### Phase 4 — PWA hardening (PRD §15.3 TA-1…TA-4, TA-6, TA-8; TA-9 is P2)
- Manifest/scope/icons audit (icons exist in `web/public/` — verify maskable + theme colors), `display: standalone`.
- Install prompt: `beforeinstallprompt` on Android/desktop Chrome; guided Share → Add-to-Home-Screen flow on iOS.
- Offline shell: precached app shell (Workbox — `vite-plugin-pwa` already present) + IndexedDB-cached profile/history/saved; scan/analysis show designed offline message (TA-3).
- Safe update flow (prompt on new service worker), strict CSP/HSTS on the app origin (TA-6, TA-8).
- Auth per §15.4 when backend lands: passwordless OTP + Google, host-only cookies, iOS re-login friction handled by early install prompt.
- **Acceptance:** installable on Android + iOS paths tested; airplane-mode launch shows saved data with clear offline messaging for scan; SW update prompts instead of silently stalling.

### Phase 5 — Polish & motion
- Restrained motion (150–250ms ease-out; `prefers-reduced-motion` respected): tab transitions, card entry, verdict reveal.
- Responsive pass: 360px → 1200px; touch targets ≥ 44px.
- Performance budget: fonts + CSS + JS; images lazy + sized; no layout shift on card load.
- **Acceptance:** no `prefers-reduced-motion` violations; Web Vitals (LCP/CLS) measured on a mid-tier Android device, recorded in the PR.

## 4. File map (where work lands)

| Area | Files |
| --- | --- |
| Tokens/theme | `web/src/styles/tokens.css` (new), `web/src/styles.css` (→ `base.css` + view files if it grows), `web/index.html` (fonts) |
| Shell/nav | `web/src/App.tsx` |
| Views | `web/src/views/HomeView.tsx`, `ProductCard.tsx`, `ScanView.tsx`, `ScentQuiz.tsx`, `SavedView.tsx`, `ProfileView.tsx`, `ConsentGate.tsx` |
| Primitives | `web/src/ui/Async.tsx` (+ new `ScoreBadge`, `VerdictCard`, `EmptyState` as needed) |
| Data (Phase 2/4) | `web/src/data/` (IndexedDB cache), adopt TanStack Query to replace `useAsync` when offline scope lands |
| Marketing (Phase 3) | new top-level `site/` (Astro/Next SSG), separate deploy pipeline per §15.1 |
| PWA (Phase 4) | `web/vite.config.ts` (Workbox), `web/public/manifest` + icons, install-prompt + update-flow components |

## 5. Open questions (carried from PRD §15.7 + this analysis)

1. Marketing generator: Astro vs Next.js SSG?
2. Dark mode: full derived theme (recommended, §Phase 0) or light-only per the mockup?
3. Product imagery source for cards/hero (owned shoot vs licensed vs illustrated placeholders)?
4. Native wrapper later (Capacitor/RN) for store presence + iOS push/storage — v1 web-only confirmed?
5. Which analysis steps run on-device vs server-side (affects Scan UX latency states)?
6. CDN/hosting provider for target markets (defer to infra, but needed before Phase 3/4 deploys)?

## 6. Suggested sequencing

Phase 0 → Phase 1 (shippable visual win, zero backend risk) → Phase 2 (core loop: scan → verdict) → Phase 4 basics (installable + offline shell) → Phase 3 (marketing, needs brand settled) → Phase 5 (polish). Phases 3 and 4 can swap if acquisition pressure comes first.
