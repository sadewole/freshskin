import { withUser } from '../../src/db/client.js';
import { presentPairing, presentSimilar } from '../../src/http/present-discovery.js';
import { recordFeedback } from '../../src/rec/store.js';
import type { RecommendationRequest } from '../../src/rec/types.js';
import { recommendCreamsFor } from '../../src/service/recommend-creams.js';
import { recommendPairings, recommendSimilar } from '../../src/service/discovery.js';
import { recommendPerfumesFor } from '../../src/service/recommend-perfumes.js';
import { HttpError } from '../http.js';
import { noContent, ok, requireUser, type Route } from './types.js';
import {
  feedbackBodySchema,
  parseBody,
  parseQueryBool,
  parseQueryInt,
} from './validation.js';

export const recommendationRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: ['api', 'v1', 'recommendations', 'creams'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const maxPrice = parseQueryInt(ctx.url.searchParams.get('max_price'), 'max_price');
      const request: RecommendationRequest = {
        kind: 'cream',
        limit: parseQueryInt(ctx.url.searchParams.get('limit'), 'limit') ?? 10,
        narrowing: {
          ...(maxPrice === undefined ? {} : { maxPriceNgn: maxPrice }),
          ...(parseQueryBool(ctx.url.searchParams.get('fragrance_free')) === true
            ? { fragranceFree: true }
            : {}),
        },
      };
      const response = await recommendCreamsFor(userId, request, {
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
        limit: parseQueryInt(ctx.url.searchParams.get('limit'), 'limit') ?? 10,
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
        cheaperOnly: parseQueryBool(ctx.url.searchParams.get('cheaper_only')) === true,
        limit: parseQueryInt(ctx.url.searchParams.get('limit'), 'limit') ?? 8,
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
      const body = parseBody(feedbackBodySchema, ctx.body);
      const input = {
        recommendationId: body.recommendation_id,
        action: body.action,
        ...(body.rating === undefined ? {} : { rating: body.rating }),
        ...(body.dismiss_reason === undefined ? {} : { dismissReason: body.dismiss_reason }),
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
];
