import { CONSENT_KINDS } from '../../src/consent/consent.js';
import { appPool } from '../../src/db/client.js';
import { HttpError } from '../http.js';
import { ok, requireUser, type Route } from './types.js';

const FAMILIES = ['Floral', 'Woody', 'Citrus', 'Oriental', 'Fresh', 'Gourmand'];
const CONCERNS = ['dryness', 'flakiness', 'uneven_tone', 'body_acne', 'sensitivity', 'texture'];
const OCCASIONS = ['daily', 'office', 'evening', 'event'];

export const catalogRoutes: readonly Route[] = [
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
];
