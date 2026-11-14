# FreshSkin: Product Requirements Document

**Status:** Ready for build (v1.0) · **Owner:** Product / Engineering · **Last updated:** November 2, 2026
**Supersedes:** v0.1 draft (archived at `docs/archive/freshskin-prd-v0.1-archive.md`)
**Reviewers required:** Engineering lead, Design lead, Dermatology advisor, Legal/DPO

## Document control

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 0.1 | Nov 2, 2026 | Product | First draft: problem, personas, feature list, FR table |
| 1.0 | Nov 2, 2026 | Product / Engineering | Build-ready rewrite: resolved open questions, MVP cut, IA and screen specs, data model, API contract, AI pipeline spec, scoring algorithms, acceptance criteria, privacy model, analytics, milestones, build order |

**How to use this document.** Sections 1–7 define what we are building and what is out of scope. Sections 8–10 are the design and engineering contract. Sections 11–15 are the implementation specification. Sections 16–22 are the operating plan: privacy, non-functional targets, measurement, release, build order, risks, and decisions. Sections 23–26 are appendices. Anything marked `OPEN` is unresolved and blocks only the milestone noted next to it — everything else is decidable without further input.

---

## 1. Executive summary

FreshSkin helps people buy body care and fragrance that suits them, instead of guessing from packaging. Three capabilities form the core loop:

1. **Skin analysis** — a photo returns skin tone, undertone, texture and concerns, saved to a profile.
2. **Cream recommendation** — a ranked, explained list of body creams matched to that profile, plus an ingredient-list scanner that returns `good` / `okay` / `avoid` with reasons.
3. **Fragrance recommendation** — a scent preference quiz plus climate and occasion inputs produce explained perfume suggestions, "similar to" alternatives, and cream-plus-perfume pairings.

**v1 is a web-first installable PWA.** It launches in Lagos, Nigeria in NGN, with a curated catalogue of 300 creams and 450 fragrances, English only (`en-NG`). The differentiator is not the model — it is the **ingredient knowledge base plus the explanation on every result**, which is what makes the advice trustworthy and correctable.

**MVP scope is the three-capability loop, not the full feature list.** Perfume recommendation, allergen flags and the ingredient scanner are in. Perfume bottle scanning, wishlist sharing, affiliate links and social features are out.

**Why this rewrite exists.** v0.1 was a good product thesis but not buildable: it had no screens, no data model, no API, no algorithm definition, no acceptance criteria and six open questions. This version closes those gaps and states a default decision for every open question so engineering can start on the next working day.

---

## 2. Current state and what this version changes

**Repository reality.** The workspace contains no application code and is not a git repository. v0.1 labelled skin analysis, cream recommendation and ingredient scanning as "existing". They are not. **Every feature in this document is greenfield.** The release plan reflects a 13-week path to public launch (three weeks of foundations, eight weeks of MVP, two weeks of private beta), not an extension of shipped software.

**Gaps in v0.1 and where they are now addressed:**

| Gap in v0.1 | Resolution |
| --- | --- |
| No information architecture or screens | §8 IA, §9 screen specs with all UI states |
| No data model | §11 entities, fields, enums, relationships |
| No API contract | §12 endpoints, envelopes, errors, rate limits |
| "AI analysis" unspecified | §13 capture quality gate, model choice, output schema, thresholds, eval suite |
| Recommendation logic hand-waved as "AI ranking" | §14 deterministic scoring formulas with weights and hard filters |
| No acceptance criteria | §10 Given/When/Then per P0 requirement |
| Metrics with no instrumentation | §18 event taxonomy and metric definitions |
| Privacy limited to a bullet list | §16 data map, consent flows, retention, deletion SLA, sub-processors |
| Six open questions | §22 decisions log — all resolved with an owner and a reversible default |
| No timeline, team or sequencing | §19 milestones, §20 epic and ticket breakdown |
| No error, empty, offline or retake states | §9 state column and §13 fallbacks |
| No catalogue or knowledge-base plan | §15 sourcing, schema, seed volumes, QA |
| No definition of done | §19.4 |

---

## 3. Problem statement and evidence

**The problem.** Body care and fragrance are bought on trust signals (brand, price, packaging, salesperson) that are unrelated to whether the product fits the person's skin or taste. The failure is discovered after purchase: a cream that dries, clogs or clashes; a fragrance that dies in two hours or smells wrong on skin.

**Why it persists.**

- Ingredient lists are long, in Latin and hard to interpret without training.
- Fragrance performance is skin- and climate-dependent; reviews from a cold climate do not transfer to Lagos humidity.
- No tool connects what you put on your body with what you wear on top of it, so people duplicate or clash.
- Local availability is rarely reflected in global review sites.

**Evidence.** v1.0 is pre-launch, so the following are assumptions to validate, not findings. Each has an owner and a test in §18.6:

| Assumption | Confidence | How we test it |
| --- | --- | --- |
| Users cannot interpret INCI labels well enough to make a purchase decision | High | 8 moderated sessions at beta, think-aloud on 3 real labels |
| Photo-based recommendations feel more personal than a questionnaire | Medium | Compare capture-flow completion vs quiz-only cohort |
| Price and local availability outrank brand loyalty at purchase | Medium | Filter usage analytics, in-app save vs. dismiss reasons |
| Layering (cream plus perfume) is a real user behaviour, not a niche | Low | Pairing screen engagement; 10 user interviews |

If the fourth assumption fails, pairing is demoted from P1 to P2 without affecting the rest of the plan.

---

## 4. Target users and jobs to be done

| Persona | Description | Primary job | What failure costs them |
| --- | --- | --- | --- |
| **The confused buyer** (primary, 45% of target) | Buys creams and perfumes by trial and error; 2–4 purchases per year | "Help me pick one thing I will not regret." | ₦8,000–₦60,000 per wasted purchase |
| **The ingredient-conscious user** (25%) | Reads labels, has a sensitivity or is pregnant | "Tell me if this specific product is safe for me." | A reaction, or hours of research |
| **The fragrance explorer** (20%) | Wants new scents, fears blind buys, watches fragrance content | "Find me something like X, but cheaper or more unusual." | Full bottle bought on hype |
| **The gift buyer** (10%) | Shopping for a partner or friend, does not know their profile | "Give me a safe, thoughtful, well-matched option." | Awkward gift |

**Primary JTBD.** *When I am about to buy a body cream or a fragrance, I want to know whether it fits me before I pay, so I can stop wasting money on the wrong thing.*

**Secondary JTBD.** *When I react badly to a product, I want to know which ingredient caused it, so I can avoid it in future.*

**Explicit non-users.** People seeking treatment for a diagnosed skin condition (we refer them out), professional perfumers, and B2B buyers. No features are built for them in v1.

---

## 5. Product principles

These resolve design arguments without escalation. When a trade-off is unclear, the earlier principle wins.

1. **Explain or omit.** Every recommendation, verdict and score shows a one-sentence reason and the inputs behind it. No unexplained number.
2. **Deterministic before generative.** Rules and the ingredient knowledge base decide safety and hard filters. Models rank and phrase; they never override an allergen block.
3. **Skin tone is analysed, never judged.** No language about "lightening", "brightening to a lighter tone", or tone as a beauty problem. Tone output exists to match products correctly and to prove the analysis works across all tones.
4. **No medical claims.** We describe cosmetic suitability, never diagnosis, treatment or cure. Disclaimers are persistent, not buried.
5. **Confidence is visible.** Low-confidence analysis asks for a retake. We would rather show "I could not read this" than a confident wrong answer.
6. **The user can correct us.** Every result can be rated or disputed, and corrections feed the profile.
7. **Graceful on a bad network.** Nigeria-first means 3G is the design target, not the edge case.
8. **Local first.** Prices in NGN, availability in Lagos, climate defaults to hot-humid, products people can actually buy this week.

---

## 6. Scope and MVP cut

### 6.1 The MVP promise

> A new user can open the app, grant consent, photograph their skin, get a skin profile, receive an explained cream recommendation, scan the ingredient list of any cream in their hand, take a six-question scent quiz, and receive explained perfume recommendations — in one session, on a mid-range Android phone on 3G.

If that sentence is true, v1 ships. Everything else is deferred.

### 6.2 In scope for v1

| Capability | Detail | Priority |
| --- | --- | --- |
| Consent and onboarding | Age gate, privacy consent, camera consent, skin basics | P0 |
| Skin capture and analysis | Guided capture, quality gate, tone/undertone/texture/concerns | P0 |
| Skin profile and history | Stored results, trend across scans | P0 |
| Cream recommendations | Ranked, explained, filterable by budget and attributes | P0 |
| Ingredient scanner | OCR, ingredient matching, personalised verdict | P0 |
| Scent quiz and fragrance profile | 6 steps, saved, editable | P0 |
| Perfume recommendations | Ranked, explained, with notes and performance | P0 |
| Allergen and sensitivity flags | User-maintained list, hard-blocked in results | P0 |
| Similar-to search | Note-based alternatives, price-banded | P1 |
| Cream and perfume pairing | Two complementary suggestions | P1 |
| Ratings and feedback | Per recommendation, drives personalisation | P1 |
| Account and auth | Email OTP, anonymous-to-account upgrade | P0 |
| Saved products (list only) | Wishlist and owned | P1 |
| Routine card | One generic body routine (3 steps), every step with why + inputs | P1 |
| Progress check-ins | Weekly completion + skin feel, latest two only, completion streak | P1 |
| Tips | Fixed curated set, reviewed once, deterministic order | P1 |
| Perfume bottle scanner | Photo of bottle to identify product | P2 |
| Affiliate links | Retailer links with disclosure | Phase 5 |

Routine, tips, and check-ins contain no supplements, treatment, triage, or user-generated
content (§6.3 stands unamended).

### 6.3 Out of scope, permanently for v1

- Medical diagnosis, treatment advice, prescriptions, or triage for skin disease.
- Facial skincare, hair care, makeup, supplements, injectables.
- In-app checkout, cart, payments, delivery.
- Fragrance creation, custom blending, "design your own scent".
- Social feed, following, comments, community reviews.
- Native iOS/Android store apps (the PWA is the product; native shells are a later decision).
- Languages other than English, currencies other than NGN.
- Deepfake or filter detection beyond a basic "filter suspected" warning.

### 6.4 De-scope triggers

Kill switches if the build runs late. Applied in this order, no re-planning meeting required:

1. Drop pairing (§10 FR-9) and similar-to (FR-8) to Phase 3.
2. Drop skin history trend view; keep only latest analysis. Carve-out: weekly check-ins (§10
   FR-16) are not a skin-history trend — the app shows the latest two entries plus a completion
   streak, never a chart, trend line, or "improving/worsening" language.
3. Reduce catalogue seed to 150 creams and 250 perfumes, maintaining coverage of 20 NGN price bands.
4. Drop perfume recommendations to a waitlist screen, ship cream-only. **This is the last resort** — it removes the product's differentiated half.

---

## 7. Assumptions, constraints and dependencies

| Type | Item | Impact if wrong |
| --- | --- | --- |
| Constraint | Mobile browser only, must work on Android 10+ Chrome and iOS 16.4+ Safari | Rules out older devices; capture fallback needed |
| Constraint | £0 paid acquisition at launch; organic and creator-led only | Growth plan targets 5,000 installs in 90 days |
| Constraint | No licensed dermatology dataset at start; advisor review only | Accuracy eval must be built from collected, consented images |
| Constraint | 2 engineers, 1 designer, 1 part-time ML engineer | 13-week path to launch, no slack for a second platform |
| Dependency | Fragrance product and note data | Licensed dataset signed before Week 4 or recommend-only-on-curated-set |
| Dependency | Retailer availability feeds for Lagos | Manual curation fallback; availability is "verified in last 14 days" not live |
| Dependency | OCR vendor quota and cost | Budget cap ₦25 per scan (§13.6); fallback provider configured |
| Assumption | Users will grant camera permission when the value is explained first | If not, allow gallery upload and questionnaire-only path |
| Assumption | A 6-question quiz is enough for a usable cold start | If satisfaction < 60%, add a 3-product preference calibration step |

