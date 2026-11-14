# 0003 — Photo upload: direct-to-storage via short-lived signed URL (PROPOSAL)

- **Status:** proposal (one writer at a time — claim before implementing)
- **Date:** 2026-11-14
- **Context:** Phase 2 web slice ships the capture experience (camera + on-device quality gate,
  `apps/web/src/scan/`); the photo stays on the phone because the API has no upload endpoint
  and no OCR worker. PRD §12.4 mandates: images go directly to object storage via short-lived
  signed URL, never proxied through the API.

## Decision

Add a two-step photo handoff, owned by the API lane, contract-first through `packages/contracts`:

1. `POST /api/v1/scans/:id/photo-url` — authenticated, `image_processing` consent required.
   Server creates the opaque object key (`images/scans/<scan-uuid>.jpg`), records it on the
   scan row (`image_key`, still `status='queued'`), and returns `{ upload_url, expires_in }`.
   URL expiry ≤ 5 minutes; one URL per scan (re-request overwrites the key).
2. Client `PUT`s the already-downscaled JPEG from `apps/web/src/scan/capture.ts` straight to
   storage — the API never sees the bytes.
3. The OCR worker (separate decision/proposal) picks up `queued` scans with a non-null
   `image_key`, re-verifies the §13.2 gate server-side by magic bytes + decode, runs §13.4,
   and lands `complete` / `low_confidence` through the existing guarded `finalize`.
   The web polls the existing `GET /api/v1/scans/:id` (needs `image status` surfaced — contract
   addition, not a new endpoint).

## Why this shape wins

- **The API never proxies binary.** `MAX_BODY_BYTES` is 64 KiB and `readJson` is the only
  body reader — a photo would not fit the request path even if policy allowed it. A signed
  URL keeps the Node process out of the hot path entirely, which is also the 3G-friendly
  choice: the upload is one hop, resumable by the storage provider, not chained through us.
- **Consent and lifecycle stay where they already are.** `submitScan` already requires
  `IMAGE_CONSENT` and already writes `image_key`; the 24h purge (`retention/purge.ts`) already
  nulls it. The upload step adds no new policy surface — it only fills in the key the schema
  anticipated (`apps/api/db/migrations/0006_scans.sql`: `image_key text`, nullable by design).
- **Object keys stay opaque UUIDs.** No user id, no timestamp, no guessable sequence in the
  key — the row join is server-side only. Signed GETs expire in 5 minutes; the bucket stays
  private (PRD §12.4 verbatim).
- **Cost ceiling is enforceable at issuance, not at upload.** The ₦25/scan budget (§13.6)
  binds the OCR call, not the bytes — so rate-limiting the `photo-url` endpoint bounds spend
  without inspecting traffic. Proposed: 10 issuances / user / hour (above any human retake
  pattern — S5 allows 3 retakes — far below abuse scale), counted per user, not per IP
  (the shared `RateLimiter` is per-IP; this one keys on `userId` like the consent writes do).
  The existing 240/min global limiter stays as the outer bound.

## Security notes (explicit, because this is the first endpoint that touches user bytes)

- **Server validates what storage accepted.** On worker pickup: magic-byte check, decode,
  hard reject > 10 MB, re-encode to strip embedded metadata before any model call. The
  client's `processFrame` output is an assertion, not a guarantee — the server gate (§13.2)
  re-runs and rejects with the same specific codes.
- **Content binding.** `photo-url` issues with `content-type: image/jpeg` + `content-length`
  range conditions baked into the signature, so a signed URL cannot be repurposed to store
  (or serve) arbitrary content. No `GET` is ever signed for the client — the app shows its
  own local preview (already CSP-safe as `data:`), never a storage URL.
- **Consent withdrawal races an in-flight upload.** If `image_processing` is revoked while
  bytes are in flight, the worker's `requireConsent` re-check fails the scan closed and the
  purge path nulls the key. A stored object with no live row is orphaned-but-inert inside a
  private bucket and dies at the 24h sweep; no new deletion path is needed.
- **No new cookie, CORS, or CSP surface.** `photo-url` is JSON in/out on the api origin —
  covered by decision 0002. The `PUT` goes to the storage host, not through `fetch` to our
  API: no `connect-src` change, no credentialed cross-origin request, no session cookie
  leaves our origins. (When the storage host is chosen, its CORS rule must allow `PUT` from
  `app.freshskin.com` with `content-type: image/jpeg` only — an infra ticket, not a code one.)

## Performance notes (3G is the design target)

- **Bytes are already bounded client-side:** 1600px long-edge JPEG @ 0.85 from `capture.ts`
  is a few hundred KB — the 10 MB server cap is abuse protection, not a working size.
- **No polling storm:** the web polls `GET /scans/:id` at 1s then backs off (PRD §13.6
  pattern), and stops at a terminal status. The OCR timeout (15s, §13.6) bounds the worst case.
- **No per-user response caching anywhere** (AGENTS.md, Phase 4 rule) — the scan response is
  never precached by Workbox; only the shell is.
- **Provider choice is deferred but constrained:** any S3-compatible store with presigned-PUT
  + content conditions works (R2/Tigris/S3). Keep the signing behind a provider interface in
  `apps/api/src/scans/` next to the `analyzeSkin`/`readLabel` pattern (§13.1), so the vendor
  swaps without touching routes.

## Required changes (api lane owns; shared is proposal-only)

1. `packages/contracts`: `RequestPhotoUpload` (`{ scan_id }` path param, no body),
   `PhotoUploadResponse` (`{ data: { upload_url, expires_in } }`), plus `status` detail on
   the scan GET (`image_received: boolean`) so the web can show "sent, reading…" vs "sending…".
2. `apps/api`: `POST /scans/:id/photo-url` route (auth + consent + per-user rate limit +
   ownership check `WHERE id AND user_id`), storage signing module behind a provider
   interface, worker pickup on `queued + image_key IS NOT NULL`.
3. `apps/web` (follow-up, small): `PUT` the processed JPEG to `upload_url` after
   `LabelCapture` review; poll `GET /scans/:id` to the terminal state. No capture UI changes.
4. Infra ticket (not code): bucket + CORS (`PUT` from `app.freshskin.com`, jpeg only) +
   lifecycle rule as backstop to the in-app purge.

## Rejected

- **Multipart POST through the API** — breaks the 64 KiB body path, puts binary through the
  Node process, contradicts the PRD's explicit "API never proxies the binary".
- **Base64-in-JSON** — ~33% overhead on a 3G link, same body-limit problem, and the bytes
  would transit our process anyway.
- **Client-chosen object keys** — lets a client overwrite another scan's bytes or enumerate
  keys; server-minted UUIDs cost nothing.
- **Long-lived upload URLs** — a leaked URL becomes an anonymous dropbox; 5-minute expiry
  bounds the window to the single upload it was minted for.

## Open questions for the API lane

1. Storage vendor (R2 vs Tigris vs S3) — costed against ₦25/scan and NG egress.
2. OCR vendor + fallback pair (§13.4 step 2–3, §13.6 circuit breaker) — the worker proposal.
3. Whether `photo-url` re-issuance should invalidate the previous key server-side
   (delete-on-reissue) or let last-write-win at the single key.
