import { withUser } from '../../src/db/client.js';
import { loadFragranceProfile, saveFragranceProfile } from '../../src/rec/fragrance-profile.js';
import { noContent, ok, requireUser, type Route } from './types.js';
import { fragranceProfileBodySchema, parseBody } from './validation.js';

export const fragranceProfileRoutes: readonly Route[] = [
  {
    method: 'GET',
    path: ['api', 'v1', 'fragrance-profile'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const profile = await withUser(userId, (client) => loadFragranceProfile(client, userId));
      return ok({ data: profile, meta: { request_id: ctx.requestId } });
    },
  },
  {
    method: 'PUT',
    path: ['api', 'v1', 'fragrance-profile'],
    handler: async (ctx) => {
      const userId = requireUser(ctx);
      const body = parseBody(fragranceProfileBodySchema, ctx.body);

      await withUser(userId, (client) =>
        saveFragranceProfile(client, userId, {
          familiesLiked: body.families_liked,
          familiesDisliked: body.families_disliked,
          notesLoved: body.notes_loved,
          notesAvoided: body.notes_avoided,
          strength: body.strength,
          occasions: body.occasions,
          budgetMaxNgn: body.budget_max_ngn ?? null,
          quizVersion: 'quiz-1',
        }),
      );
      return noContent();
    },
  },
];