---

## 8. Information architecture and navigation

### 8.1 Structure

```
Root
├── /                        Welcome + value prop (unauthenticated)
├── /auth                    Email OTP / passkey
├── /onboarding
│   ├── /consent             Age gate + privacy + camera consent
│   ├── /skin-basics         Skin type, top 2 concerns, climate
│   ├── /capture             Skin photo
│   └── /scent-quiz          6-step fragrance preference quiz
├── /home                    Dashboard: profile card, next actions, recent results,
│                            routine card, tips strip, check-ins (no new route or tab)
├── /skin
│   ├── /                    Latest analysis + history list
│   └── /new                 Capture again
├── /creams                  Recommendations + filters
│   └── /[productId]         Cream detail
├── /scan                    Ingredient scanner (camera / upload)
│   └── /[scanId]            Verdict
├── /perfumes                Recommendations
│   ├── /[productId]         Perfume detail
│   └── /similar             Similar-to search
├── /pairings                Cream + perfume pairing
├── /saved                   Wishlist / owned
├── /profile
│   ├── /                    Profile overview
│   ├── /preferences         Scent quiz answers, edit
│   ├── /sensitivities       Allergen list
│   └── /settings            Privacy, data export, delete account, install
└── /legal/{privacy,terms,disclaimer,consent}
```

### 8.2 Navigation model

Bottom tab bar on mobile (home, skin, scan, perfumes, profile); sidebar at `>= 1024px`. The scan action is the visual centre of the tab bar and is reachable in one tap from every tab. Creams are reached from home, the skin result, and a scan verdict — they are deliberately **not** a top-level tab, because the primary entry is contextual, not browse-first.

### 8.3 Onboarding path decision

A user must not be forced through all of onboarding before seeing value. The gate is:

- **Required to use the app at all:** age gate, privacy consent, camera consent (only when the camera is first opened).
- **Required to see skin results:** skin basics.
- **Required to see perfume results:** scent quiz. Skippable, with a "popular in Lagos" fallback plus a persistent prompt to personalise.
- **Never required:** account creation. An anonymous device session is created on first launch and upgraded to an account via email OTP. Anonymous sessions expire after 90 days and prompt to upgrade before expiry.

---

## 9. Screen specifications

Every screen must define these five states: **default**, **loading** (skeleton or progress), **empty** (no data yet), **error** (recoverable, actionable), **offline** (cached or queued). States not called out explicitly inherit the patterns in §9.1.

| ID | Screen | Purpose | Key elements | States and rules |
| --- | --- | --- | --- | --- |
| S1 | Welcome | Explain the product in one screen and start | Value prop, 3 capability bullets, "Get started", "I have an account", legal links | No data. Must render in < 1.5s on 3G. |
| S2 | Consent | Collect lawful basis before any processing | Age band selector (under 16 blocks further use), consent toggles: core processing (required), image processing (required for capture), model training (optional, default off), marketing (optional, default off), policy version, plain-language summary of each | Cannot proceed without required consents. Withdrawal available later from settings with the same granularity. |
| S3 | Auth | Identify the user for cross-device sync | Email field, 6-digit OTP, resend timer, passkey option | Rate-limited: 5 OTP requests per email per hour, 10 per IP per hour. Error copy must not reveal whether an account exists. |
| S4 | Skin basics | Seed the profile before analysis | Skin type (dry, normal, oily, combination, not sure), top 2 concerns (dryness, flakiness, uneven tone, body acne, sensitivity, texture), climate (auto-detected, editable: hot-humid, hot-dry, temperate) | "Not sure" is a valid answer everywhere. Max 2 concerns — more reduces ranking signal quality. |
| S5 | Capture | Get a usable image | Live preview, framing guide (forearm, upper arm or leg; 15–25 cm distance), lighting hints, flash toggle, gallery upload, quality feedback before submit | Rejects on blur, low light, glare, non-skin subject, or resolution below 720p short edge. Max 3 retakes before offering questionnaire-only fallback. Must degrade to file input where `getUserMedia` is unavailable. |
| S6 | Analysis | Show progress and result | Progress with named stages ("checking lighting", "reading texture", "matching products"), then result card: tone with Fitzpatrick band, undertone, evenness score, top concerns, confidence, 3 recommended creams, "not a diagnosis" note | Timeout at 25s → retry or continue later. Low confidence (< 0.55) → retake prompt, no recommendations generated. Cancellable. |
| S7 | Home | Orient returning users | Profile summary card, last analysis, "scan a product", "my creams", "my perfumes", unviewed new results, routine card (3 steps with why + inputs), tips strip, weekly check-in (latest two + streak) | Empty state for new user routes to onboarding. Cached last results render offline with a "showing saved data" chip. Cached routine renders offline with a "showing saved routine" chip. Queued check-in shows "saved on this phone, will sync" until flushed. |
| S8 | Creams | Ranked recommendations | Cards with image, name, brand, price, match score, one-line reason, key attributes (fragrance-free, vegan, non-comedogenic), filters (max price, fragrance-free, vegan, availability), sort (match, price) | Minimum 8 results or an honest "we only have 5 matches for these filters" message with a filter reset. Filters must never silently return zero. |
| S9 | Cream detail | Decide | Ingredients with benefit/caution annotations, why this matched (full score breakdown), where to buy, save, rate, "report wrong data" | Offline: show cached product, disable buy links. |
| S10 | Scan | Read an ingredient list | Camera or upload, crop and rotate confirmation, OCR progress, then verdict: `good` / `okay` / `avoid` with severity colour plus icon plus text, flagged ingredients with reasons, beneficial ingredients, personalised explanation, matched product link if known | Unreadable image → "retake" with a specific failure reason ("text too small", "glare on label", "only part of the list visible"). Never guess a verdict from a partial parse. |
| S11 | Scent quiz | Build fragrance profile | 6 steps: liked families (multi-select, 3 min), disliked families, notes you love, notes you avoid, strength and longevity, occasion and budget | Progress indicator, back navigation, skippable at step 1 with fallback. Answers editable later without resetting history. |
| S12 | Perfumes | Ranked recommendations | Cards with house, concentration, note pyramid preview, match score, reason, longevity and projection estimate, price, "why this" expansion | Perfume-specific: no results if the budget filter is too narrow — suggest the nearest 3 price bands instead. |
| S13 | Similar-to | Anchor on a known fragrance | Search with autocomplete over the catalogue (brand + name), then a list of alternatives with similarity score, shared notes, price delta, and a "cheaper alternative" toggle | If the anchor is not in the catalogue, show a free-text fallback limited to note families, clearly labelled "best effort". |
| S14 | Perfume detail | Decide | Full note pyramid, families, accords, performance expectations, skin and climate guidance, pairing suggestion, similar items, save, rate | Must state that longevity estimates are guidance, not guarantees. |
| S15 | Pairings | Layer correctly | 2–3 cream plus perfume combinations, rationale ("unscented cream so the perfume leads"), clash warnings | Only shown when a perfume is saved or recommended. Never blocks the main flow. |
| S16 | Saved | Keep track of what to buy and what is owned | Wishlist and owned tabs, product cards with match score and price, mark-as-owned, remove | Empty state explains the difference between the lists. Owned items feed the novelty term in §14.3. |
| S17 | Profile | Manage identity and preferences | Skin profile summary, fragrance profile summary, sensitivities, history, saved, account, install prompt | Sensitivities are editable and immediately affect the next recommendation. |
| S18 | Sensitivities | Safety-critical input | Add by searchable ingredient or free text, severity (mild, moderate, severe), "avoid in perfume" and "avoid in creams" toggles | Free-text entries are matched by alias table; unmatched entries are still stored and warn the user we could not verify them. |
| S19 | Settings and privacy | Control data | Consent re-grant/withdraw, data export, delete photos, delete account, policy version, contact | Delete account is a two-step confirmation with a 7-day grace period and states what is deleted vs retained for legal reasons. |
| S20 | Global states | Resilience | Offline banner, PWA install prompt (after 2 sessions, dismissible), update-available toast, session-expired modal | Queued actions: scans and ratings may be queued offline and submitted on reconnect, with a visible pending indicator. Skin analysis is never queued — it requires a live connection and says so. |

### 9.1 Cross-cutting UI rules

- **Verdict encoding:** colour plus icon plus word, never colour alone. `good` = teal check, `okay` = amber dash, `avoid` = red cross.
- **Scores:** always paired with a reason and a "how this was calculated" link. Never show a bare percentage.
- **Skeletons over spinners** for list and card loads; determinate progress for analysis and OCR.
- **Retake prompts** must name the specific defect, not just "try again".
- **Copy tone:** plain, second person, no exclamation marks, no "glow", no "flawless". Reading level target: grade 9.
- **Motion:** respect `prefers-reduced-motion`; no parallax or auto-playing video.
- **Every screen** has a unique, announced `<h1>` and a skip-to-content link.

---

## 10. Functional requirements and acceptance criteria

Priorities: **P0** blocks launch (Phase 1), **P1** ships in Phase 3 if on schedule, **P2** is Phase 4 or later. Phase numbering matches §19.1.

### FR-1 · Skin capture and analysis · P0

Capture a skin photo, validate quality, and produce a structured skin analysis.

- **AC-1.1** Given a valid session and granted consent, when the user submits a photo that passes the quality gate, then an analysis record is created and the UI shows tone, undertone, evenness, texture, concerns and confidence within 15s at p75 on 4G.
- **AC-1.2** Given a photo that fails the gate (blur, exposure, glare, non-skin, resolution), when submitted, then no analysis is charged or stored as a result and the user sees the specific failure reason with a retake action.
- **AC-1.3** Given an analysis with confidence below 0.55, when the result renders, then it is labelled low confidence, no recommendations are generated from it, and the user is prompted to retake.
- **AC-1.4** Given a user on a device without `getUserMedia`, when they open capture, then the gallery/file upload path is offered and works.
- **AC-1.5** Given the analysis succeeds, then the result is persisted to the profile and appears in history, attributed to the model version used.
- **AC-1.6** Given analysis for any Fitzpatrick band I–VI, then the result includes a tone band and undertone and the explanation does not differ in certainty by band.

### FR-2 · Skin profile and history · P0

- **AC-2.1** Given a user with 2 or more analyses, when they open history, then analyses are listed newest first with date, tone band and top concern.
- **AC-2.2** Given a user deletes an analysis, then the image is deleted from storage within 24 hours and the record is tombstoned.
- **AC-2.3** Given a profile exists, then the latest analysis is usable as the ranking input without re-running analysis.

### FR-3 · Cream recommendation · P0

- **AC-3.1** Given a complete-enough profile (skin type plus at least one concern), when the user opens creams, then at least 8 products are returned ranked by match score, each with a one-line reason, or an explicit count message if fewer exist.
- **AC-3.2** Given a product whose ingredient list conflicts with a user sensitivity marked severe, then that product is excluded from results and the exclusion is stated in a collapsed "hidden for your safety" section.
- **AC-3.3** Given the user sets a maximum price, then no result exceeds it and the empty state offers the nearest 3 price bands.
- **AC-3.4** Given the user applies fragrance-free, vegan, or availability filters, then results respect every active filter and the active filter count is visible.
- **AC-3.5** Given results are shown, when the user expands "why this", then the score breakdown shows the weighted contributions defined in §14.2.
- **AC-3.6** Given a new analysis replaces an old one, then the next recommendation request reflects the new profile without a manual refresh step.

### FR-4 · Ingredient scanner · P0

- **AC-4.1** Given a legible ingredient label, when submitted, then parsed ingredients are returned with at least 90% of INCI tokens matched or explicitly flagged as unmatched, within 20s at p75.
- **AC-4.2** Given a successful parse, then a verdict of `good`, `okay` or `avoid` is returned with at least one flagged ingredient and one beneficial ingredient when present, plus a plain-language explanation of 2 sentences or fewer.
- **AC-4.3** Given the parse yields fewer than 5 recognised ingredients, then no verdict is shown; the user is told the label could not be read and offered a retake.
- **AC-4.4** Given the user has shared sensitivities, then the verdict is personalised and any conflict is stated first, before general notes.
- **AC-4.5** Given the scan resolves to a product in the catalogue, then the result links to that product detail page.
- **AC-4.6** Given the label contains an ingredient unknown to the knowledge base, then it is surfaced as "unrecognised" and never silently treated as safe.

