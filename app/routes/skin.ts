import { presentAnalysis } from '../../src/http/present-analysis.js';
import {
  completeAnalysis,
  getAnalysis,
  listAnalyses,
  submitAnalysis,
} from '../../src/skin/service.js';
import { HttpError } from '../http.js';
import { ok, requireUser, type Route } from './types.js';
import {
  completeAnalysisBodySchema,
  parseBody,
  skinAnalysisBodySchema,
} from './validation.js';

export const skinRoutes: readonly Route[] = [
  {
    method: 'POST',
    path: ['api', 'v1', 'skin-analyses'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = parseBody(skinAnalysisBodySchema, ctx.body);
      return ok(
        await submitAnalysis(userId, {
          imageKey: body.image_key ?? null,
          captureMeta: {
            brightness: body.capture.brightness ?? 140,
            glareFraction: body.capture.glareFraction ?? 0,
            blurScore: body.capture.blurScore ?? 300,
          },
        }),
        201,
      );
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'skin-analyses'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const analyses = await listAnalyses(userId);
      return ok({
        data: analyses.map((analysis) => presentAnalysis(analysis, { requestId: ctx.requestId }).data),
        meta: { request_id: ctx.requestId },
      });
    },
  },
  {
    method: 'GET',
    path: ['api', 'v1', 'skin-analyses', ':id'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const analysis = await getAnalysis(userId, ctx.params.id ?? '');
      if (analysis === null) throw new HttpError(404, 'NOT_FOUND', 'No such analysis');
      return ok(presentAnalysis(analysis, { requestId: ctx.requestId }));
    },
  },
  {
    method: 'POST',
    path: ['api', 'v1', 'dev', 'skin-analyses', ':id', 'complete'],
    devOnly: true,
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = parseBody(completeAnalysisBodySchema, ctx.body);
      await completeAnalysis(userId, ctx.params.id ?? '', body.analysis, {
        brightness: body.capture.brightness ?? 140,
        glareFraction: body.capture.glareFraction ?? 0,
        blurScore: body.capture.blurScore ?? 300,
      });
      const analysis = await getAnalysis(userId, ctx.params.id ?? '');
      if (analysis === null) throw new HttpError(404, 'NOT_FOUND', 'No such analysis');
      return ok(presentAnalysis(analysis, { requestId: ctx.requestId }));
    },
  },
];
