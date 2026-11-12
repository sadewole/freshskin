import { presentSaved } from '../../src/http/present-saved.js';
import { listSaved, removeItem, saveItem } from '../../src/saved/items.js';
import { noContent, ok, requireUser, type Route } from './types.js';
import {
  parseBody,
  parseQuery,
  removeItemQuerySchema,
  saveItemBodySchema,
} from './validation.js';

export const savedRoutes: readonly Route[] = [
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
      const body = parseBody(saveItemBodySchema, ctx.body);
      await saveItem(userId, body.product_id, body.list);
      return noContent();
    },
  },
  {
    method: 'DELETE',
    path: ['api', 'v1', 'saved-items'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const query = parseQuery(removeItemQuerySchema, Object.fromEntries(ctx.url.searchParams));
      await removeItem(userId, query.product_id, query.list);
      return noContent();
    },
  },
];
