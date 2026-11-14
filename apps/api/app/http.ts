import type { IncomingMessage, ServerResponse } from 'node:http';

/** Small HTTP primitives. No framework: one dependency fewer is one fewer thing to trust. */

export const MAX_BODY_BYTES = 64 * 1024;

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

export function sendError(res: ServerResponse, error: HttpError, requestId: string): void {
  sendJson(res, error.status, {
    error: { code: error.code, message: error.message, retryable: error.retryable },
    meta: { request_id: requestId },
  });
}

/** Rejects oversized bodies before buffering them. */
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const declared = Number(req.headers['content-length'] ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    chunks.push(chunk as Buffer);
  }

  // A POST with no body is a valid request (session start, logout). Only a request that
  // actually carries bytes must declare a JSON content type.
  if (total === 0) return {};

  const contentType = req.headers['content-type'] ?? '';
  if (!String(contentType).toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (header === undefined) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key.length > 0) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  return [
    `fs_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

export function clearSessionCookie(): string {
  return 'fs_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

/** @deprecated Use {@link assertAllowedOrigin} (decision 0002). Kept for reference only. */

export function secureCookieFlag(): string {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

/**
 * Cross-origin policy (decision 0002). The app origin (`APP_ORIGIN`,
 * e.g. `https://app.freshskin.com`) may call the API with credentials.
 * Same-site `SameSite=Lax` permits the host-only api cookie on those
 * fetches, so no `Domain` attribute and no bearer tokens.
 *
 * Missing `Origin` (curl, health checks, same-origin navigations) stays allowed.
 */
export function appOrigin(): string | null {
  const value = (process.env.APP_ORIGIN ?? '').trim().replace(/\/+$/, '');
  return value.length === 0 ? null : value;
}

export function corsHeaders(req: IncomingMessage): Record<string, string> {
  const allowed = appOrigin();
  const origin = req.headers.origin;
  if (allowed === null || origin === undefined || origin !== allowed) return {};
  return {
    'access-control-allow-origin': allowed,
    vary: 'Origin',
    'access-control-allow-credentials': 'true',
  };
}

/**
 * Replaces host-equality with the explicit allowlist. A browser sends `Origin` on
 * cross-origin writes; a foreign `Origin` (or a malformed one) is refused. Requests with
 * no `Origin` predate CORS and are not cross-origin writes. When `APP_ORIGIN` is unset
 * (local dev through the Vite proxy, or the transitional same-origin serving), an `Origin`
 * that matches the request's own `Host` is same-origin and stays allowed.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (origin === undefined || host === undefined) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function assertAllowedOrigin(req: IncomingMessage): void {
  const origin = req.headers.origin;
  if (origin === undefined) return;
  const allowed = appOrigin();
  if (allowed !== null && origin === allowed) return;
  if (isSameOrigin(req)) return;
  throw new HttpError(403, 'BAD_ORIGIN', 'Cross-origin request refused');
}