### FR-5 · Scent quiz and fragrance profile · P0

- **AC-5.1** Given a new user, when they complete the 6-step quiz, then a fragrance profile is persisted with families liked, families disliked, notes loved, notes avoided, strength preference, occasions and budget band.
- **AC-5.2** Given the user edits one answer later, then the profile updates without discarding other answers and the next recommendation reflects it.
- **AC-5.3** Given the user skips the quiz, then perfume recommendations fall back to market popularity in the user's market, labelled as such, with a persistent personalise prompt.
- **AC-5.4** Given the quiz is completed, then it takes no more than 90 seconds at median in usability testing.

### FR-6 · Perfume recommendation · P0

- **AC-6.1** Given a fragrance profile, when the user opens perfumes, then at least 8 recommendations are returned with match score, reason, note preview, longevity and projection bands, and price.
- **AC-6.2** Given the user dislikes a family, then no recommendation in the top 10 is primarily in that family.
- **AC-6.3** Given the results are shown, then no more than 2 products from the same house and no more than 3 from the same primary family appear in the top 10 (diversity constraint).
- **AC-6.4** Given the user's budget band, then all results fall inside it, or the empty state explains the nearest band with a one-tap widen action.
- **AC-6.5** Given a perfume is recommended, then it does not appear if the user already marked it as owned, unless the user explicitly includes owned items.

### FR-7 · Allergen and sensitivity flags · P0

- **AC-7.1** Given the user adds a sensitive ingredient, then it is matched by INCI name and aliases, and stored even if unmatched.
- **AC-7.2** Given a recommended cream or perfume contains a sensitive ingredient, then it is excluded for creams and flagged with a warning header for perfumes (fragrance composition is often undisclosed, so exclusion is not always possible).
- **AC-7.3** Given a scan contains a sensitive ingredient, then the conflict is the first finding in the verdict.
- **AC-7.4** Given a sensitivity is removed, then the next recommendation request includes previously excluded products.
- **AC-7.5** Given a perfume's full composition is undisclosed, then the app states the limitation rather than implying a guaranteed allergen check.

### FR-8 · Similar-to perfume search · P1

- **AC-8.1** Given a catalogue fragrance is selected as the anchor, then at least 5 alternatives are returned with a similarity label (`very close`, `close`, `loosely similar`), shared notes named, and price delta shown.
- **AC-8.2** Given the "cheaper" toggle is on, then every alternative costs less than the anchor and the discount is shown in NGN.
- **AC-8.3** Given an anchor outside the catalogue, then the free-text fallback returns family-level suggestions labelled "best effort" and does not claim note-level matching.
- **AC-8.4** Given results are shown, then the anchor itself never appears in the list.

### FR-9 · Cream and perfume pairing · P1

- **AC-9.1** Given a saved or recommended perfume, then 2–3 pairings are offered with a rationale naming the layering logic (unscented base, complementary note, or clash avoidance).
- **AC-9.2** Given the user's cream contains a strong fragrance, then any pairing with a different perfume family shows an explicit clash warning.
- **AC-9.3** Given the pairing is unavailable in market, then it is excluded.

### FR-10 · Ratings and feedback loop · P1

- **AC-10.1** Given a user rates a product 1–5, then the rating is stored with the recommendation id and the user's profile version at the time.
- **AC-10.2** Given a user has rated 3 or more products, then their personal affinity term (see §14.4) is non-zero and the ranking visibly reflects it.
- **AC-10.3** Given the user dismisses a recommendation with a reason, then that reason is stored and counts negatively toward that product and its family.
- **AC-10.4** Given there is no feedback, then ranking uses neutral priors and works identically.

### FR-11 · Saved, wishlist and owned · P1

- **AC-11.1** Given a product is saved, then it appears in the wishlist and the perfume recommender excludes it from novelty calculations where appropriate.
- **AC-11.2** Given a product is marked owned and rated, then "similar to" uses it as a positive anchor.

### FR-12 · Perfume bottle scanner · P2

- **AC-12.1** Given a photo of a bottle or box, then the product is identified and its detail page opens, or a clear "not recognised" state offers the similar-to search pre-filled with the extracted brand text.

### FR-13 · Account and data rights · P0

- **AC-13.1** Given any user, then they can export their data as JSON and CSV within 30 days of request, and typically within 24 hours.
- **AC-13.2** Given a deletion request, then the account enters a 7-day grace period, after which personal data is hard-deleted within 30 days, with only the legally required records retained.
- **AC-13.3** Given consent is withdrawn for image processing, then capture is disabled and existing images are deleted within 24 hours.
- **AC-13.4** Given a user under 16, then further use is blocked at the age gate and no data beyond the gate answer is stored.

### FR-14 · Reliability and offline · P0

- **AC-14.1** Given the device is offline, then the app shell and last-viewed results render from cache with an offline banner.
- **AC-14.2** Given a scan is submitted offline, then it is queued and processed on reconnect with a pending badge.
- **AC-14.3** Given the analysis service is unavailable, then the user is told plainly and offered a retry; no partial result is stored.

### FR-15 · Routine and tips · P1

One generic body routine plus a fixed set of curated tips, both rendered with reasons.

- **AC-15.1** Given any user (including anonymous), then the routine card shows the same 3 steps, each with an instruction, a why, and the inputs behind it, all ≤ 140 chars.
- **AC-15.2** Given the routine content, then nothing is served before an advisor review timestamp; a wording change ships as a new migration plus a new `content_version`, never an edit.
- **AC-15.3** Given a user with skin basics plus at least one owned cream, then a future release may select a personalized routine; until then the generic routine is shown with no branching on profile data.
- **AC-15.4** Given any tip, then it carries a body, a why, and inputs, is ≤ 140 chars, and contains no medical, treatment, triage, supplement, or tone-judgment language.

### FR-16 · Progress check-ins · P1

Weekly self-reported follow-through, latest two only — not a skin-history trend.

- **AC-16.1** Given any user (including anonymous), then they can record one check-in per Lagos calendar day (completion + optional feel), editable the same day, removable afterwards.
- **AC-16.2** Given the check-in summary, then it shows at most the latest two entries plus a completion streak; never a chart, trend line, or "improving/worsening" language.
- **AC-16.3** Given the device is offline, then the check-in queues on the phone with a "will sync" note and flushes idempotently on reconnect (natural key: user + Lagos day).
- **AC-16.4** Given a `checked_on` outside ±1 day of the server Lagos day, then the request is rejected (400).

### Requirement traceability

| Requirement | Screens | Data entities | Release |
| --- | --- | --- | --- |
| FR-1 | S5, S6 | `skin_analyses` | Phase 1 |
| FR-2 | S6, S17 | `skin_analyses`, `profiles` | Phase 1 |
| FR-3 | S8, S9 | `products`, `recommendations` | Phase 1 |
| FR-4 | S10 | `scans`, `scan_findings` | Phase 1 |
| FR-5 | S11 | `fragrance_profiles` | Phase 1 |
| FR-6 | S12, S14 | `recommendations`, `product_notes` | Phase 1 |
| FR-7 | S18, S8, S10, S12 | `sensitivities`, `ingredients` | Phase 1 |
| FR-8 | S13 | `recommendations` | Phase 3 |
| FR-9 | S15 | `recommendations` | Phase 3 |
| FR-10 | S9, S14 | `ratings`, `feedback` | Phase 3 |
| FR-11 | S16 | `saved_items` | Phase 3 |
| FR-12 | S10 variant | `scans` | Phase 4 |
| FR-13 | S19 | `consent_records`, `users` | Phase 1 |
| FR-14 | S20 | — | Phase 1 |
| FR-15 | S7 | `routine_templates`, `routine_steps`, `tips` | Phase 3 |
| FR-16 | S7 | `check_ins` | Phase 3 |

---

## 11. Data model

Postgres 16. All tables carry `created_at timestamptz default now()` and `updated_at`; all user-owned rows carry `user_id` and are protected by row-level security. Deletes are soft (`deleted_at`) except where hard deletion is required by §16.

### 11.1 Entities

**`users`**
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| email | citext unique null | null for anonymous sessions |
| status | enum(`anonymous`, `active`, `grace_period`, `deleted`) | |
| market | char(2) | `NG` at launch |
| locale | text | `en-NG` |
| age_band | enum(`under_16`, `16_17`, `18_24`, `25_34`, `35_44`, `45_plus`) | under_16 blocks use |
| device_id | text | hash, for anonymous continuity |
| last_seen_at | timestamptz | |

**`profiles`** — one per user, ranking inputs.
| Column | Type | Notes |
| --- | --- | --- |
| user_id | uuid pk fk | |
| skin_type | enum(`dry`, `normal`, `oily`, `combination`, `unsure`) | |
| concerns | text[] | max 2 enforced in app layer |
| climate_zone | enum(`hot_humid`, `hot_dry`, `temperate`, `cold`) | default `hot_humid` in NG |
| latest_analysis_id | uuid fk null | |
| onboarding_state | jsonb | per-step completion |
| display_name | text null | |

**`consent_records`** — append-only.
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid fk | |
| kind | enum(`terms`, `privacy`, `image_processing`, `model_training`, `marketing`) | |
| policy_version | text | e.g. `2026-11-01` |
| granted | boolean | |
| ip_hash | text | not raw IP |
| user_agent_hash | text | |

**`skin_analyses`**
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid fk | |
| image_key | text | object storage key, never public |
| image_deleted_at | timestamptz null | |
| tone_band | enum(`I`,`II`,`III`,`IV`,`V`,`VI`) | Fitzpatrick mapping from ITA° |
| ita_degrees | numeric | −90..90 |
| undertone | enum(`warm`, `cool`, `neutral`, `olive`) | |
| evenness_score | smallint | 0–100 |
| texture_scores | jsonb | `{hydration, roughness, flakiness}` 0–100 |
| concerns | text[] | |
| confidence | numeric(3,2) | |
| model_version | text | |
| capture_meta | jsonb | device, lens, flash, blur score, brightness |
| status | enum(`queued`, `processing`, `complete`, `failed`, `low_confidence`) | |

**`brands`** — `id`, `name`, `slug`, `country`, `logo_url`, `is_verified`.

**`products`**
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| brand_id | uuid fk | |
| category | enum(`cream`, `perfume`) | |
| name, slug | text | unique per brand |
| description | text | |
| concentration | enum(`edc`,`edt`,`edp`,`parfum`,`extrait`,`n/a`) | perfume only |
| family_ids | uuid[] | FK to `fragrance_families`, ordered by prominence; validated at import |
| attributes | jsonb | cream: `fragrance_free`, `vegan`, `non_comedogenic`, `richness` |
| performance | jsonb | perfume: `longevity` 1–5, `projection` 1–5 |
| occasion_tags | text[] | `daily`, `office`, `evening`, `event` |
| image_url | text | |
| source | enum(`licensed`, `brand`, `curated`, `user`) | |
| verified_at | timestamptz | recency drives availability confidence |
| data_confidence | numeric(3,2) | |
| is_active | boolean default true | false hides the product from browse and recommendations |

**`product_variants`** — `id`, `product_id`, `size_ml`, `price_ngn`, `price_usd`, `sku`, `availability` enum(`in_stock`, `low_stock`, `out_of_stock`, `unknown`), `retailer_id`, `last_checked_at`.

**`ingredients`**
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| inci_name | text unique | canonical |
| aliases | text[] | for OCR fuzzy match |
| common_name | text | |
| functions | text[] | humectant, emollient, occlusive, surfactant, preservative, fragrance, active, UV filter |
| comedogenic_rating | smallint null | 0–5, null when unknown |
| irritation_risk | enum(`none`,`low`,`moderate`,`high`) | |
| is_allergen | boolean | EU 26 fragrance allergens plus known contact allergens |
| pregnancy_note | text null | |
| evidence_grade | enum(`A`,`B`,`C`,`D`) | quality of supporting evidence |
| sources | text[] | citations |
| reviewed_by | text null | advisor initials |
| reviewed_at | timestamptz null | |
| needs_review | boolean default true | cleared only by an advisor sign-off |

