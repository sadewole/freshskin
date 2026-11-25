# 0004 — Routines, tips, and weekly check-ins (PROPOSAL)

- **Status:** proposal (one writer at a time — claim before implementing)
- **Date:** 2026-11-15
- **Context:** The MVP loop gives answers but no daily habit. Like a workout planner, users need
  a routine to follow, tips to learn from, and check-ins to track follow-through. This decision
  scopes that habit loop: generic routine first, curated static tips, weekly self-reported
  check-ins — all inside existing Home sections, no new tab or route.

## Decision

Add three surfaces, contract-first through `packages/contracts`:

1. **Routine card** — one generic body routine (`body-basic`, 3 steps), each step with
   `instruction` + `why` + `inputs` (≤140 chars each, template-first, explain-or-omit).
   Served by `GET /api/v1/routine` with 3 reviewed tips + canonical disclaimer.
2. **Tips strip** — fixed curated set, reviewed once (`reviewed_at` required before serving),
   deterministic order, no model calls, offline-cacheable (non-personal content only).
3. **Weekly check-ins** — `GET /api/v1/check-ins` returns a summary (latest two only, streak,
   today flag); `POST /api/v1/check-ins` (201) upserts one row per user per Lagos day;
   `DELETE /api/v1/check-ins/:id` soft-deletes. No photo, no trend line, no
   "improving/worsening" language — that is the PRD §6.4 carve-out (trigger #2 kills skin-history
   trends; two entries + a completion streak is not a trend).

Personalization trigger (decided): the generic routine personalizes once the user has skin
basics + at least one owned cream. `selectRoutine` already accepts profile inputs; today it
returns `body-basic` for every input — personalization later is a new data row, not a branch.

## Why check-ins-first wins (workout-planner model)

- **Log completion, defer measurement.** Workout apps succeed on "did you do it + how did it
  feel", not on lab metrics. A weekly feel + done log needs no camera, no model, no new
  pipeline — just a small table, a pure summary, and Home sections.
- **Photo re-checks are blocked.** They need the 0003 upload/OCR pipeline, which is still a
  proposal. Daily step ticks risk prompt fatigue on 3G; weekly is sustainable and reviewable.
- **Anonymous-first.** A check-in is one JSON row under the existing session cookie (0002) —
  no login wall, no new auth, works in the 90-day anonymous window.

## Safety notes (explicit)

- **Curated content is a data hunk, never a branch.** Routine steps and tips ship frozen in the
  migration, reviewed once; wording changes are new migrations + new `content_version`.
- **The routine module makes no recommendation, eligibility, or safety decision.** It renders
  curated cosmetic-hygiene steps. A boundaries test fails the build if `routine/**` imports
  anything from `rec/**`.
- **No medical/treatment/triage/supplement language, no tone judgment** (PRD §5.3–5.4, §6.3).
  Copy uses "suits"/"matches"/"designed for", never "will clear". Streak copy names what was
  measured ("3 weeks of completed check-ins"), never a bare score.
- **Image-bearing check-ins are out of scope** until 0003 is claimed and built; they would reuse
  its signed-URL shape, never JSON photo bytes (64 KiB body limit).

## Performance notes (3G is the design target)

- Home gains at most one extra request (`GET /routine`); check-ins ride the same mount.
  Content cache (non-personal routine/tips only) renders offline with a "showing saved data" chip.
  Check-ins queue offline and flush idempotently (natural key: user + Lagos day).
- Server computes the Lagos day; accepts `checked_on` within ±1 day (offline queue tolerance),
  else 400.

## Required changes

1. `packages/contracts`: `WireRoutine(Step|Tip)`, `WireCheckIn(s)`, `CheckInInput` (+ endpoints
   `GET /routine`, `GET /check-ins`, `POST /check-ins`, `DELETE /check-ins/:id`).
2. `apps/api`: migration 0014 (tables + RLS + frozen seed), `src/routine/` (types/template/
   progress/store/service), presenter, routes, validation, tests.
3. `apps/web`: `RoutineCard`/`TipsStrip`/`CheckInRow` in HomeView, client functions, localStorage
   store + content cache, fixture deleted on API switch.
4. PRD: §6.2 rows, §6.4 carve-out, §8.1/§9 S7, §10 FR-15/FR-16, §11 entities, §12 endpoints,
   §16.7 disclaimers, §18 events, §20 epic.

## Rejected

- **Daily step ticks with streaks** — highest fatigue risk on 3G; weekly sustains.
- **Photo re-checks now** — blocked on 0003; deferred, not dropped.
- **Generated tips** — model-phrased tips need safety review per tip and fall under the §14.6
  call ceiling; curated static tips are deterministic and offline-safe.
- **Trend charts / "improving" language** — collides with §6.4 trigger #2; out until the PRD
  trend ban is formally amended.
- **New tab/route for routines** — worsens existing IA drift (PRD 5 tabs vs shipped 4);
  Home sections keep the change inside S7.
