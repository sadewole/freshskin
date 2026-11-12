import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve } from 'node:path';
import { createAnonymousSession, resolveSession, revokeSession } from '../src/auth/session.js';
import { appPool, withUser } from '../src/db/client.js';
import { loadConsents, recordConsent, UnderageBlocked, type ConsentKind } from '../src/consent/consent.js';
import { presentPairing, presentSimilar } from '../src/http/present-discovery.js';
import { presentAnalysis } from '../src/http/present-analysis.js';
import { presentSaved } from '../src/http/present-saved.js';
import { presentScan } from '../src/http/present-scan.js';
import { present, type WireResponse } from '../src/http/present.js';
import { loadFragranceProfile, saveFragranceProfile } from '../src/rec/fragrance-profile.js';
import { recordFeedback, type FeedbackAction, type DismissReasonCode } from '../src/rec/store.js';
import type { RecommendationRequest } from '../src/rec/types.js';
import { listSaved, removeItem, saveItem, type SavedList } from '../src/saved/items.js';
import { completeScanFromText, getScan, submitScan } from '../src/scans/service.js';
import { recommendCreamsFor } from '../src/service/recommend-creams.js';
import { recommendPairings, recommendSimilar } from '../src/service/discovery.js';
import { recommendPerfumesFor } from '../src/service/recommend-perfumes.js';
import {
  completeAnalysis,
  getAnalysis,
  listAnalyses,
  submitAnalysis,
} from '../src/skin/service.js';
import {
  assertSameOrigin,
  clearSessionCookie,
  HttpError,
  MAX_BODY_BYTES,
  parseCookies,
  readJson,
  secureCookieFlag,
  sendError,
  sendJson,
  sessionCookie,
} from './http.js';
import { clientKey, RateLimiter } from './rate-limit.js';

/**
 * A framework-free PWA shell over the service layer.
 *
 * The PRD specifies Next.js. This environment's Node cannot dlopen native binaries, and Next's
 * SWC compiler is one, so a Next app could not be built or verified here. See
 * docs/decisions/0001-app-shell.md. The routes below are the port target: they are thin, they
 * own no policy, and every one of them calls a service function.
 */

const PUBLIC_DIR = resolve(process.cwd(), 'app', 'public');
const SESSION_COOKIE = 'fs_session';
const SESSION_MAX_AGE = 90 * 24 * 60 * 60;
const DEV_ENDPOINTS = process.env.ALLOW_DEV_ENDPOINTS === '1';

const limiter = new RateLimiter(240);

interface Ctx {
  readonly req: IncomingMessage;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly body: unknown;
  readonly userId: string | null;
  readonly requestId: string;
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

interface Route {
  readonly method: string;
  readonly path: readonly string[];
  readonly devOnly?: boolean;
  readonly handler: (ctx: Ctx) => Promise<Reply>;
}

const ok = (body: unknown, status = 200): Reply => ({ status, body });
const noContent = (): Reply => ({ status: 204, body: null });

function requireUser(ctx: Ctx): string {
  if (ctx.userId === null) throw new HttpError(401, 'UNAUTHENTICATED', 'Start a session first');
  return ctx.userId;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new HttpError(400, 'INVALID_BODY', 'Expected a JSON object');
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, 'INVALID_BODY', `${field} must be a non-empty string`);
  }
  return value;
}

function asOptionalInt(value: string | null, field: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new HttpError(400, 'INVALID_QUERY', `${field} must be a non-negative integer`);
  }
  return parsed;
}

function asOptionalBool(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return value === '1' || value === 'true';
}

const CONSENT_KINDS: readonly ConsentKind[] = [
  'terms',
  'privacy',
  'image_processing',
  'model_training',
  'marketing',
];

