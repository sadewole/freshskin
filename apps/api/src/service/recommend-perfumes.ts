import { withUser } from '../db/client.js';
import { loadPerfumeCandidates } from '../catalogue/read-view.js';
import { feedbackAffinity } from '../rec/affinity.js';
import { recommend } from '../rec/pipeline.js';
import { loadRatings, rememberRecommendations } from '../rec/store.js';
import type { RecommendationRequest } from '../rec/types.js';
import { present, type WireResponse } from '../http/present.js';
import { loadSensitivities, loadViewer } from './viewer.js';

/**
 * The composition root for GET /recommendations/perfumes. Same shape as the cream service;
 * the difference is entirely in the candidate source and the term registry the pipeline picks.
 */
export async function recommendPerfumesFor(
  userId: string,
  request: RecommendationRequest,
  options: { requestId: string; day: string },
): Promise<WireResponse> {
  const started = performance.now();

  const { plan, storedIds } = await withUser(userId, async (client) => {
    const { candidates, capped } = await loadPerfumeCandidates(client);
    const { viewer, profileVersion } = await loadViewer(client, userId);
    const sensitivities = await loadSensitivities(client, userId);
    const ratings = await loadRatings(client, userId);

    const nextPlan = recommend({
      viewer: { ...viewer, feedbackAffinity: feedbackAffinity(ratings) },
      sensitivities,
      candidates,
      request,
      profileVersion,
      capped,
      day: options.day,
    });

    const ids = await rememberRecommendations(client, userId, nextPlan);
    return { plan: nextPlan, storedIds: ids };
  });

  return present(
    plan,
    { requestId: options.requestId, servedInMs: Math.round(performance.now() - started), cached: false },
    storedIds,
  );
}
