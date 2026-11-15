# Routines + Tips + Progress Check-ins — Implementation Plan

> **Status: implemented** (all phases shipped on `main`). Kept as a record.
> Commits: Phase 0 `e488cde` · Phase 1 `4c0434a` · Phase 2 `882bdc6` ·
> Phase 3 `fe6d5ca` · BAD_ORIGIN bugfix `9f70e71`.
> Normative follow-ups live in `docs/decisions/0004-routine-checkins.md` and the PRD amendments it lists.

## Context

FreshSkin's MVP loop (scan → cream → scan label → quiz → perfume) gives users answers but no
daily habit. Like a workout planner app, users need a routine to follow, tips to learn from,
and check-ins to track follow-through. This plan adds three surfaces, all inside existing Home
sections (no new tab/route), in the user's chosen shape:

- **Routines: generic first, personalize later.** Ship one standard body routine now; personalize
  once the user has skin basics + at least one owned cream (trigger decided).
- **Tips: curated static content.** Fixed set, reviewed once, deterministic order, offline-capable.
- **Progress: weekly "feel + done" check-ins.** Once a week: which routine steps were done plus
  how skin feels (calm/dry/smooth). Lightweight like a workout log — no photo, works offline
  and anonymous. Photo re-checks deferred until the 0003 upload/OCR pipeline lands.
- **Placement: new Home sections.** Routine card + tips strip inside existing HomeView.