const FAMILIES = ['Floral', 'Woody', 'Citrus', 'Oriental', 'Fresh', 'Gourmand'];
const CONCERNS = ['dryness', 'flakiness', 'uneven_tone', 'body_acne', 'sensitivity', 'texture'];
const OCCASIONS = ['daily', 'office', 'evening', 'event'];

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const routes: Route[] = [
  {
    method: 'POST',
    path: ['api', 'v1', 'auth', 'anonymous'],
    handler: async () => {
      const { token, userId } = await createAnonymousSession();
      return {
        status: 201,
        body: { data: { user_id: userId } },
        headers: { 'set-cookie': sessionCookie(token, SESSION_MAX_AGE) + secureCookieFlag() },
      };
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'auth', 'logout'],
    handler: async (ctx) => {
      const token = parseCookies(ctx.req.headers.cookie)[SESSION_COOKIE];
      if (token !== undefined) await revokeSession(token);
      return {
        status: 204,
        body: null,
        headers: { 'set-cookie': clearSessionCookie() + secureCookieFlag() },
      };
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'me'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const consents = await loadConsents(userId);
      const quiz = await withUser(userId, (client) => loadFragranceProfile(client, userId));
      return ok({
        data: { user_id: userId, consents, has_fragrance_profile: quiz !== null },
        meta: { request_id: ctx.requestId },
      });
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'consents'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const kind = asString(body.kind, 'kind') as ConsentKind;
      if (!CONSENT_KINDS.includes(kind)) throw new HttpError(400, 'INVALID_BODY', 'unknown consent kind');
      if (typeof body.granted !== 'boolean') throw new HttpError(400, 'INVALID_BODY', 'granted must be a boolean');
      const policyVersion = typeof body.policy_version === 'string' ? body.policy_version : '2026-11-01';

      try {
        await recordConsent(userId, kind, body.granted, policyVersion);
      } catch (error) {
        if (error instanceof UnderageBlocked) {
          throw new HttpError(403, 'UNDERAGE_BLOCKED', 'Users under 16 cannot consent to processing');
        }
        throw error;
      }
      return noContent();
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'fragrance-profile'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const profile = await withUser(userId, (client) => loadFragranceProfile(client, userId));
      return ok({ data: profile, meta: { request_id: ctx.requestId } });
    },
  },
  {
    method: 'PUT',
    path: ['api', 'v1', 'fragrance-profile'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const strings = (value: unknown): string[] =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

      await withUser(userId, (client) =>
        saveFragranceProfile(client, userId, {
          familiesLiked: strings(body.families_liked),
          familiesDisliked: strings(body.families_disliked),
          notesLoved: strings(body.notes_loved),
          notesAvoided: strings(body.notes_avoided),
          strength: (typeof body.strength === 'string' ? body.strength : 'moderate') as
            | 'light'
            | 'moderate'
            | 'strong'
            | 'very_strong',
          occasions: strings(body.occasions),
          budgetMaxNgn: typeof body.budget_max_ngn === 'number' ? body.budget_max_ngn : null,
          quizVersion: 'quiz-1',
        }),
      );
      return noContent();
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'recommendations', 'creams'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const request: RecommendationRequest = {
        kind: 'cream',
        limit: asOptionalInt(ctx.url.searchParams.get('limit'), 'limit') ?? 10,
        narrowing: {
          ...(asOptionalInt(ctx.url.searchParams.get('max_price'), 'max_price') === undefined
            ? {}
            : { maxPriceNgn: asOptionalInt(ctx.url.searchParams.get('max_price'), 'max_price') }),
          ...(asOptionalBool(ctx.url.searchParams.get('fragrance_free')) === true
            ? { fragranceFree: true }
            : {}),
        },
      };
      const response: WireResponse = await recommendCreamsFor(userId, request, {
        requestId: ctx.requestId,
        day: new Date().toISOString().slice(0, 10),
      });
      return ok(response);
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'recommendations', 'perfumes'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const request: RecommendationRequest = {
        kind: 'perfume',
        limit: asOptionalInt(ctx.url.searchParams.get('limit'), 'limit') ?? 10,
        narrowing: {},
      };
      return ok(
        await recommendPerfumesFor(userId, request, {
          requestId: ctx.requestId,
          day: new Date().toISOString().slice(0, 10),
        }),
      );
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'recommendations', 'similar'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const productId = ctx.url.searchParams.get('product_id');
      if (productId === null) throw new HttpError(400, 'INVALID_QUERY', 'product_id is required');

      const response = await recommendSimilar(userId, productId, {
        cheaperOnly: asOptionalBool(ctx.url.searchParams.get('cheaper_only')) === true,
        limit: asOptionalInt(ctx.url.searchParams.get('limit'), 'limit') ?? 8,
      });
      if (response === null) throw new HttpError(404, 'NOT_FOUND', 'No fragrance notes for that product');
      return ok(presentSimilar(response, { requestId: ctx.requestId }));
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'recommendations', 'pairings'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const perfumeId = ctx.url.searchParams.get('perfume_id') ?? undefined;
      const response = await recommendPairings(userId, perfumeId);
      if (response === null) throw new HttpError(404, 'NOT_FOUND', 'No perfume available to pair');
      return ok(presentPairing(response, { requestId: ctx.requestId }));
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'feedback'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const input = {
        recommendationId: asString(body.recommendation_id, 'recommendation_id'),
        action: asString(body.action, 'action') as FeedbackAction,
        ...(typeof body.rating === 'number' ? { rating: body.rating } : {}),
        ...(typeof body.dismiss_reason === 'string'
          ? { dismissReason: body.dismiss_reason as DismissReasonCode }
          : {}),
      };

      const outcome = await withUser(userId, (client) => recordFeedback(client, userId, input));
      if (!outcome.ok) {
        throw outcome.reason === 'invalid_rating'
          ? new HttpError(400, 'INVALID_RATING', 'rating must be between 1 and 5')
          : new HttpError(404, 'NOT_FOUND', 'No such recommendation');
      }
      return noContent();
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'saved-items'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      return ok(presentSaved(await listSaved(userId), { requestId: ctx.requestId }));
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'saved-items'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const list = (typeof body.list === 'string' ? body.list : 'wishlist') as SavedList;
      await saveItem(userId, asString(body.product_id, 'product_id'), list);
      return noContent();
    },
  },
  {
    method: 'DELETE',
    path: ['api', 'v1', 'saved-items'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const productId = ctx.url.searchParams.get('product_id');
      const list = (ctx.url.searchParams.get('list') ?? 'wishlist') as SavedList;
      if (productId === null) throw new HttpError(400, 'INVALID_QUERY', 'product_id is required');
      await removeItem(userId, productId, list);
      return noContent();
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'scans'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const kind = body.kind === 'bottle' ? 'bottle' : 'ingredient_label';
      const imageKey = typeof body.image_key === 'string' ? body.image_key : null;
      return ok(await submitScan(userId, { kind, imageKey }), 201);
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'scans'],
    handler: async (ctx) => {
      requireUser(ctx);
      throw new HttpError(501, 'NOT_IMPLEMENTED', 'Scan history is not exposed yet');
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'scans', ':id'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const scan = await getScan(userId, ctx.params.id ?? '');
      if (scan === null) throw new HttpError(404, 'NOT_FOUND', 'No such scan');
      return ok({
        data: {
          id: scan.id,
          kind: scan.kind,
          status: scan.status,
          verdict: scan.verdict,
          match_rate: scan.matchRate,
          matched_count: scan.matchedCount,
          created_at: scan.createdAt.toISOString(),
        },
        meta: { request_id: ctx.requestId },
      });
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'skin-analyses'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const capture = asRecord(body.capture ?? { brightness: 140, glareFraction: 0, blurScore: 300 });
      return ok(
        await submitAnalysis(userId, {
          imageKey: typeof body.image_key === 'string' ? body.image_key : null,
          captureMeta: {
            brightness: Number(capture.brightness ?? 140),
            glareFraction: Number(capture.glareFraction ?? 0),
            blurScore: Number(capture.blurScore ?? 300),
          },
        }),
        201,
      );
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'skin-analyses'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const analyses = await listAnalyses(userId);
      return ok({
        data: analyses.map((analysis) => presentAnalysis(analysis, { requestId: ctx.requestId }).data),
        meta: { request_id: ctx.requestId },
      });
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'skin-analyses', ':id'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const analysis = await getAnalysis(userId, ctx.params.id ?? '');
      if (analysis === null) throw new HttpError(404, 'NOT_FOUND', 'No such analysis');
      return ok(presentAnalysis(analysis, { requestId: ctx.requestId }));
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'products', ':id'],
    handler: async (ctx) => {
      requireUser(ctx);
      const { rows } = await appPool.query(
        `SELECT id, name, slug, brand_name, category, status, richness, fragrance_free, price_ngn, availability, data_confidence
           FROM v_product_browse WHERE id = $1`,
        [ctx.params.id],
      );
      const product = rows[0];
      if (product === undefined) throw new HttpError(404, 'NOT_FOUND', 'No such product');
      return ok({ data: product, meta: { request_id: ctx.requestId } });
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'meta'],
    handler: async (ctx) =>
      ok({
        data: { families: FAMILIES, concerns: CONCERNS, occasions: OCCASIONS, consent_kinds: CONSENT_KINDS },
        meta: { request_id: ctx.requestId },
      }),
  },
  // -------------------------------------------------------------------------
  // Development-only completions. The real worker owns these transitions; these
  // exist so the shell is usable before the OCR and vision ports land.
  // -------------------------------------------------------------------------
  {
    method: 'POST',
    path: ['api', 'v1', 'dev', 'scans', ':id', 'complete'],
    devOnly: true,
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const rawText = asString(body.raw_text, 'raw_text');
      const subject = asRecord(body.subject ?? {});

      const result = await completeScanFromText(userId, ctx.params.id ?? '', rawText, {
        concerns: Array.isArray(subject.concerns) ? subject.concerns.map(String) : [],
        collisions: [],
        highIrritantCount: Number(subject.high_irritant_count ?? 0),
        comedogenicHits: Number(subject.comedogenic_hits ?? 0),
        fragranceAllergen: subject.fragrance_allergen === true,
        beneficialCount: Number(subject.beneficial_count ?? 0),
      });
      return ok(presentScan(result, { requestId: ctx.requestId }));
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'dev', 'skin-analyses', ':id', 'complete'],
    devOnly: true,
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = asRecord(ctx.body);
      const capture = asRecord(body.capture ?? { brightness: 140, glareFraction: 0, blurScore: 300 });
      await completeAnalysis(userId, ctx.params.id ?? '', body.analysis, {
        brightness: Number(capture.brightness ?? 140),
        glareFraction: Number(capture.glareFraction ?? 0),
        blurScore: Number(capture.blurScore ?? 300),
      });
      const analysis = await getAnalysis(userId, ctx.params.id ?? '');
      if (analysis === null) throw new HttpError(404, 'NOT_FOUND', 'No such analysis');
      return ok(presentAnalysis(analysis, { requestId: ctx.requestId }));
    },
  },
];

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Assets are served from the Vite build (`pnpm web:build`), which writes into `app/public`.
 * Hashed filenames may be cached forever; the three files whose names are fixed must not be,
 * or a new deploy ships a shell that keeps pointing at the old bundle.
 */