**`product_ingredients`** — `product_id`, `ingredient_id`, `position` (1-based INCI order), `concentration_band` enum(`>1%`, `0.1-1%`, `<0.1%`, `unknown`).

**`fragrance_families`** — `id`, `name` (floral, woody, citrus, oriental, fresh, gourmand), `parent_id` null for subfamilies, `sort_order`. Canonical vocabulary: products and preferences both reference it, so a typo cannot silently disable a family exclusion.

**`fragrance_notes`** — `id`, `name`, `family_id`, `subfamily`, `descriptor` (`citrus`, `green`, `sweet`, `animalic`…), `volatility` 1–5.

**`product_notes`** — `product_id`, `note_id`, `layer` enum(`top`,`heart`,`base`), `prominence` 1–3.

**`fragrance_profiles`** — `user_id` pk, `families_liked` text[], `families_disliked` text[], `notes_loved` text[], `notes_avoided` text[], `strength_pref` enum(`light`,`moderate`,`strong`,`very_strong`), `occasions` text[], `budget_min_ngn` int, `budget_max_ngn` int, `quiz_version` text, `completed_at`.

**`sensitivities`** — `id`, `user_id`, `ingredient_id` null, `free_text` null, `severity` enum(`mild`,`moderate`,`severe`), `applies_to` text[] (`cream`,`perfume`), `verified` boolean.

**`scans`**
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid fk | |
| kind | enum(`ingredient_label`,`bottle`) | |
| image_key | text | deleted after 24h by default |
| status | enum(`queued`,`processing`,`complete`,`failed`,`low_confidence`) | |
| raw_text | text | |
| parsed | jsonb | `[{raw, match, confidence}]` |
| match_rate | numeric(3,2) | |
| matched_product_id | uuid null | |
| verdict | enum(`good`,`okay`,`avoid`) null | |
| confidence | numeric(3,2) | |
| model_version | text | |

**`scan_findings`** — `id`, `scan_id`, `ingredient_id` null, `label`, `severity` enum(`beneficial`,`neutral`,`caution`,`avoid`), `reason`, `source`.

**`recommendations`**
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid fk | |
| kind | enum(`cream`,`perfume`,`similar`,`pairing`) | |
| session_id | uuid | groups one request |
| product_id | uuid fk | |
| rank | smallint | |
| score | numeric(4,1) | 0–100 display score |
| breakdown | jsonb | per-term contributions |
| reason_text | text | generated once, stored |
| model_version | text | |
| algorithm_version | text | |

**`feedback`** — `id`, `recommendation_id`, `user_id`, `action` enum(`view`,`save`,`dismiss`,`rate`,`purchase_intent`), `dismiss_reason` enum(`too_expensive`,`wrong_scent`,`wrong_skin`,`already_own`,`not_available`,`other`), `rating` smallint 1–5, `note` text.

**`saved_items`** — `id`, `user_id`, `product_id`, `list` enum(`wishlist`,`owned`), unique(user_id, product_id, list).

**`routine_templates`** — `id`, `slug` unique, `title`, `kind` enum(`body_basic`), `audience_skin_types` text[], `audience_concerns` text[], `content_version`, `is_active`. Read-only to the request path.

**`routine_steps`** — `id`, `template_id` fk, `position` smallint 1–8 (unique per template), `title`, `instruction` (≤140), `why` (≤140), `inputs` text[], `tip_id` fk null. Read-only to the request path.

**`tips`** — `id`, `slug` unique, `topic` enum(`routine`,`scent`,`sun`,`ingredients`), `body` (≤140), `why` (≤140), `inputs` text[], `sort_order`, `reviewed_at`, `reviewed_by`, `is_active`. Nothing servable before review. Read-only to the request path.

**`check_ins`** — `id`, `user_id`, `checked_on` date (Lagos day, ±1 day), `completion` enum(`skipped`,`partly`,`done`), `feel` enum(`drier`,`about_same`,`more_comfortable`,`not_sure`) null, soft delete, unique live (user_id, checked_on).

**`data_requests`** — `id`, `user_id`, `kind` enum(`export`,`delete`), `status`, `requested_at`, `completed_at`.

**`product_reports`** — `id`, `product_id`, `user_id`, `kind` enum(`price`,`availability`,`ingredients`,`details`), `payload` jsonb, `status`.

**`analytics_events`** — mirror of the client event stream, 90-day retention, used only for aggregate product metrics. Not joined back to images.

### 11.2 Relationships

```
users 1─1 profiles
users 1─n skin_analyses
users 1─n recommendations ─n─1 products
users 1─1 fragrance_profiles
users 1─n sensitivities ─n─1 ingredients
users 1─n scans ─1─n scan_findings
users 1─n saved_items ─n─1 products
users 1─n check_ins
brands 1─n products 1─n product_variants
products n─n ingredients (product_ingredients)
products n─n fragrance_notes (product_notes)
recommendations 1─n feedback
```

### 11.3 Indexing and retention

- Composite index on `products(category, is_active, verified_at desc)`; GIN on `products.families`, `products.attributes`, and `ingredients.aliases`.
- Trigram index on `products.name` and `brands.name` for search.
- `skin_analyses.image_key` purged by a nightly job after the 24-hour window unless the user opted into history images.
- `analytics_events` partitioned monthly, 90-day retention.

---

## 12. API contract

### 12.1 Conventions

- Base path `/api/v1`, JSON only, `snake_case` fields.
- Auth: `HttpOnly`, `Secure`, `SameSite=Lax` session cookie. CSRF double-submit token on all mutating requests.
- Idempotency: `Idempotency-Key` header required on `POST /scans` and `POST /skin-analyses`; replays return the original result.
- Errors use one envelope:

```json
{
  "error": {
    "code": "IMAGE_TOO_BLURRY",
    "message": "This photo is too blurry to read your skin.",
    "retryable": true,
    "details": { "blur_score": 42, "required": 100 }
  }
}
```

- Status codes: `400` validation, `401` unauthenticated, `403` consent missing or forbidden, `404` not found, `409` conflict, `413` payload too large (10 MB cap), `422` unprocessable image, `429` rate limited, `503` upstream unavailable.
- Every response carries `x-request-id`; errors reference it in the UI for support.
- Rate limits (per user, rolling hour): 10 analyses, 60 scans, 120 recommendation reads, 30 feedback writes, 5 OTP requests.

### 12.2 Endpoints

| Method | Path | Purpose | Notes |
| --- | --- | --- | --- |
| POST | `/auth/otp/request` | Send email OTP | 5 per email per hour |
| POST | `/auth/otp/verify` | Exchange OTP for session | 5 attempts then lockout |
| POST | `/auth/logout` | End session | |
| GET | `/me` | Current user, profile, consents, onboarding state | Hydrates the app shell |
| PATCH | `/me/profile` | Update skin basics, climate | |
| GET | `/me/export` | Start data export | Async, returns request id |
| POST | `/me/delete` | Start account deletion | 7-day grace |
| GET, POST | `/me/consents` | Read, append consent record | Append-only |
| GET, PUT | `/me/fragrance-profile` | Read, replace quiz answers | |
| GET, POST | `/me/sensitivities` | List, add | |
| DELETE | `/me/sensitivities/{id}` | Remove | |
| POST | `/skin-analyses` | Upload image, start analysis | `multipart/form-data`; returns `202` + id |
| GET | `/skin-analyses/{id}` | Poll status and result | Poll every 1s, then backoff |
| GET | `/skin-analyses` | History | Paginated, 20/page |
| DELETE | `/skin-analyses/{id}` | Delete analysis and image | |
| GET | `/products` | Browse and filter | `category`, `max_price`, `fragrance_free`, `vegan`, `in_stock`, `families[]`, `q`, cursor |
| GET | `/products/{id}` | Detail with ingredients or notes | |
| POST | `/products/{id}/reports` | Report incorrect data | |
| POST | `/scans` | Upload label or bottle image | `202` + id |
| GET | `/scans/{id}` | Verdict, findings, parse confidence | |
| GET | `/scans` | Scan history | |
| GET | `/recommendations/creams` | Ranked creams | `limit`, filters |
| GET | `/recommendations/perfumes` | Ranked perfumes | `limit`, filters |
| GET | `/recommendations/similar` | Similar to anchor | `product_id` or `q`, `cheaper_only` |
| GET | `/recommendations/pairings` | Cream plus perfume pairs | `perfume_id` optional |
| POST | `/feedback` | Record a recommendation action | Idempotent per recommendation+action |
| GET, POST | `/saved-items` | List, save | |
| DELETE | `/saved-items/{id}` | Remove | |
| GET | `/routine` | Generic routine + reviewed tips + disclaimer | Curated content, no auth beyond session |
| GET | `/check-ins` | Latest-two summary + streak | |
| POST | `/check-ins` | Record one check-in | Idempotent per user + Lagos day; 201 |
| DELETE | `/check-ins/{id}` | Remove a check-in | Soft delete |
| GET | `/meta/taxonomies` | Families, concerns, notes, occasions, price bands | Cached 24h, used for UI labels |

### 12.3 Recommendation response shape

```json
{
  "data": {
    "session_id": "8f2c...",
    "algorithm_version": "cream-1.0.0",
    "profile_version": "2026-11-02T10:12:00Z",
    "items": [
      {
        "recommendation_id": "9c31...",
        "rank": 1,
        "score": 87.5,
        "product": {
          "id": "b4e1...",
          "name": "Shea Repair Body Cream",
          "brand": "Example",
          "category": "cream",
          "price_ngn": 8500,
          "image_url": "https://cdn.example/...",
          "attributes": { "fragrance_free": true, "vegan": false, "non_comedogenic": true }
        },
        "reason": "Rich in shea and glycerin, which matches your dry skin in humid Lagos, and it is fragrance-free so it will not compete with a perfume.",
        "breakdown": {
          "skin_type_fit": 0.92,
          "ingredient_safety": 0.88,
          "concern_efficacy": 0.81,
          "climate_fit": 0.9,
          "budget_fit": 1.0,
          "feedback_affinity": 0.5
        },
        "excluded_conflicts": [],
        "flags": []
      }
    ],
    "excluded": [
      {
        "product_id": "77aa...",
        "name": "Rich Cocoa Butter",
        "code": "sensitivity_severe",
        "reason": "Contains fragrance mix I, which you asked us to avoid."
      }
    ],
    "total_matched": 24,
    "filters_applied": { "max_price_ngn": 12000, "fragrance_free": true }
  },
  "meta": { "request_id": "req_...", "served_in_ms": 41, "cached": false }
}
```

**Field notes.** `recommendation_id` is required: `POST /feedback` references a recommendation and the client has no other way to name one. `excluded` is required by §14.2, which promises excluded items are shown with a reason rather than silently dropped; `code` is one of a closed enum (`sensitivity_severe`, `over_budget`, `out_of_stock`, `fragrance_free_required`, `family_disliked`, `no_note_data`, `already_owned`, `not_catalogue_ready`). `session_id` is derived from a hash of the inputs (user, kind, filters, profile version, algorithm version, day bucket), so a repeated request is a replay rather than a duplicate write; `meta.cached` reports whether the stored session was reused.

### 12.4 Storage and upload rules

- Images are uploaded directly to object storage via short-lived signed URL, then referenced by key; the API never proxies the binary.
- Client sends a downscaled JPEG (long edge 1280–1600 px, quality 0.85) plus original EXIF stripped.
- Server validates content type by magic bytes, rejects > 10 MB, re-encodes to strip embedded metadata.
- Object keys are opaque UUIDs; signed GET URLs expire in 5 minutes; bucket is private.
- Image retention: 24 hours after processing by default; retained only if the user has enabled "keep my photos" (off by default).

---

## 13. AI pipeline specification

### 13.1 Principles

