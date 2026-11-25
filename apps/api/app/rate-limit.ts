/**
 * Per-IP fixed-window limiter. In-memory on purpose: one process, no Redis dependency, and a
 * bounded map so a hostile client cannot grow it without limit.
 */
const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = WINDOW_MS,
  ) {}

  /** Returns seconds to wait when limited, or 0 when the request may proceed. */
  take(key: string, now = Date.now()): number {
    if (this.buckets.size > MAX_KEYS) this.buckets.clear();

    const bucket = this.buckets.get(key);
    if (bucket === undefined || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }

    if (bucket.count >= this.limit) {
      return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    }

    bucket.count += 1;
    return 0;
  }
}

/** Behind a proxy every request shares one address, so the key prefers the forwarded client. */
export function clientKey(forwardedFor: string | undefined, remote: string | undefined): string {
  const forwarded = forwardedFor?.split(',')[0]?.trim();
  return forwarded !== undefined && forwarded.length > 0 ? forwarded : (remote ?? 'unknown');
}
