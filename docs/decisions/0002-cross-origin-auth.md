# 0002 — Cross-origin auth: keep the host-only api cookie

**Status:** accepted · **Date:** 2026-11-14
**Context:** origin split (`docs/design/ui-workflow.md` §7): `app.freshskin.com` + `api.freshskin.com`.
**Replaces:** open question §7.4; partially supersedes 0001's same-origin serving model.

## Decision

Keep the session cookie **host-only on the api origin** (`api.freshskin.com`), `HttpOnly`,
`Secure` (production), `SameSite=Lax`, `Path=/`, no `Domain` attribute. No bearer tokens,
no app-origin proxy.

## Why this wins

- **Same-site is enough.** `app.` and `api.` share eTLD+1, so `SameSite=Lax` permits the
  cookie on `fetch` from the app to the api with `credentials: 'include'`. Nothing about the
  `sessionCookie()` / `createAnonymousSession` / `resolveSession` core has to change.
- **Smallest exposure.** A parent-domain cookie (`Domain=.freshskin.com`) would also ride
  along to the marketing origin's CDN logs. Host-only on `api.` keeps the session where it
  is used — stricter than the PRD text, which assumed the cookie lived on the app origin.
- **XSS posture unchanged.** The token stays HttpOnly; client JS never holds it. A bearer
  token in `localStorage` (or memory-only, which would kill the 90-day session on reload)
  is strictly worse and a larger client change.
- **No proxy coupling.** An app-origin `/api` proxy would preserve same-origin trivially
  but re-couples the deploys §15.1 split apart. Kept as fallback only.

## Required changes (api + web lanes)

1. `apps/web`: `BASE` → `VITE_API_BASE_URL` env; `credentials: 'same-origin'` → `'include'`.
2. `apps/api`: replace `assertSameOrigin` host-equality with an explicit `APP_ORIGIN`
   allowlist; handle `OPTIONS` preflight (currently 404s); emit
   `Access-Control-Allow-Origin: <app origin>` + `Allow-Credentials: true` + `Vary: Origin`
   on **every** API response including errors and 429s (single choke point in `handle()`).
   Missing `Origin` (curl, health checks) stays allowed.
3. CSP `connect-src` gains the api origin (api lane); fonts stay self-hosted woff2
   (Phase 0 open item, web lane).
4. iOS PWA separate-jar re-login (§15.4) is unchanged by this decision; OTP (not yet built)
   is the mitigation, already recorded.

## Rejected

- **Parent-domain cookie** — works, but widens session scope to the marketing origin
  for no functional gain.
- **Bearer token** — downgrades XSS posture, bigger client change, breaks silent 90-day
  sessions unless persisted in JS-readable storage.
- **App-origin proxy** — contradicts the §15.1 split rationale; fallback if CORS proves
  unworkable in some target browser.