Models are used where they are genuinely better than rules: reading an image, reading distorted label text, and phrasing an explanation. They are not used for safety decisions, price math, availability, or allergen matching — those stay deterministic and auditable.

Every model call is wrapped in a provider-agnostic interface (`analyzeSkin`, `readLabel`, `phraseReason`) so vendors can be swapped. Every output is schema-validated with Zod and rejected if malformed. Every stored result carries `model_version` so historical output can be re-evaluated.

### 13.2 Capture quality gate (client, then server)

Runs on-device first to save bandwidth, then re-verified server-side. Reject with a specific code when any check fails.

| Check | Method | Threshold | Failure code |
| --- | --- | --- | --- |
| Resolution | Canvas dimensions | short edge ≥ 720 px | `IMAGE_TOO_SMALL` |
| Blur | Variance of Laplacian on greyscale | ≥ 100 | `IMAGE_TOO_BLURRY` |
| Exposure | Mean luminance 0–255 | 70–200 | `IMAGE_TOO_DARK` / `IMAGE_TOO_BRIGHT` |
| Glare | Fraction of saturated pixels in centre crop | ≤ 3% | `IMAGE_GLARE` |
| Skin coverage | On-device segmentation mask over centre 60% | ≥ 40% | `NO_SKIN_DETECTED` |
| Orientation | EXIF and aspect ratio | portrait-ish, 0.5–2.0 | `IMAGE_CROPPED` |
| Subject count | Segmentation | exactly one skin region | `MULTIPLE_SUBJECTS` |
| Filter suspicion | Frequency-domain heuristic plus EXIF software tag | none detected | warn only, `FILTER_SUSPECTED` |

Retake copy names the defect: "The photo is blurry — hold the phone steady and tap to focus." Never "something went wrong".

### 13.3 Skin analysis

**Input:** one validated image plus `skin_type`, `concerns`, `climate_zone`, and the user's market.

**Output contract** (must validate or the call is retried once, then failed):

```json
{
  "tone_band": "V",
  "ita_degrees": -20.0,
  "undertone": "warm",
  "evenness_score": 62,
  "texture_scores": { "hydration": 55, "roughness": 61, "flakiness": 40 },
  "concerns": ["uneven_tone", "dryness"],
  "confidence": 0.78,
  "evidence": ["visible flaking on the upper arm", "uneven pigmentation across the forearm"]
}
```

**Method.** Multimodal vision model plus deterministic post-processing:

1. Model returns tone/undertone/evenness/texture/concerns plus short visual evidence.
2. Post-processing clamps scores to 0–100, reconciles the tone band against ITA° using the standard Fitzpatrick/ITA mapping, and rejects internally inconsistent output (e.g. band `I` with ITA° −60).
3. Confidence is the model's self-reported confidence, capped by the quality-gate margins (a marginal exposure score cannot yield > 0.8 confidence).

**Thresholds.**
- `confidence >= 0.55` → usable result, recommendations generated.
- `0.4 <= confidence < 0.55` → result shown, flagged low confidence, no recommendations, retake offered.
- `< 0.4` → no result; retake required.

**Bias controls.**
- Never infer tone from skin alone for users whose image quality is marginal in the darkest and lightest bands. When `tone_band` is `V` or `VI` and exposure margin is thin, prefer a retake over a guess.
- Evaluation set stratified at 50 images per Fitzpatrick band (300 total), consented and collected at beta.
- Acceptance thresholds before public launch: tone band accuracy ≥ 85% overall with no band below 75%; undertone accuracy ≥ 75%; texture agreement within ±1 point ≥ 80%; concern precision ≥ 70%; refusal correctness on non-skin images ≥ 98%.
- Any change to the prompt or model requires re-running the 300-image suite and recording results in the model card.

**Language guardrails.** Banned outputs: any tone judgement, "lightening", "brightening the skin tone", diagnosis terms (`eczema`, `psoriasis`, `dermatitis` as a conclusion), prevalence claims. The prompt enforces a whitelist of concern labels; anything else is mapped or dropped.

### 13.4 Ingredient label OCR

**Pipeline:**

1. Client crops to the label with a guideline overlay; server receives the crop.
2. Preprocess: EXIF rotate, deskew (±15°), CLAHE contrast, unsharp mask, upscale to 2000 px long edge.
3. OCR (`DOCUMENT_TEXT_DETECTION`, with a second provider as fallback) returns text blocks with bounding boxes.
4. Normalisation: unify separators, split on commas implying INCI order, strip trailing marketing copy, detect language.
5. Token matching against `ingredients.inci_name` and `aliases` using Jaro-Winkler ≥ 0.90, then a blocked fuzzy pass for OCR confusions (`rn`→`m`, `l`→`I`, `0`→`O`, `1`→`l`).
6. LLM resolves only the residue — tokens that remain unmatched after fuzzy matching — constrained to a candidate list; it may not invent ingredients.
7. Unknown residue is returned as `unmatched` and surfaced to the user.

**Confidence and gating.** `match_rate = matched / tokens`. Verdict requires `match_rate >= 0.60` and at least 5 matched ingredients. Below that, `low_confidence` with a specific retake reason. A partial parse never yields `avoid` — that would be a false accusation about a product.

**Verdict engine (deterministic):**

| Input | Rule |
| --- | --- |
| User sensitivity (severe) present | `avoid` |
| User sensitivity (mild/moderate) present | `avoid` if 2+ matches, else `okay` with warning |
| 2+ high-irritation ingredients and profile concern `sensitivity` | `avoid` |
| Comedogenic ≥ 3 on 2+ ingredients and profile concern `body_acne` | `okay` with caution |
| Fragrance allergen present and profile concern `sensitivity` | `okay` with caution |
| No rules triggered | `good` if ≥ 3 beneficial ingredients against profile concerns, else `okay` |

Every finding carries `reason` (≤ 140 characters) and `source` (knowledge-base citation). The explanation sentence is generated from findings, not free-form: the model is given the findings and asked to phrase them, never to add new claims.

### 13.5 Fragrance reasoning

Note-level similarity is computed in §14.3. The model is used only to phrase the reason text from a fixed set of facts: matched families, shared notes, performance bands relative to the user's preference, climate note, and price delta. Facts are passed as structured input; the model may not introduce notes or accords that are not in the payload.

Example template inputs:

```
{ "matched_families": ["woody","amber"], "shared_notes": ["vanilla","cedar"],
  "strength_band": "strong", "user_strength_pref": "strong",
  "climate": "hot_humid", "price_delta_pct": -35, "occasion": "evening" }
```

### 13.6 Failure handling and cost

- Timeouts: vision 20s, OCR 15s, phrasing 5s. One retry with identical input on schema failure only.
- Circuit breaker: 5 consecutive upstream failures open the breaker for 60s and serve cached popular results with an honest banner.
- Cost ceilings: ≤ 4 AI calls per user session; ≤ ₦40 per skin analysis and ₦25 per scan at current provider pricing. Alerts at 80% of monthly budget.
- Fallbacks: phrasing failure → deterministic template rendered from facts; analysis failure → retake prompt with the request id; OCR failure → manual correction path (P2).
- No prompt input ever contains the user's email, name, or precise location. Images are sent without EXIF.

---

## 14. Recommendation engines

### 14.1 Shared pipeline

1. **Eligibility** — hard filters remove products the user must not see.
2. **Candidate set** — eligible products in the market, capped at 500 by category.
3. **Scoring** — weighted sum of normalised terms, each 0–1.
4. **Constraint pass** — diversity, previously dismissed items, owned items.
5. **Explanation** — template filled with the top two contributing terms plus one caution, then phrased.
6. **Display score** — `100 × score`, rounded to one decimal.

### 14.2 Cream scoring

`S = 0.30·skinTypeFit + 0.20·ingredientSafety + 0.15·concernEfficacy + 0.15·climateFit + 0.10·budgetFit + 0.10·feedbackAffinity`

| Term | Definition |
| --- | --- |
| `skinTypeFit` | Match between product `richness` (light/medium/rich) and profile `skin_type`; dry→rich 1.0, oily→light 1.0, mismatch decays linearly to 0.3 |
| `ingredientSafety` | Per ingredient, `1 − max(irritation, comedogenic/5)` where `irritation` maps none=0, low=0.25, moderate=0.6, high=1.0; averaged over the formula, weighted up when the user's concerns overlap that ingredient's risk profile |
| `concernEfficacy` | Mean `evidence_grade` weight (A=1, B=0.8, C=0.5, D=0.2) of ingredients that address the user's top 2 concerns |
| `climateFit` | Humectant-vs-occlusive balance against `climate_zone`: in hot-humid, heavy occlusives are penalised (×0.6); in hot-dry, occlusives are rewarded |
| `budgetFit` | 1.0 below 80% of max budget, linear to 0.0 at the max |
| `feedbackAffinity` | Laplace-smoothed rating on a 1–5 scale: `(sum_ratings + 2.5·5) / (count + 5)`, then `(value − 1) / 4` to normalise to 0–1; 0.5 when there is no data |

**Hard exclusions:** severe sensitivity conflict; price above max; `out_of_stock` when the in-stock filter is active; fragrance-free filter violated. Excluded items are listed in a collapsed section with the reason, never silently dropped.

### 14.3 Perfume scoring

`S = 0.28·familyAffinity + 0.22·noteOverlap + 0.14·performanceFit + 0.12·occasionFit + 0.10·climateFit + 0.08·budgetFit + 0.06·novelty − 0.25·dislikedPenalty`

| Term | Definition |
| --- | --- |
| `familyAffinity` | Cosine similarity between the user's family vector (liked +1, disliked −1, neutral 0, plus feedback-derived weights) and the product's family distribution |
| `noteOverlap` | IDF-weighted overlap of `notes_loved` with the product's notes; heart and base layers weighted 1.3× for dry skin (dry skin holds top notes poorly) |
| `performanceFit` | Distance between product longevity band and `strength_pref`, plus projection match; 1.0 at exact match |
| `occasionFit` | Jaccard between product `occasion_tags` and user `occasions` |
| `climateFit` | Hot-humid: citrus/fresh/aromatic +0.2, gourmand/oud −0.2; hot-dry: floral/wood +0.1; temperate: neutral |
| `budgetFit` | As creams |
| `novelty` | `1 − max(note similarity to owned items)`; prevents recommending what the user already has |
| `dislikedPenalty` | 1.0 if any `notes_avoided` present at prominence 2+, else 0.5 if present at prominence 1, else 0 |

**Hard exclusions:** any `families_disliked` primary family; budget exceeded; owned items (unless toggled); no note data when the user requires explanation.

**Diversity:** max 2 per house, max 3 per primary family in the top 10. Applied after scoring by demoting conflicting items and backfilling from the next eligible candidate.

### 14.4 Similar-to search

`S_sim = 0.55·noteCosine + 0.20·familyMatch + 0.15·accordMatch + 0.10·performanceMatch`

Labels: `>= 0.80` very close, `0.65–0.79` close, `0.50–0.64` loosely similar. Below 0.50, items are not shown. The anchor is excluded. When `cheaper_only` is on, results are filtered by `price_ngn < anchor.price_ngn` before ranking.

### 14.5 Personalisation loop

- Feedback weights decay with a 120-day half-life so recent taste dominates.
- A product dismissed as `wrong_scent` applies a −0.15 penalty to its primary family for that user only.
- Ratings feed `feedbackAffinity`; three or more ratings unlock a visible "adjusted for you" note on results.
- All personalisation is per user and never pooled. No cross-user collaborative filtering in v1 — cold start uses market popularity priors.

### 14.6 Explanation generation rules

- One sentence, ≤ 140 characters, naming a specific product property and a specific profile property.
- Never name a term the user cannot act on ("your ingredient_safety score was 0.88" is banned; "shea and glycerin suit dry skin" is allowed).
- Never promise a result ("will clear your skin"). Use "suits", "matches", "designed for".
- Caution clause appended when `ingredientSafety < 0.5` or when the product contains a known allergen and the user has any sensitivity.
- Explanations are generated once and stored with the recommendation, so the same result never changes wording on refresh.
- **Template-first.** v1 reasons are rendered from facts with deterministic templates. A model may rephrase at most the top 3 items per session, inside the 4-call ceiling in §13.6; everything else uses the template. Per-item model phrasing is not affordable and would breach the latency target.
- A stored reason is tied to the `algorithm_version` that produced it. When the algorithm changes, new sessions carry a new version; old rows stay readable but are not replayed.

