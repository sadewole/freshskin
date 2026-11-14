import type { RoutineResponse } from '../api/types';

const CONTENT_CACHE_KEY = 'freshskin.routine-content.v1';

/**
 * Offline cache for the non-personal routine payload only (routine steps + reviewed tips +
 * disclaimers). Never stores check-ins or anything keyed by user — per-user data is never
 * cached (PRD ban). The server payload already carries its own `request_id`, which we drop;
 * the cached copy is marked `request_id: 'cache'` so the UI can show the "showing saved
 * data" chip when offline.
 */

interface CachedContent {
  readonly saved_at: string;
  readonly data: RoutineResponse['data'];
}

function readCache(): CachedContent | null {
  try {
    const raw = localStorage.getItem(CONTENT_CACHE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('data' in parsed) || typeof parsed.data !== 'object' || parsed.data === null) return null;
    return parsed as CachedContent;
  } catch {
    return null;
  }
}

export function readCachedRoutine(): RoutineResponse | null {
  const cached = readCache();
  if (cached === null) return null;
  return { data: cached.data, meta: { request_id: 'cache' } };
}

export function writeCachedRoutine(response: RoutineResponse): void {
  try {
    const cached: CachedContent = { saved_at: new Date().toISOString(), data: response.data };
    localStorage.setItem(CONTENT_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // Storage full or blocked: the routine renders from the network and simply has no
    // offline copy. Losing the cache beats crashing Home.
  }
}
