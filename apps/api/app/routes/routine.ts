import { presentCheckIns, presentRoutine } from '../../src/http/present-routine.js';
import {
  deleteCheckInFor,
  getCheckInsFor,
  getRoutineFor,
  recordCheckInFor,
} from '../../src/routine/service.js';
import { HttpError } from '../http.js';
import { noContent, ok, requireUser, type Route } from './types.js';
import { checkInBodySchema, parseBody } from './validation.js';

export const routineRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: ['api', 'v1', 'routine'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const content = await getRoutineFor(userId);
      if (content === null) throw new HttpError(404, 'NOT_FOUND', 'No routine available');
      return ok(presentRoutine(content, { requestId: ctx.requestId }));
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'check-ins'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      return ok(presentCheckIns(await getCheckInsFor(userId), { requestId: ctx.requestId }));
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'check-ins'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = parseBody(checkInBodySchema, ctx.body);
      const summary = await recordCheckInFor(userId, {
        completion: body.completion,
        feel: body.feel ?? null,
        ...(body.checked_on === undefined ? {} : { checkedOn: body.checked_on }),
      });
      if (summary === null) {
        throw new HttpError(400, 'INVALID_BODY', 'checked_on must be within one day of today');
      }
      return ok(presentCheckIns(summary, { requestId: ctx.requestId }), 201);
    },
  },
  {
    method: 'DELETE',
    path: ['api', 'v1', 'check-ins', ':id'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const removed = await deleteCheckInFor(userId, ctx.params.id ?? '');
      if (!removed) throw new HttpError(404, 'NOT_FOUND', 'No such check-in');
      return noContent();
    },
  },
];
