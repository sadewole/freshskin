import type {
  ConsentKind,
  CreatedScan,
  CreamQuery,
  FragranceProfileInput,
  FragranceProfileWire,
  Me,
  RecommendationResponse,
  SavedList,
  SavedResponse,
  ScanResponse,
  SimilarResponse,
  SiteMeta,
} from './types';

/**
 * The only module that talks to the network. Components call these functions; nothing else
 * constructs a URL or reads a response field. That is what stops a field name drifting from
 * the server without the compiler noticing.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly query?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * API origin (decision 0002). Same-origin `/api/v1` by default so local development —
 * Vite on :5173 proxying to the dev server — works with no env. Production sets
 * `VITE_API_BASE_URL=https://api.freshskin.com/api/v1`; the host-only api cookie rides
 * along because the origins are same-site and credentials are included.
 */
const BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '') || '/api/v1';

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = `${BASE}${path}`;
  if (query === undefined) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search.length === 0 ? url : `${url}?${search}`;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const hasBody = options.body !== undefined;

  const response = await fetch(buildUrl(path, options.query), {
    method,
    credentials: 'include',
    headers: hasBody ? { 'content-type': 'application/json' } : {},
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 204) return null as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = isRecord(payload) && isRecord(payload.error) ? payload.error : undefined;
    throw new ApiError(
      response.status,
      typeof error?.code === 'string' ? error.code : 'UNKNOWN',
      typeof error?.message === 'string' ? error.message : `Request failed (${response.status})`,
      error?.retryable === true,
    );
  }

  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// ---------------------------------------------------------------- session

export async function startSession(): Promise<void> {
  await request<null>('/auth/anonymous', { method: 'POST' });
}

export async function endSession(): Promise<void> {
  await request<null>('/auth/logout', { method: 'POST' });
}

export function getMe(): Promise<{ data: Me }> {
  return request<{ data: Me }>('/me');
}

export function getSiteMeta(): Promise<{ data: SiteMeta }> {
  return request<{ data: SiteMeta }>('/meta');
}

/**
 * Resolves the current user, starting an anonymous session if there is none. This is the one
 * place that knows the "401 means start a session" rule; callers just get a user or an error.
 */
export async function ensureSession(): Promise<Me> {
  try {
    return (await getMe()).data;
  } catch (error) {
    if (!(error instanceof ApiError) || !error.isUnauthenticated) throw error;
    await startSession();
    return (await getMe()).data;
  }
}

// ---------------------------------------------------------------- consent

export async function setConsent(kind: ConsentKind, granted: boolean): Promise<void> {
  await request<null>('/consents', {
    method: 'POST',
    body: { kind, granted, policy_version: '2026-11-01' },
  });
}

// ---------------------------------------------------------------- fragrance profile

export function getFragranceProfile(): Promise<{ data: FragranceProfileWire | null }> {
  return request<{ data: FragranceProfileWire | null }>('/fragrance-profile');
}

export async function saveFragranceProfile(input: FragranceProfileInput): Promise<void> {
  await request<null>('/fragrance-profile', { method: 'PUT', body: input });
}

// ---------------------------------------------------------------- recommendations

export function getCreams(query: CreamQuery): Promise<RecommendationResponse> {
  return request<RecommendationResponse>('/recommendations/creams', {
    query: {
      max_price: query.maxPrice ?? undefined,
      fragrance_free: query.fragranceFree === true ? 'true' : undefined,
      limit: query.limit,
    },
  });
}

export function getPerfumes(limit?: number): Promise<RecommendationResponse> {
  return request<RecommendationResponse>('/recommendations/perfumes', { query: { limit } });
}

export function getSimilar(productId: string, cheaperOnly = false): Promise<SimilarResponse> {
  return request<SimilarResponse>('/recommendations/similar', {
    query: { product_id: productId, cheaper_only: cheaperOnly ? 'true' : undefined },
  });
}

// ---------------------------------------------------------------- saved items

export function getSaved(): Promise<SavedResponse> {
  return request<SavedResponse>('/saved-items');
}

export async function saveItem(productId: string, list: SavedList = 'wishlist'): Promise<void> {
  await request<null>('/saved-items', { method: 'POST', body: { product_id: productId, list } });
}

export async function removeSaved(productId: string, list: SavedList): Promise<void> {
  await request<null>('/saved-items', { method: 'DELETE', query: { product_id: productId, list } });
}

// ---------------------------------------------------------------- scans

/**
 * `POST /scans` is the one endpoint that answers with the bare domain object (`{ scanId }`)
 * rather than an envelope. The field is `scanId`, not `id` -- see `submitScan` in
 * src/scans/service.ts.
 */
export function createScan(kind: 'ingredient_label' | 'bottle' = 'ingredient_label'): Promise<CreatedScan> {
  return request<CreatedScan>('/scans', { method: 'POST', body: { kind } });
}

/**
 * Development-only completion. The OCR worker owns this transition in production; until it
 * lands, this endpoint lets the label screen run the real matcher. A 404 means the dev
 * endpoints are switched off, which the caller shows as "worker not connected".
 */
export function completeScanFromText(scanId: string, rawText: string): Promise<ScanResponse> {
  return request<ScanResponse>(`/dev/scans/${encodeURIComponent(scanId)}/complete`, {
    method: 'POST',
    body: { raw_text: rawText },
  });
}