---

## 15. Catalogue and ingredient knowledge base

### 15.1 Launch catalogue targets

| Dataset | Target | Minimum viable | Notes |
| --- | --- | --- | --- |
| Body creams | 300 | 150 | Must cover 20 price bands from ₦2,000 to ₦40,000 |
| Perfumes | 450 | 250 | Must include 40 "designer classics" used as similar-to anchors |
| Brands | 90 | 50 | At least 30 with Lagos availability |
| Ingredients | 1,200 | 600 | Must cover 95% of ingredients appearing in the top 100 creams |
| Fragrance notes | 350 | 200 | With family and volatility assigned |

**Coverage rule.** Every cream in the catalogue must have ≥ 95% of its INCI list matched. A product with a worse match rate is stored as `draft` and excluded from recommendations.

### 15.2 Sourcing

| Source | Use | Legal position |
| --- | --- | --- |
| Licensed fragrance database | Notes, accords, performance priors | Contract required before Week 4 (see §7) |
| Brand-supplied data | INCI lists, sizes, images | Written permission per brand |
| Retailer feeds | Price, availability | Terms permitting display; refresh daily |
| In-house curation | Ingredient knowledge base | Original work, advisor reviewed |
| User reports | Corrections, missing products | Terms grant licence to use the correction |

No scraping of retailer or competitor sites. Images must be licensed or brand-supplied; placeholder art is used until then.

### 15.3 Ingredient knowledge base governance

- Every ingredient row has `evidence_grade`, `sources`, and either `reviewed_by` or a `needs_review` flag.
- Only `evidence_grade` A or B entries may drive an `avoid` verdict without a second signal.
- Reviews happen quarterly, and immediately when a credible retraction is published.
- A changelog records every verdict-affecting edit, with the reviewer and date, and is exportable for audit.
- The advisor (a licensed dermatologist or pharmacist) reviews the 200 most-impactful ingredients before launch. Budget: 20 hours.

### 15.4 Definition of catalogue-ready

A product may be recommended only when: name, brand, category, price, size, at least one image, full ingredient list or full note pyramid, availability status, and a `data_confidence >= 0.7`. Anything less stays `draft` and is excluded from results but can still be found by search with a "data incomplete" label.

---

## 16. Privacy, consent and legal

### 16.1 Regulatory posture

- **Nigeria:** Nigeria Data Protection Act 2023 and NDPR. FreshSkin acts as data controller. A Data Protection Officer is appointed and reachable at `privacy@freshskin.app` before launch.
- **EU/UK:** GDPR applies as soon as EU or UK users can sign up. Launch geo-fence is Nigeria; if EU traffic exceeds 500 monthly actives, a DPIA and EU representative are required before continuing.
- **Not a medical device.** No CE/UKCA medical device claim; no diagnosis. Disclaimers are shown at consent, on every analysis result, and on every verdict.

### 16.2 Data map

| Data | Purpose | Lawful basis | Retention |
| --- | --- | --- | --- |
| Age band | Eligibility | Legal obligation | Account lifetime |
| Email | Account, security | Contract | Account lifetime, then 30 days |
| Skin images | Analysis | Explicit consent | 24 hours (default) or until deleted |
| Skin analysis results | Recommendations, history | Explicit consent | Account lifetime |
| Fragrance preferences | Recommendations | Contract | Account lifetime |
| Sensitivities | Safety | Explicit consent (health-adjacent) | Account lifetime |
| Scan images | OCR | Explicit consent | 24 hours |
| Scanned text and findings | History | Contract | Account lifetime |
| Ratings and feedback | Personalisation | Contract | Account lifetime |
| Check-in completion and feel | Progress display | Contract | Account lifetime |
| Product reports | Data quality | Legitimate interest | 24 months |
| Analytics events | Product metrics | Legitimate interest, no special category data | 90 days |
| Logs | Security | Legitimate interest | 30 days |

**Special category note.** Sensitivities and skin images can reveal health data. They are processed only on explicit consent, excluded from analytics, and never used for advertising.

### 16.3 Consent mechanics

- Granular, unbundled, versioned, and recorded append-only with policy version, timestamp, and hashed identifiers.
- Core processing and image processing are required for the product; refusing either means the app is unusable, and the user is told so plainly before granting.
- Model training consent is optional, off by default, and withdrawable, which removes the user's images from future training sets (a model retrain is not required to retroactively remove, but exclusion from the next one is).
- Marketing consent is separate and off by default.
- Withdrawal is as easy as granting: a single toggle in settings, effective immediately for future processing, with deletion of dependent data within 24 hours where the consent was the only basis.

### 16.4 User rights implementation

| Right | Implementation | SLA |
| --- | --- | --- |
| Access and portability | Self-serve JSON + CSV export from settings | 24 hours typical, 30 days maximum |
| Erasure | Two-step deletion with 7-day grace, then hard delete | 30 days maximum |
| Rectification | Profile editing plus product reports | Immediate for profile |
| Withdraw consent | Settings toggle | Immediate |
| Object to processing | Support request, documented process | 30 days |
| Complaint | Link to NDPC and, where relevant, EU supervisory authority | In policy |

Deletion removes: images, analyses, scans, preferences, sensitivities, ratings, saved items, account. Retained: anonymised aggregate counts, and transaction or consent records required by law (retained for the statutory period, stated in the confirmation email).

### 16.5 Security requirements

- TLS 1.3 in transit; AES-256 at rest for database and object storage.
- Images stored in a private bucket with 5-minute signed URLs; no public CDN paths for user images.
- Secrets in a managed secret store; no secrets in the client bundle.
- Session cookies `HttpOnly`, `Secure`, `SameSite=Lax`, 30-day rolling expiry, revoked on passwordless re-auth.
- Row-level security on every user-owned table; service-role keys never in client code.
- Dependency scanning in CI, secret scanning on push, and a documented incident response with a 72-hour breach notification path.
- Penetration test before public launch; critical findings block launch.

### 16.6 Sub-processors

Must be listed in the privacy policy with purpose, location, and a link to their terms: hosting, database, object storage, email, analytics, error tracking, OCR, and vision model providers. Additions require policy update and, for EU data, a transfer mechanism. `OPEN: vendor selection finalised in Week 2.`

### 16.7 Disclaimers (canonical text)

- **Global footer:** "FreshSkin offers cosmetic guidance, not medical advice. It cannot diagnose or treat skin conditions."
- **Analysis result:** "This is a cosmetic assessment based on one photo. Lighting and camera affect results. If you have a skin condition or a severe reaction, see a dermatologist."
- **Ingredient verdict:** "Verdicts are based on published information about ingredients and your saved sensitivities. Labels change — check the packaging."
- **Perfume:** "Fragrance is subjective and behaves differently on every skin. Longevity estimates are guidance, not a guarantee."
- **Allergen flag:** "We can only check what is disclosed. Many fragrances do not list their full composition."
- **Routine:** "This routine is general cosmetic guidance, not medical advice. Skin changes have many causes, so see a dermatologist if something worries you."
- **Check-ins:** "Check-ins are your own notes. Two entries show what changed lately, not a medical trend."

---

## 17. Non-functional requirements

### 17.1 Performance budgets

| Metric | Target | Measurement |
| --- | --- | --- |
| First contentful paint | < 1.8s p75 on 4G, mid-tier Android | Field data via Web Vitals |
| Largest contentful paint | < 2.5s p75 | Field data |
| Interaction to next paint | < 200ms p75 | Field data |
| Initial JS bundle | < 200 KB gzip | Build check in CI |
| API read p95 | < 400ms | Server metrics |
| Capture to skin result | < 10s p75, hard timeout 25s | Client event timestamps |
| Scan to verdict | < 20s p75, hard timeout 30s | Client event timestamps |
| Recommendation request | < 800ms p95 | Server metrics |
| Time to interactive on 3G | < 5s | Lab, throttled |

### 17.2 Availability and resilience

- 99.5% monthly availability for the web app and API.
- Graceful degradation order: disable AI analysis, serve cached recommendations, serve catalogue read-only, offline shell.
- RPO 24 hours, RTO 4 hours. Backups daily with 30-day retention, restore tested quarterly.
- No single AI provider in the critical path: OCR has a fallback, and phrasing has a deterministic template fallback.

### 17.3 Accessibility

- WCAG 2.2 AA. Contrast ≥ 4.5:1 for text, 3:1 for large text and UI components.
- Touch targets ≥ 44×44 px.
- Full keyboard operation on web; visible focus states.
- Screen reader labels on every control, live regions for analysis and OCR progress.
- Text scales to 200% without loss of function; layout reflows, no horizontal scroll at 320 px width.
- Respect `prefers-reduced-motion`; no autoplay; no colour-only encoding.
- Accessibility audit at Week 10, blocking issues fixed before beta.

### 17.4 Compatibility

- iOS Safari 16.4+ (camera via `getUserMedia` and the file input fallback).
- Android Chrome 111+.
- Desktop Chrome, Edge, Firefox, Safari latest-1.
- Minimum viewport 320×568.
- PWA installable on Android and iOS, with a documented install guidance screen for iOS (manual, as Apple requires).

### 17.5 Localisation readiness

- All copy in a message catalogue, no hard-coded strings.
- `Intl` for currency and dates; NGN formatting `₦8,500`.
- Layout tolerates 30% string expansion even though v1 ships English only.

### 17.6 Observability

- Structured JSON logs with `request_id`, `user_id_hash`, route, latency, and error code.
- Sentry for client and server exceptions, with release tagging.
- Dashboards: capture funnel, analysis failure reasons, OCR match-rate distribution, recommendation latency, AI cost per user, error-rate by route.
- Alerts: error rate > 2% over 5 minutes, p95 latency > 1s, AI cost > 80% of budget, analysis failure rate > 10%.

### 17.7 Stack baseline

The stack is not a product requirement, but it is fixed for v1 so that estimates and the build order in §20 are meaningful. Changes require an ADR in the repo.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router), React, TypeScript strict | One codebase for mobile and desktop, server rendering for fast first paint, established PWA path |
| UI | Tailwind CSS with a Radix-based component layer | Accessible primitives out of the box, small CSS payload |
| Client imaging | Canvas plus on-device segmentation and blur/exposure heuristics | Keeps uploads small on 3G and rejects bad photos before spending a request |
| Data | Managed Postgres 16, Drizzle ORM, row-level security | Relational fit for catalogue plus profiles; RLS enforces tenancy at the database |
| Storage | Private object bucket, signed URLs | User images never publicly addressable |
| Auth | Email OTP, HttpOnly cookie sessions; passkeys in Phase 3 | Lowest-friction identity for the target user |
| Jobs | Managed queue (catalogue import, analysis, exports, nightly purge) | Long-running work kept out of request handlers |
| AI | Provider-agnostic adapters, structured outputs validated with Zod | Vendor swaps without rewriting call sites |
| Analytics and errors | Product analytics in an EU region, Sentry, uptime checks | Residency-safe metrics plus real error visibility |
| CI | Typecheck, lint, unit, E2E smoke, accessibility check, bundle budget on every PR | Enforces §17.1 and §17.3 mechanically rather than by review |

---

## 18. Analytics and measurement

### 18.1 Principles

Events are named in `snake_case`, past tense, and describe a user action or a system outcome. No event carries image data, free-text sensitivities, or email. Every event has `user_id_hash`, `session_id`, `platform`, `app_version`, and `market`.

### 18.2 Event taxonomy

