import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { resolveSession } from '../src/auth/session.js';
import {
  assertSameOrigin,
  HttpError,
  MAX_BODY_BYTES,
  parseCookies,
  readJson,
  sendError,
  sendJson,
} from './http.js';
import { clientKey, RateLimiter } from './rate-limit.js';
import { routes } from './routes/index.js';
import type { Route } from './routes/types.js';
import { SESSION_COOKIE } from './session.js';

/**
 * A framework-free PWA shell over the service layer.
 *
 * The PRD specifies Next.js. This environment's Node cannot dlopen native binaries, and Next's
 * SWC compiler is one, so a Next app could not be built or verified here. See
 * docs/decisions/0001-app-shell.md. The routes in `app/routes/` are the port target: they are
 * thin, they own no policy, and every one of them calls a service function.
 */

const PUBLIC_DIR = resolve(process.cwd(), 'app', 'public');
const DEV_ENDPOINTS = process.env.ALLOW_DEV_ENDPOINTS === '1';

const limiter = new RateLimiter(240);

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
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) return null;

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
