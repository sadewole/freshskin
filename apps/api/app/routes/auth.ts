import { createAnonymousSession, revokeSession } from '../../src/auth/session.js';
import { loadConsents } from '../../src/consent/consent.js';
import { withUser } from '../../src/db/client.js';
import { loadFragranceProfile } from '../../src/rec/fragrance-profile.js';
import {
  clearSessionCookie,
  parseCookies,
  secureCookieFlag,
  sessionCookie,
} from '../http.js';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '../session.js';
import { ok, requireUser, type Route } from './types.js';

export const authRoutes: readonly Route[] = [
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
];