| Event | Properties | Fires when |
| --- | --- | --- |
| `app_opened` | `is_installed`, `entry_point` | App shell loads |
| `consent_granted` | `kinds[]`, `policy_version` | Required consents accepted |
| `consent_withdrawn` | `kind` | Any consent toggled off |
| `onboarding_step_completed` | `step`, `duration_ms` | Each step |
| `onboarding_completed` | `total_duration_ms` | Final step |
| `skin_capture_started` | `method` (camera/gallery) | Camera opens or upload tapped |
| `skin_capture_rejected` | `reason_code` | Quality gate fails |
| `skin_analysis_requested` | `retry_count` | Upload succeeds |
| `skin_analysis_completed` | `confidence_band`, `tone_band`, `latency_ms` | Result rendered |
| `skin_analysis_failed` | `error_code` | Terminal failure |
| `skin_analysis_low_confidence` | `confidence` | Shown with retake prompt |
| `cream_recommendations_viewed` | `count`, `filters[]`, `latency_ms` | List rendered |
| `recommendation_opened` | `kind`, `rank`, `score`, `product_id` | Detail opened |
| `recommendation_saved` | `kind`, `rank`, `product_id` | Saved |
| `recommendation_dismissed` | `kind`, `rank`, `reason` | Dismissed |
| `score_breakdown_opened` | `kind`, `product_id` | "Why this" expanded |
| `scan_started` | `method`, `kind` | Camera or upload |
| `scan_completed` | `verdict`, `match_rate`, `finding_count`, `latency_ms` | Verdict rendered |
| `scan_low_confidence` | `match_rate` | Below threshold |
| `scan_failed` | `error_code` | Terminal failure |
| `scent_quiz_started` | — | Step 1 shown |
| `scent_quiz_completed` | `duration_ms`, `families_selected` | Final step |
| `scent_quiz_skipped` | `at_step` | Skip used |
| `perfume_recommendations_viewed` | `count`, `latency_ms` | List rendered |
| `similar_search_used` | `anchor_in_catalogue`, `cheaper_only` | Search submitted |
| `pairing_viewed` | `pair_count` | Pairing screen rendered |
| `routine_viewed` | `step_count`, `offline` | Routine card rendered |
| `tip_opened` | `tip_id`, `topic` | "Why" expanded on a tip or step |
| `check_in_recorded` | `completion`, `feel`, `streak_bucket`, `queued` | Check-in saved or queued |
| `check_in_sync_failed` | `error_code` | Queued flush failed |
| `sensitivity_added` | `severity`, `matched` | Sensitivity saved |
| `product_rated` | `kind`, `rating`, `product_id` | Rating submitted |
| `product_report_submitted` | `kind` | Report sent |
| `data_export_requested` | — | Export requested |
| `account_deletion_requested` | — | Deletion confirmed |
| `pwa_installed` | `platform` | Install completes |
| `api_error_shown` | `route`, `error_code`, `retryable` | Error surfaced |

### 18.3 Metric definitions

| Metric | Definition | Target (first 6 months) | Instrumentation |
| --- | --- | --- | --- |
| Activation | New users completing a skin analysis or scent quiz within 24h of first open | ≥ 60% | `skin_analysis_completed` or `scent_quiz_completed` ÷ `app_opened` (first) |
| Capture success rate | `skin_analysis_completed` ÷ `skin_capture_started` | ≥ 70% | Funnel |
| Analysis retake rate | `skin_analysis_low_confidence` + `skin_capture_rejected` ÷ captures | ≤ 25% | Funnel |
| WAU/MAU | Distinct weekly actives ÷ distinct 30-day actives | ≥ 25% | Session-based |
| Recommendation engagement | Sessions with a save or detail open ÷ sessions with a list view | ≥ 40% | Event join |
| Scans per active user per month | `scan_completed` ÷ MAU | ≥ 3 | Event count |
| Perfume satisfaction | 👍 ÷ (👍 + 👎) on perfume recommendations | ≥ 70% | Feedback events |
| Cream satisfaction | Same, creams | ≥ 70% | Feedback events |
| D30 retention | Users active on day 30 ÷ cohort | ≥ 20% | Cohort |
| Dual-feature adoption | Users with both a skin analysis and a completed quiz ÷ activated users | ≥ 30% | Cohort |
| Verdict dispute rate | "This is wrong" reports ÷ verdicts | ≤ 5% | `product_report_submitted` |
| Guardrail: crash-free sessions | Sessions without a fatal error | ≥ 99.5% | Sentry |
| Guardrail: p95 analysis latency | Server-side | ≤ 10s | APM |
| Guardrail: AI cost per activated user | Monthly | ≤ ₦180 | Billing dashboard |

### 18.4 Instrumentation rules

- Client events batched every 10s or 20 events; dropped after 24h offline.
- Server-side events are authoritative for anything that must be counted exactly (scans, analyses, recommendations served).
- No PII in event properties; product ids are not personal data, free text never leaves the device.
- Every event is documented in the tracking plan before implementation; the plan is the source of truth for QA.

### 18.5 Experimentation

Feature flags cover: pairing visibility, quiz length (6 vs 3 questions), explanation verbosity, filter defaults. A/B tests require a pre-registered hypothesis, a primary metric, and a minimum sample computed before launch. No more than two concurrent experiments in the recommendation path.

### 18.6 Assumption tests (from §3)

| Assumption | Test | Decision rule |
| --- | --- | --- |
| Users cannot interpret INCI labels | 8 moderated sessions, think-aloud on 3 labels | If ≥ 6 can explain 2 of 3 labels unaided, the scanner's value proposition needs rework |
| Photo beats questionnaire | Compare activation and engagement between capture-first and quiz-first onboarding in beta | Keep capture-first if completion is within 10 points and engagement is higher |
| Price and availability dominate | Filter and dismiss-reason analysis over 4 weeks | If price filters are used by < 20% of sessions, reduce filter prominence |
| Layering is real | 10 interviews plus pairing engagement | Demote pairing to P2 if < 10% of perfume viewers open pairings |

---

## 19. Release plan

### 19.1 Timeline (assumes kickoff Monday, November 9, 2026)

| Phase | Dates | Scope | Exit criteria |
| --- | --- | --- | --- |
| **0 · Foundations** | Nov 9 – Nov 27, 2026 (3 wks) | Repo, CI, environments, auth, design system, data model, catalogue import pipeline, OCR and vision providers wired | A user can sign in, and a hard-coded product renders with real data; CI runs tests on every PR |
| **1 · MVP** | Nov 30, 2026 – Jan 22, 2027 (8 wks) | Consent, onboarding, capture and analysis, cream recommendations, ingredient scanner, scent quiz, perfume recommendations, sensitivities, history, settings | The §6.1 MVP promise holds end to end on a mid-range Android on throttled 3G |
| **1.5 · Private beta** | Jan 25 – Feb 5, 2027 (2 wks) | 50 users in Lagos, 300-image eval set collected, bias review, accessibility audit, pen test | No P0 bugs, tone-band accuracy ≥ 85%, no band < 75%, pen test criticals closed |
| **2 · Public launch** | Feb 8, 2027 (wks 14–15 hardening) | Lagos, NGN, organic and creator launch | 99.5% availability over 14 days, activation ≥ 60% in the first 500 users |
| **3 · Depth** | Feb 15 – Apr 9, 2027 (8 wks) | Similar-to search, pairing, ratings loop, saved lists, smarter personalisation | Similar-to precision ≥ 70% on a 50-pair human eval; pairing engagement ≥ 10% |
| **4 · Expansion** | Apr 12 – Jun 11, 2027 (8 wks) | Bottle scanner, UK market research, affiliate partner outreach, second market decision | Go/no-go review on market expansion with cost and legal inputs |
| **5 · Monetisation** | Jun 15 – Aug 13, 2027 | Affiliate partnerships, retailer integrations, premium tier evaluation | Only if activation and retention targets are met |

### 19.2 Team

| Role | Allocation | Notes |
| --- | --- | --- |
| Product lead | 1.0 | Owns this document and the decisions log |
| Product designer | 1.0 | Mobile-first, WCAG 2.2 fluency |
| Full-stack engineers | 2.0 | Next.js, Postgres, PWA |
| ML/backend engineer | 0.5 | Pipelines, eval harness, prompts |
| Dermatology advisor | 0.1 | Ingredient review, 20 hours pre-launch |
| QA | 0.5 | Manual plus automated E2E |
| Legal/DPO | 0.1 | Consent, policy, sub-processors |

### 19.3 Budget assumptions

- Infrastructure and AI: ₦350,000 per month at 5,000 MAU, scaling sub-linearly.
- Licensed fragrance data: one-off licence, `OPEN` — must be signed before Week 4 or the catalogue scope is cut to curated-only.
- Design and content: in-house, no agency.
- Marketing: near-zero paid; creator seeding and organic only.

### 19.4 Definition of done

A feature is done when: acceptance criteria pass; unit and E2E tests exist; it works at 320 px and with a screen reader; it has loading, empty, error and offline states; events are firing and visible in the dashboard; copy is reviewed; it is behind a flag if it changes the recommendation path; and it has been demoed on a throttled mid-range Android device.

**MVP acceptance gate** — all must be true to open the beta:

1. The §6.1 promise completes without a developer present.
2. All P0 acceptance criteria pass.
3. No open P0 or P1 bugs.
4. Accessibility audit clean on the primary flows.
5. Penetration test criticals and highs resolved.
6. Catalogue meets the minimum-viable targets in §15.1.
7. Every recommendation and verdict shows an explanation.
8. Deletion and export verified end to end by a separate tester.
9. Bias review signed off by the advisor across all six Fitzpatrick bands.
10. Disclaimers present on the consent screen, every analysis, and every verdict.

---

## 20. Build order

Sequenced so that every two weeks ends with something demonstrable. Estimates are engineer-days including tests, not calendar time.

| Epic | Contents | Est. | Depends on |
| --- | --- | --- | --- |
| E1 · Foundations | Repo, CI/CD, environments, auth, session model, design tokens and components, error envelopes, logging | 10 | — |
| E2 · Data layer | Schema, migrations, RLS policies, seed scripts, taxonomy endpoints | 8 | E1 |
| E3 · Catalogue pipeline | Import, normalisation, dedupe, image handling, search, admin review queue | 10 | E2 |
| E4 · Ingredient KB | 1,200 ingredients, aliases, risk data, advisor review queue, changelog | 8 | E2 |
| E5 · Consent and onboarding | Age gate, granular consent, skin basics, anonymous-to-account upgrade | 8 | E1 |
| E6 · Capture and quality gate | Camera, gallery fallback, on-device checks, upload, server verification | 8 | E1 |
| E7 · Skin analysis pipeline | Provider adapter, schema validation, post-processing, confidence, eval harness | 12 | E6 |
| E8 · Cream recommender | Eligibility, scoring, diversity, explanation templates, filters, detail page | 8 | E3, E7 |
| E9 · Ingredient scanner | OCR adapter, preprocessing, matching, verdict engine, findings UI | 12 | E4, E8 |
| E10 · Scent quiz | Six steps, persistence, editing, fallback priors | 6 | E5 |
| E11 · Perfume recommender | Candidate set, scoring, diversity, explanations, detail page | 10 | E3, E10 |
| E12 · Similar-to and pairing | Similarity scoring, price bands, pairing rules, clash warnings | 6 | E11 |
| E13 · Feedback loop | Ratings, dismiss reasons, affinity updates, decay job | 6 | E8, E11 |
| E14 · Privacy and settings | Export, deletion, consent withdrawal, install guidance | 6 | E5 |
| E15 · Analytics and flags | Tracking plan, client and server events, dashboards, alerts | 5 | E1 |
| E16 · PWA, a11y, performance | Service worker, offline shell, budgets, audits, fixes | 8 | E1 |
| E17 · Beta hardening | E2E suite, bug bash, load test, pen test remediation, catalogue top-up | 10 | All |
| E18 · Routine, tips, check-ins | Curated routine + tips content, check-in table, Home sections, offline queue | 4 | E5, E16 |

**Sequenced critical path:** E1 → E2 → E3/E4 → E5 → E6 → E7 → E8 → E9 → E10 → E11 → E12/E13 → E14/E15/E16 → E17.

**Parallel tracks:** E3/E4 (catalogue and knowledge base) can run from Week 2 with a second engineer; E15/E16 start at Week 6 once the first flows exist.

