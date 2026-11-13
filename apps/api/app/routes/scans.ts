import { presentScan } from '../../src/http/present-scan.js';
import { completeScanFromText, getScan, submitScan } from '../../src/scans/service.js';
import { HttpError } from '../http.js';
import { ok, requireUser, type Route } from './types.js';
import { completeScanBodySchema, parseBody, scanBodySchema } from './validation.js';

export const scanRoutes: readonly Route[] = [
  {
    method: 'POST',
    path: ['api', 'v1', 'scans'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = parseBody(scanBodySchema, ctx.body);
      return ok(await submitScan(userId, { kind: body.kind, imageKey: body.image_key ?? null }), 201);
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
    path: ['api', 'v1', 'dev', 'scans', ':id', 'complete'],
    devOnly: true,
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = parseBody(completeScanBodySchema, ctx.body);

      const result = await completeScanFromText(userId, ctx.params.id ?? '', body.raw_text, {
        concerns: body.subject.concerns,
        collisions: [],
        highIrritantCount: body.subject.high_irritant_count,
        comedogenicHits: body.subject.comedogenic_hits,
        fragranceAllergen: body.subject.fragrance_allergen,
        beneficialCount: body.subject.beneficial_count,
      });
      return ok(presentScan(result, { requestId: ctx.requestId }));
    },
  },
];