const UNCACHED = new Set(['.html', '.webmanifest']);

function cacheControl(pathname: string): string {
  if (UNCACHED.has(extname(pathname)) || pathname === '/sw.js') return 'no-cache';
  return 'public, max-age=31536000, immutable';
}

async function serveStatic(pathname: string): Promise<{ body: Buffer; type: string } | null> {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = resolve(PUBLIC_DIR, relative);
  if (!target.startsWith(PUBLIC_DIR)) return null;

  try {
    const body = await readFile(target);
    return { body, type: MIME[extname(target)] ?? 'application/octet-stream' };
  } catch {
    if (extname(target) !== '') return null;
    try {
      return { body: await readFile(resolve(PUBLIC_DIR, 'index.html')), type: MIME['.html'] ?? 'text/html' };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Matching and dispatch
// ---------------------------------------------------------------------------

function match(route: Route, segments: string[]): Record<string, string> | null {
  if (route.path.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < route.path.length; index += 1) {
    const expected = route.path[index];
    const actual = segments[index];
    if (expected === undefined || actual === undefined) return null;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = randomUUID();
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0);
  const isApi = segments[0] === 'api';

  try {
    if (isApi) {
      const wait = limiter.take(clientKey(req.headers['x-forwarded-for'] as string | undefined, req.socket.remoteAddress));
      if (wait > 0) {
        res.setHeader('retry-after', String(wait));
        throw new HttpError(429, 'RATE_LIMITED', 'Too many requests', true);
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);

    const candidate = routes.find((route) => route.method === req.method && match(route, segments) !== null);

    if (candidate !== undefined) {
      if (candidate.devOnly === true && !DEV_ENDPOINTS) {
        throw new HttpError(404, 'NOT_FOUND', 'Not found');
      }

      const params = match(candidate, segments) ?? {};
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readJson(req);
      const cookieToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      const userId = cookieToken === undefined ? null : await resolveSession(cookieToken);

      const reply = await candidate.handler({ req, url, params, body, userId, requestId });
      for (const [key, value] of Object.entries(reply.headers ?? {})) res.setHeader(key, value);
      if (reply.status === 204) {
        res.writeHead(204, { 'cache-control': 'no-store' });
        res.end();
      } else {
        sendJson(res, reply.status, reply.body);
      }
      return;
    }

    if (isApi) {
      throw new HttpError(404, 'NOT_FOUND', 'No such endpoint');
    }

    const asset = await serveStatic(url.pathname);
    if (asset === null) {
      throw new HttpError(404, 'NOT_FOUND', 'Not found');
    }

    res.writeHead(200, {
      'content-type': asset.type,
      'content-length': asset.body.length,
      'cache-control': cacheControl(url.pathname),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'content-security-policy': CSP,
    });
    res.end(asset.body);
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(res, error, requestId);
    } else {
      // Log the shape, never the payload: request bodies can contain free-text health data.
      console.error(JSON.stringify({ request_id: requestId, error: (error as Error).message }));
      sendError(res, new HttpError(500, 'INTERNAL_ERROR', 'Something went wrong', true), requestId);
    }
  } finally {
    console.log(
      JSON.stringify({
        request_id: requestId,
        method: req.method,
        path: url.pathname,
        status: res.statusCode,
        duration_ms: Date.now() - started,
      }),
    );
  }
}

export function createApp() {
  return createServer((req, res) => {
    void handle(req, res);
  });
}

const isMain = process.argv[1]?.endsWith('server.js') === true;
if (isMain) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createApp();
  server.listen(port, () => {
    console.log(JSON.stringify({ event: 'listening', port, dev_endpoints: DEV_ENDPOINTS }));
  });
}

export { MAX_BODY_BYTES };