---

## 21. Risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation | Owner |
| --- | --- | --- | --- | --- | --- |
| R1 | Skin analysis inaccurate on dark skin tones | High | High | 50-image-per-band eval set, refusal over guessing, advisor sign-off, published model card, no recommendations below 0.55 confidence | ML lead |
| R2 | Photo quality in low light produces high retake rates | High | Medium | On-device gate with specific guidance before upload, flash hint, gallery fallback, retake-rate guardrail alert | Design |
| R3 | OCR misreads labels and produces a false `avoid` verdict | Medium | High | 60% match-rate floor, never `avoid` on a partial parse, unknown ingredients surfaced, "report" action on every verdict | ML lead |
| R4 | Privacy incident with skin images | Low | Severe | Private buckets, 24-hour default retention, signed URLs, pen test, encryption, data minimisation, incident runbook | Eng lead |
| R5 | Product data is wrong or stale (price, availability) | High | Medium | `verified_at` recency, "last checked" label, user reports, draft state excludes from recommendations | Product |
| R6 | Fragrance data licence not secured in time | Medium | High | Curated 250-perfume fallback, decision at Week 4, license cost pre-approved | Product |
| R7 | Users treat verdicts as medical advice | Medium | High | Persistent disclaimers, banned-language guardrails, referral to professionals, no diagnosis vocabulary | Legal |
| R8 | Low retention after first use | High | High | Rescan reminder on skin change, new-arrival alerts for saved families, week-2 personalisation prompt, profile-based discovery | Product |
| R9 | Perfume recommendations feel arbitrary | Medium | Medium | Similar-to anchoring, transparent reasons, thumbs feedback, diversity constraint, honest confidence language | Product |
| R10 | AI cost per user exceeds budget | Medium | Medium | 4-call session cap, caching, deterministic explanation fallback, cost alerts at 80% | Eng lead |
| R11 | Build slips past the 13-week launch plan | Medium | High | De-scope ladder in §6.4, two-week demos, features behind flags | Product |
| R12 | iOS PWA limitations block camera or install | Medium | Medium | File-input fallback, install guidance screen, test on real devices from Week 3 | Eng lead |
| R13 | Regulatory action over health data handling | Low | Severe | Explicit consent for sensitivities, DPO appointed, DPIA before EU exposure, deletion SLA enforced | Legal |
| R14 | Catalogue bias toward expensive global brands | High | Medium | Price-band coverage requirement, local Nigerian brand sourcing, availability filter default on | Product |

---

## 22. Decisions log

Every open question from v0.1 is resolved here. Each decision has an owner and a revisit trigger, so a reversal is a scheduled review rather than an argument.

| # | Question | Decision | Rationale | Revisit trigger | Owner |
| --- | --- | --- | --- | --- | --- |
| D1 | Which markets and currencies first? | Lagos, Nigeria; NGN only; `en-NG` | Highest density of target users in the founding team's network; local availability is the unmet need | After 5,000 MAU or 90 days, whichever is first | Product |
| D2 | How is local availability sourced? | Daily retailer feeds where licensed; otherwise manual curation with a 14-day `verified_at` freshness rule | Feeds are incomplete in Lagos; freshness labelling is honest | When 3 retailers provide stable APIs | Product |
| D3 | Business model? | Free at launch. Affiliate revenue from Phase 5. No subscription or paywall in v1 | A paywall on safety advice undermines trust and the privacy posture | If affiliate revenue is below ₦500k per month at 20,000 MAU | Product |
| D4 | Does perfume use skin analysis? | Only two skin-derived inputs: dryness influencing longevity guidance, and sensitivity/allergen cross-checks. Scent taste is never inferred from skin | Inferring taste from skin tone is pseudoscience and a reputational risk | Never; this is a principle | Product |
| D5 | Build or license the product and ingredient database? | Hybrid: license fragrance notes and accords; curate the ingredient knowledge base in-house with advisor review; brand-supplied data for INCI lists | Notes are expensive to compile; ingredient rulings need to be defensible and owned | If licence costs exceed ₦2m per year, switch to curated-only | Product |
| D6 | Is on-device image processing feasible? | Partial: on-device quality gating and skin segmentation; server-side tone and texture analysis | Keeps payloads small on 3G without taking on an unmaintainable mobile model pipeline | If inference latency drops below 1.5s on a mid-tier device, consider full on-device | Eng lead |
| D7 | Are there brand partnerships to pursue at launch? | Two or three Nigerian body-care brands for data and credibility; not a launch blocker | Data quality and local trust, not revenue | Phase 4 for paid partnerships | Product |
| D8 | Native apps or PWA? | PWA only for v1 | One codebase, no store review delays, installable | If camera constraints or retention justify native, re-evaluate in Phase 4 | Eng lead |
| D9 | Anonymous use or account required? | Anonymous first, account optional; anonymous sessions expire after 90 days with an upgrade prompt | Removes the biggest onboarding drop-off while preserving sync | If sync demand is high, prompt earlier | Product |
| D10 | Is the perfume scanner in MVP? | No, Phase 4 | Recognition accuracy for bottles is a separate, expensive problem | Phase 4 go/no-go | Product |
| D11 | How do we handle users under 16? | Blocked at the age gate; no processing beyond the gate answer | Simpler than verifiable parental consent and not core to the business | If a compliant parental-consent flow is built | Legal |
| D12 | What is the verdict vocabulary? | Exactly three: `good`, `okay`, `avoid`. No percentages on the verdict itself | Three is decision-useful; more invites over-reading | If user testing shows ambiguity, add a fourth only with evidence | Product |
| D13 | How do routines, tips, and progress work? | Curated static routine + reviewed tips; weekly self-reported check-ins, latest two + streak, no trend rendering; generic first, personalization gated on skin basics + one owned cream | Workout-planner model: log completion, defer measurement; photo checks blocked on 0003; see decision 0004 | If re-scan comparison ships, revisit trend ban (§6.4) | Product |

**Still open (do not block build):**

| # | Item | Owner | Needed by |
| --- | --- | --- | --- |
| O1 | Fragrance data licence signature and cost | Product | Week 4 |
| O2 | Sub-processor list and DPAs | Legal | Week 6 |
| O3 | Retailer feed terms for Lagos | Product | Week 8 |
| O4 | Brand partnership letters of intent | Product | Week 10 |
| O5 | Dermatology advisor contract | Product | Week 6 |

---

## 23. Appendix A: copy deck (core strings)

| Context | Copy |
| --- | --- |
| Welcome headline | "Skincare and scent that actually fits you." |
| Welcome subhead | "Photograph your skin, scan any label, and get recommendations with reasons you can check." |
| Camera rationale (pre-permission) | "We use your camera only to photograph your skin or a product label. Photos are deleted within 24 hours unless you ask us to keep them." |
| Capture guidance | "Find even, natural light. Hold your phone about 20 cm from your forearm. Avoid direct sunlight and shadows." |
| Analysis progress | "Checking lighting… Reading texture… Matching products…" |
| Low confidence | "This photo was hard to read. Better light would give a clearer result." |
| Verdict — good | "A good match for your skin." |
| Verdict — okay | "Workable, with a few things to watch." |
| Verdict — avoid | "Not a good match for you." |
| Perfume fallback | "We are showing what people in Lagos are wearing most. Take the 90-second quiz to personalise this." |
| Sensitivity warning | "This contains {ingredient}, which you asked us to avoid." |
| Disclosure limitation | "Many fragrances do not list their full composition, so we may miss an ingredient you react to." |
| Deletion confirmation | "Your account and personal data will be deleted. This cannot be undone after 7 days." |

---

## 24. Appendix B: glossary

| Term | Meaning |
| --- | --- |
| **Accord** | A blended fragrance impression (e.g. "ambery", "fresh spicy") built from multiple notes |
| **Comedogenic** | Likely to clog pores; rated 0–5 |
| **EDP / EDT / EDC** | Eau de parfum, toilette, cologne; increasing dilution from parfum |
| **Fitzpatrick scale** | Six-band classification of skin phototype; used here only to describe range and ensure coverage |
| **INCI** | International Nomenclature of Cosmetic Ingredients; the standard label naming |
| **ITA°** | Individual Typology Angle; an objective measure of skin pigmentation computed from colour |
| **Longevity / projection** | How long a fragrance lasts, and how far it travels from the skin |
| **Note pyramid** | Top, heart and base notes; the structure of a fragrance over time |
| **P0 / P1 / P2** | Must-have for launch / should-have / later |
| **Verdict** | `good`, `okay` or `avoid` for a product against a profile |

---

## 25. Appendix C: QA matrix

### C.1 Device and network

| Dimension | Values to test |
| --- | --- |
| Devices | iPhone SE (2020), iPhone 14, Pixel 6a, Samsung A14, low-RAM Android (2 GB), desktop |
| OS/browser | iOS 16.4, iOS 18, Android 10 Chrome, Android 14 Chrome, Safari desktop, Firefox |
| Network | 3G throttled, 4G, wifi, offline, flaky (20% packet loss) |
| Viewport | 320 px, 375 px, 414 px, 768 px, 1280 px |
| Text size | 100%, 150%, 200% |

### C.2 Image and content

| Dimension | Values to test |
| --- | --- |
| Fitzpatrick bands | I–VI, minimum 10 images per band in regression |
| Lighting | Daylight, tungsten, fluorescent, mixed, direct sun, very low light |
| Label conditions | Curved bottle, glare, creased label, small print, two columns, foreign language, handwritten |
| Skin conditions | Dry, flaky, oily, acne, eczema-like texture (cosmetic description only) |
| Edge cases | Non-skin photo, screenshot, cartoon, multiple people, filtered image, upside down, 1 px image, 50 MB file |
| Perfume data | Missing notes, conflicting notes, no accord data, no price |

### C.3 Functional regression (pre-release)

1. New user completes the full MVP promise on a throttled Pixel 6a.
2. Every required consent refused individually: app behaves as specified and does not process.
3. Analysis rejected on all eight gate failures with the correct copy.
4. Scan of a real label on a curved bottle returns a verdict with a source for each finding.
5. Severe sensitivity excludes the product from creams and warns on perfumes.
6. Export produces a complete, readable archive.
7. Delete account then re-register with the same email after the grace period.
8. Offline: app shell loads, cached results render, scan queues and submits on reconnect.

---

## 26. Appendix D: launch checklist

**Legal and privacy**
- [ ] Privacy policy, terms, and disclaimer live and linked from consent
- [ ] Policy version recorded in `consent_records`
- [ ] DPO named, `privacy@freshskin.app` monitored
- [ ] Sub-processor list published with DPAs signed
- [ ] DPIA completed for skin and sensitivity data
- [ ] Deletion and export tested end to end by a second person
- [ ] Age gate blocks under-16s

**Product and data**
- [ ] Catalogue meets minimum-viable targets and every product passes the data-confidence bar
- [ ] 200 most-impactful ingredients advisor-reviewed
- [ ] Price and availability freshness under 14 days
- [ ] All 14 functional requirements in §10 pass their acceptance criteria
- [ ] Disclaimers on consent, results, and verdicts

**Engineering**
- [ ] Performance budgets met on throttled 3G
- [ ] Accessibility audit clean
- [ ] Penetration test criticals and highs closed
- [ ] Backups and restore tested
- [ ] Alerts and dashboards live
- [ ] Incident runbook and on-call rota published

**AI quality**
- [ ] 300-image eval set complete, stratified across bands
- [ ] Tone accuracy ≥ 85%, no band below 75%
- [ ] Refusal correctness ≥ 98% on non-skin images
- [ ] OCR match-rate distribution reviewed; false-`avoid` rate < 2%
- [ ] Model card published internally with known limitations

**Growth and support**
- [ ] Store listing and PWA manifest assets
- [ ] Support inbox with a 24-hour response target
- [ ] Beta cohort recruited, 50 users in Lagos
- [ ] Launch announcement assets and creator briefs
- [ ] Analytics dashboards reviewed at 24 hours and 7 days post-launch

---

*End of document. Change proposals should be raised as a diff to this file with the section number and the decision they affect.*
