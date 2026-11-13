import { recordConsent, UnderageBlocked } from '../../src/consent/consent.js';
import { HttpError } from '../http.js';
import { noContent, requireUser, type Route } from './types.js';
import { consentBodySchema, parseBody } from './validation.js';

export const consentRoutes: readonly Route[] = [
  {
    method: 'POST',
    path: ['api', 'v1', 'consents'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = parseBody(consentBodySchema, ctx.body);

      try {
        await recordConsent(userId, body.kind, body.granted, body.policy_version ?? '2026-11-01');
      } catch (error) {
        if (error instanceof UnderageBlocked) {
          throw new HttpError(403, 'UNDERAGE_BLOCKED', 'Users under 16 cannot consent to processing');
        }
        throw error;
      }
      return noContent();
    },
  },
];