Why this shape wins: check-ins-first is the workout-app pattern (log completion, keep history,
defer measurement tech). It needs no camera, no model calls, no new pipeline — just a small
table, a pure summary function, and Home sections. Trend charts are explicitly out (§6.4
trigger #2 kills history trends): progress shows latest two check-ins + completion streak only.

## Hard constraints (non-negotiable)

1. **Lanes:** web owns `apps/web`; api owns `apps/api`; shared (`packages/*`, `docs/decisions/`)
   is proposal-only, one writer at a time. No cross-lane writes.
2. **Rec safety shape untouched:** `apps/api/src/rec/` (pipeline 4 stages, single
   `safety/conflicts.ts`, registries-not-branches, closed term-weight budget) is NOT edited.
   New routine code is a pure standalone module modelled on `pairing.ts`, with a boundaries
   test proving `routine/**` imports nothing from `rec/**`.
3. **PRD bans:** no medical/treatment/triage/supplement claims; no tone judgment; no UGC/community;
   disclaimers visible; explain-or-omit (every step/tip shows why + inputs, ≤140 chars,
   template-first); deterministic-before-generative; copy tone plain 2nd person, no exclamation,
   no "glow"/"flawless", grade 9; 3G budgets; per-user data never cached (Workbox shell only);
   anonymous-first (no login wall).
4. **Contracts:** new wire types only in `packages/contracts`, snake_case, `{data, meta}` envelope
   (follow `WirePairing` template). No new env vars. 0002 auth (host-only api cookie) applies to
   all new endpoints. 0003 is proposal-only — no photo check-ins.

## Recommended approach (4 phases)

### Phase 0 — Contract + PRD + decision (shared lane, one writer, merge first)

- `packages/contracts/src/index.ts`: add `CheckInCompletion` (`skipped|partly|done`), `SkinFeel`
  (`drier|about_same|more_comfortable|not_sure`), `TipTopic`, `WireRoutineStep`
  (id/position/title/instruction/why/inputs/tip_id), `WireTip`, `WireRoutine`
  (routine slug/title/content_version/steps + tips + disclaimer), `WireCheckIn`,
  `WireCheckIns` (today/latest/previous/streak_days/checked_in_today/total_check_ins/disclaimer —
  latest-two only, no trend fields), `CheckInInput`. Endpoints: `GET /routine`,
  `GET /check-ins`, `POST /check-ins` (201 → summary), `DELETE /check-ins/:id` (204).
- `docs/decisions/0004-routine-checkins.md` (proposal): curated-content source of truth,
  check-ins-first, last-two-only progress, photo check-ins deferred to 0003.
- PRD amendments: §6.2 new P1 rows (routine card, check-ins, tips); §6.4 carve-out (two entries
  + streak is not a trend); §8.1 annotate `/home` (no new route); §9 S7 extend; §10 new
  FR-15/FR-16 + ACs; §11 entities; §12 endpoints; §16.7 canonical disclaimers; §18 events
  (`routine_viewed`, `tip_opened`, `check_in_recorded`, `check_in_sync_failed`); §20 new epic.

### Phase 1 — Web thin slice (web lane, fixtures, no API yet)

- `apps/web/src/data/routine-fixture.ts`: reviewed 3-step routine + 3 tips typed as
  `WireRoutine['data']`. **Deleted in Phase 3.**
- `apps/web/src/data/checkins.ts`: localStorage store (`freshskin.checkins.v1`) keyed by
  `user_id`, cleared on sign-out; completion/feel; streak = consecutive non-skipped Lagos days
  (unchecked today doesn't break); mirror of server `summariseProgress`.
- New `RoutineCard.tsx` (steps with why + inputs, "Why these steps" details, check-in chips,
  feel chips, streak line, latest-two, disclaimer, sync note), `TipsStrip.tsx` (3 articles,
  no carousel), `CheckInRow.tsx`.
- `HomeView.tsx`: insert `<RoutineCard/>` then `<TipsStrip/>` after hero, before recommendations.
  No router/`App.tsx`/tab changes.
- `styles.css`: ~80 lines tokens-only (`.home-section`, `.section-head`, `.routine-steps`,
  `.checkin-chips`, `.tips-strip`, `.sync-note`); 44px targets; dark-theme safe.
- Reuse: `Async.tsx` (SkeletonList/ErrorNote/Empty), `motion.ts` `verdictEnter` for save
  confirmation, ProductCard breakdown disclosure pattern.

### Phase 2 — API lane (contract merged; parallel with Phase 1)

- `apps/api/db/migrations/0014_routine_checkins_tips.sql`: `routine_templates`,
  `routine_steps` (instruction/why ≤140 CHECK, position 1–8, unique per template), `tips`
  (topic enum, ≤140 CHECKs, `reviewed_before_active` CHECK — nothing servable unreviewed),
  `check_ins` (user_id, Lagos `checked_on` ±1 day CHECK, completion/feel enums, soft delete,
  unique live `(user_id, checked_on)`); RLS owner policies + read-only content policies;
  grants to `freshskin_app`/`freshskin_system`; frozen seed content (body-basic 3 steps, 3 tips).
  Content changes = new migration + new `content_version`, never edits.
- `apps/api/src/routine/`: `types.ts` (standalone, no `rec/` import), `template.ts`
  (`scoreTemplate`/`selectRoutine`/`bestTips`, stable order, empty audience matches all —
  today always returns body-basic; personalization later is a new data row),
  `progress.ts` (`lagosDay`, `summariseProgress`), `store.ts` (`withUser` only: recent-3 list,
  count, same-day upsert with tombstone revive, soft delete, content load), `service.ts`
  (composition root mirroring `discovery.ts`: `getRoutineFor`/`getCheckInsFor`/`recordCheckInFor`;
  `checked_on` outside ±1 day → 400).
- `apps/api/src/http/present-routine.ts`: rename/nest only + canonical disclaimer constants.
- `apps/api/app/routes/routine.ts` + registration + `checkInBodySchema` in `validation.ts`.
- Tests: `routine.test.ts` (determinism, ≤140, ordering, **boundaries assertion: no `rec/` import**),
  `progress.test.ts` (streak/gaps/skipped/same-day), `check-ins-db.test.ts` (RLS isolation,
  upsert, revive; needs `db:reset`), `present-routine.test.ts` (envelope, disclaimers, no trend
  fields). No edits to pipeline/safety/types tests.

### Phase 3 — Web switch to API + offline sync (web lane)

- `apps/web/src/api/client.ts`: `getRoutine`, `getCheckIns`, `saveCheckIn`, `deleteCheckIn`.
- `apps/web/src/data/content-cache.ts`: cache last routine/tips payload (non-personal only) in
  localStorage; render offline with "showing saved data" chip. Workbox `runtimeCaching` stays empty.
- `checkins.ts`: outbox flush on `online` + Home mount; 401 → `ensureSession()` once then retry;
  upsert-by-natural-key makes flushes idempotent; queued → "Saved on this phone, will sync".
- Delete `routine-fixture.ts`; HomeView reads the real hook.

### Phase 4 — Deferred (documented, not built)

Personalized selection by profile (pure `selectRoutine` already accepts inputs); tip rotation;
photo check-ins via 0003's signed-URL shape; history beyond two entries only after PRD trend
trigger is formally amended.

## Verification

```
pnpm lint:tokens && pnpm typecheck && pnpm build && pnpm db:reset && pnpm test
```

Plus manual matrix: 360px no-scroll; dark theme; `prefers-reduced-motion`; 3G (≤1 extra request
on Home); offline cached-routine chip; offline check-in → sync → no duplicates; two-user RLS
isolation; sign-out clears outbox; screen-reader chip groups + live-region save announcement;
copy review (no medical/tone/exclamation violations) as part of DoD.

## Key risks

1. Implement from `origin/main` (monorepo) — stale flat-`src/` worktrees have wrong paths.
2. Land PRD + decision before code, or "latest two" reads as a banned trend.
3. Frozen 0014 content — pre-review copy + advisor sign-off in the migration PR.
4. Offline flush after anonymous-session expiry must not misattribute — key by `user_id`, discard
   mismatches, clear on sign-out.
5. Contract sequencing: contract+PRD → web fixtures → API → web switch, fixtures deleted in switch PR.

## Critical files

- `packages/contracts/src/index.ts` (new wire types)
- `apps/api/db/migrations/0014_routine_checkins_tips.sql` (new)
- `apps/api/src/routine/service.ts`, `template.ts`, `progress.ts`, `store.ts` (new)
- `apps/api/src/http/present-routine.ts` (new)
- `apps/web/src/views/HomeView.tsx`, `RoutineCard.tsx`, `TipsStrip.tsx` (edit/new)
- `apps/web/src/api/client.ts`, `apps/web/src/data/checkins.ts` (edit/new)
- `FreshSkin PRD.md` §§6.2/6.4/8/9/10/11/12/16/18/20, `docs/decisions/0004-routine-checkins.md`
