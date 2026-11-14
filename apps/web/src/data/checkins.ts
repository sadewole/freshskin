import { useCallback, useEffect, useState } from 'react';
import { ApiError, ensureSession, getCheckIns, saveCheckIn } from '../api/client';
import type { CheckInCompletion, CheckInsResponse, SkinFeel } from '../api/types';
import { useSession } from '../session/SessionProvider';

const OUTBOX_PREFIX = 'freshskin.checkins.outbox.v1';

interface OutboxEntry {
  readonly completion: CheckInCompletion;
  readonly feel: SkinFeel | null;
  /** Lagos day the entry belongs to; defaults to the recording day at flush time. */
  readonly checked_on: string;
  readonly queued_at: string;
}

function outboxKey(userId: string): string {
  return `${OUTBOX_PREFIX}.${userId}`;
}

function readOutbox(userId: string | null): readonly OutboxEntry[] {
  if (userId === null) return [];
  try {
    const raw = localStorage.getItem(outboxKey(userId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is OutboxEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        'completion' in entry &&
        'checked_on' in entry,
    );
  } catch {
    return [];
  }
}

function writeOutbox(userId: string, entries: readonly OutboxEntry[]): void {
  try {
    localStorage.setItem(outboxKey(userId), JSON.stringify(entries));
  } catch {
    // Storage full or blocked: the entry lives in memory for this session only.
  }
}

function lagosToday(): string {
  // Africa/Lagos is UTC+1 with no DST; the server computes the same value.
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Check-ins against the live API (Phase 3). The server summary is the source of truth;
 * unsent entries queue in a per-user outbox and flush idempotently — the natural key
 * (user + Lagos day) means replays overwrite instead of duplicating. The outbox is keyed
 * by `user_id` and cleared on sign-out, so an expired anonymous session can never
 * misattribute a queued entry. `pending_sync` drives the "Saved on this phone, will sync"
 * chip; offline reads show the last server summary with nothing queued on top of it.
 */
export function useCheckIns(): {
  summary: CheckInsResponse['data'] | null;
  error: unknown;
  loading: boolean;
  pending_sync: boolean;
  record: (completion: CheckInCompletion, feel: SkinFeel | null) => Promise<void>;
} {
  const { me } = useSession();
  const userId = me?.user_id ?? null;
  const [summary, setSummary] = useState<CheckInsResponse['data'] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (userId === null) {
      setSummary(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const flush = async (): Promise<void> => {
      // 401 mid-flight means the anonymous session lapsed; one fresh session, then retry.
      // The outbox key already scopes entries to this user_id, and sign-out clears every
      // key, so a queue can never be flushed under a different user.
      const queued = readOutbox(userId);
      for (const entry of queued) {
        try {
          await saveCheckIn({
            completion: entry.completion,
            feel: entry.feel,
            checked_on: entry.checked_on,
          });
        } catch (caught) {
          if (!(caught instanceof ApiError) || !caught.isUnauthenticated) throw caught;
          await ensureSession();
          await saveCheckIn({
            completion: entry.completion,
            feel: entry.feel,
            checked_on: entry.checked_on,
          });
        }
      }
      writeOutbox(userId, []);
      if (!cancelled) setPendingCount(0);
    };

    void (async () => {
      try {
        await flush();
      } catch {
        // Offline or unreachable: keep the queue, show the last summary below.
        if (!cancelled) setPendingCount(readOutbox(userId).length);
      }
      try {
        const response = await getCheckIns();
        if (!cancelled) {
          setSummary(response.data);
          setPendingCount(readOutbox(userId).length);
        }
      } catch (caught) {
        if (!cancelled) setError(caught);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const onOnline = (): void => {
      setNonce((value) => value + 1);
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [userId, nonce]);

  const record = useCallback(
    async (completion: CheckInCompletion, feel: SkinFeel | null): Promise<void> => {
      if (userId === null) return;
      try {
        const response = await saveCheckIn({ completion, feel });
        setSummary(response.data);
        setPendingCount(readOutbox(userId).length);
      } catch (caught) {
        if (caught instanceof ApiError && caught.isUnauthenticated) {
          // Session lapsed mid-tap: one fresh session, then retry before queuing.
          await ensureSession();
          const response = await saveCheckIn({ completion, feel });
          setSummary(response.data);
          setPendingCount(readOutbox(userId).length);
          return;
        }
        // Offline or unreachable: queue for the next flush (same-day replace keeps one
        // entry per Lagos day), then refresh the local view optimistically.
        const today = lagosToday();
        const entry: OutboxEntry = {
          completion,
          feel,
          checked_on: today,
          queued_at: new Date().toISOString(),
        };
        const next = [entry, ...readOutbox(userId).filter((row) => row.checked_on !== today)];
        writeOutbox(userId, next);
        setPendingCount(next.length);
        setError(caught);
      }
    },
    [userId],
  );

  return {
    summary,
    error,
    loading,
    pending_sync: pendingCount > 0,
    record,
  };
}

/** Remove every check-in outbox key on sign-out so a new session never inherits the queue. */
export function clearAllCheckInStores(): void {
  try {
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key !== null && key.startsWith(OUTBOX_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Storage blocked; nothing persisted to clear.
  }
}
