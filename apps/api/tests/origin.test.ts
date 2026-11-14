import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { assertAllowedOrigin, isSameOrigin } from '../app/http.js';
import { HttpError } from '../app/http.js';

/**
 * Decision 0002's allowlist must not lock out local development: through the Vite proxy the
 * browser's `Origin` (localhost:5173) matches the forwarded `Host`, which is same-origin
 * and stays allowed even with `APP_ORIGIN` unset. A genuinely foreign origin still fails
 * closed — an unset allowlist is not an open one.
 */

const req = (headers: Record<string, string | undefined>): IncomingMessage =>
  ({ headers }) as unknown as IncomingMessage;

const isBadOrigin = (error: unknown): boolean =>
  error instanceof HttpError && error.code === 'BAD_ORIGIN';

afterEach(() => {
  delete process.env.APP_ORIGIN;
});

describe('assertAllowedOrigin', () => {
  it('allows requests with no Origin (curl, health checks, same-origin navigations)', () => {
    assert.doesNotThrow(() => assertAllowedOrigin(req({})));
  });

  it('allows the configured app origin', () => {
    process.env.APP_ORIGIN = 'https://app.freshskin.com';
    assert.doesNotThrow(() =>
      assertAllowedOrigin(
        req({ origin: 'https://app.freshskin.com', host: 'api.freshskin.com' }),
      ),
    );
  });

  it('refuses a foreign origin when the allowlist is set', () => {
    process.env.APP_ORIGIN = 'https://app.freshskin.com';
    assert.throws(
      () => assertAllowedOrigin(req({ origin: 'https://evil.test', host: 'api.freshskin.com' })),
      isBadOrigin,
    );
  });

  it('allows same-origin requests when APP_ORIGIN is unset (dev proxy)', () => {
    assert.doesNotThrow(() =>
      assertAllowedOrigin(req({ origin: 'http://localhost:5173', host: 'localhost:5173' })),
    );
  });

  it('still refuses cross-origin requests when APP_ORIGIN is unset', () => {
    assert.throws(
      () =>
        assertAllowedOrigin(
          req({ origin: 'http://localhost:5173', host: '127.0.0.1:3000' }),
        ),
      isBadOrigin,
    );
  });

  it('treats a malformed origin as foreign, never as same-origin', () => {
    assert.equal(isSameOrigin(req({ origin: 'not-a-url', host: 'not-a-url' })), false);
    assert.throws(() => assertAllowedOrigin(req({ origin: 'not-a-url', host: 'x.test' })), isBadOrigin);
  });
});
