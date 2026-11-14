import { useCallback, useEffect, useState } from 'react';
import type { CheckInCompletion, CheckInsResponse, SkinFeel, WireCheckIn } from '../api/types';
import { useSession } from '../session/SessionProvider';

const STORE_PREFIX = 'freshskin.checkins.v1';

interface StoredCheckIn {
  readonly completion: CheckInCompletion;
  readonly feel: SkinFeel | null;
  readonly checked_on: string;
  readonly created_at: string;
  readonly synced: boolean;
}

function storeKey(userId: string): string {
  return `${STORE_PREFIX}.${userId}`;
}

function readStore(userId: string | null): readonly StoredCheckIn[] {
  if (userId === null) return [];
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredCheckIn =>
        typeof entry === 'object' &&
        entry !== null &&
        'completion' in entry &&
        'checked_on' in entry,
    );
  } catch {
    return [];
  }
}

function writeStore(userId: string, rows: readonly StoredCheckIn[]): void {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(rows));
  } catch {
    // Storage full or blocked (private mode): the check-in lives in memory for this
    // session. Losing it on reload beats crashing the Home view.
  }
}

function lagosToday(now: Date = new Date()): string {
  // Africa/Lagos is UTC+1 with no DST; the server computes the same value.
  const lagos = new Date(now.getTime() + 60 * 60 * 1000);
  return lagos.toISOString().slice(0, 10);
}

function toWire(row: StoredCheckIn, index: number): WireCheckIn {
  return {
    id: `local-${row.checked_on}`,
    checked_on: row.checked_on,
    completion: row.completion,
    feel: row.feel,
    created_at: row.created_at,
    // Local ids carry the index so React keys stay stable across renders.
    ...(index < 0 ? { id: `local-${row.checked_on}` } : {}),
  };
}

/**
 * Local-first check-in store for the Phase 1 web slice. Same-day writes replace (one
 * check-in per Lagos day, last write wins); streak counts back over consecutive
 * non-skipped days and an unchecked today does not break it. Mirrors the server
 * `summariseProgress` semantics so the Phase 3 API switch changes the source, not the rules.
 */
export function summariseLocal(
  rows: readonly StoredCheckIn[],
  today: string,
): {
  latest: WireCheckIn | null;
  previous: WireCheckIn | null;
  streak_days: number;
  checked_in_today: boolean;
  total_check_ins: number;
  pending_sync: boolean;
} {
  const live = [...rows]
    .filter((row) => row.checked_on <= today)
    .sort((a, b) => (a.checked_on < b.checked_on ? 1 : a.checked_on > b.checked_on ? -1 : 0));
  const [latestRow, previousRow] = [live[0] ?? null, live[1] ?? null];
  const checked_in_today = latestRow?.checked_on === today;

  let streak_days = 0;
  let cursor = today;
  // Walk back day by day from today (or yesterday if today is unchecked); stop at the
  // first missing or skipped day. A missing today never breaks an existing streak.
  const byDay = new Map(live.map((row) => [row.checked_on, row]));
  if (!byDay.has(cursor)) {
    const yesterday = new Date(`${cursor}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    cursor = yesterday.toISOString().slice(0, 10);
  }
  for (;;) {
    const row = byDay.get(cursor);
    if (row === undefined || row.completion === 'skipped') break;
    streak_days += 1;
    const previous = new Date(`${cursor}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    cursor = previous.toISOString().slice(0, 10);
  }

  return {
    latest: latestRow === null ? null : toWire(latestRow, 0),
    previous: previousRow === null ? null : toWire(previousRow, 1),
    streak_days,
    checked_in_today,
    total_check_ins: live.length,
    pending_sync: live.some((row) => !row.synced),
  };
}

const listeners = new Set<() => void>();
function notify(): void {
  for (const notifyListener of listeners) notifyListener();
}

function subscribe(notifyListener: () => void): () => void {
  listeners.add(notifyListener);
  return () => {
    listeners.delete(notifyListener);
  };
}

/** Check-ins for the current session user, re-read from localStorage on every notify. */
export function useLocalCheckIns(): {
  summary: ReturnType<typeof summariseLocal> & { today: string };
  record: (completion: CheckInCompletion, feel: SkinFeel | null) => void;
  clear: () => void;
} {
  const { me } = useSession();
  const userId = me?.user_id ?? null;
  const [tick, setTick] = useState(0);

  useEffect(() => subscribe(() => setTick((value) => value + 1)), []);
  void tick;

  const rows = readStore(userId);
  const today = lagosToday();

  const record = useCallback(
    (completion: CheckInCompletion, feel: SkinFeel | null) => {
      if (userId === null) return;
      const current = readStore(userId);
      const entry: StoredCheckIn = {
        completion,
        feel,
        checked_on: today,
        created_at: new Date().toISOString(),
        synced: false,
      };
      const next = [entry, ...current.filter((row) => row.checked_on !== today)];
      writeStore(userId, next);
      notify();
    },
    [userId, today],
  );

  const clear = useCallback(() => {
    if (userId === null) return;
    try {
      localStorage.removeItem(storeKey(userId));
    } catch {
      // Already gone or blocked; nothing to clear.
    }
    notify();
  }, [userId]);

  const summary = summariseLocal(rows, today);
  return { summary: { ...summary, today }, record, clear };
}

/** Remove every stored check-in key on sign-out so a new session never inherits history. */
export function clearAllCheckInStores(): void {
  try {
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key !== null && key.startsWith(STORE_PREFIX)) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    // Storage blocked; nothing persisted to clear.
  }
  notify();
}

/** Shape the local summary like the wire so components render one type pre- and post-API. */
export function toCheckInsResponse(
  summary: ReturnType<typeof summariseLocal> & { today: string },
): CheckInsResponse {
  return {
    data: {
      today: summary.today,
      latest: summary.latest,
      previous: summary.previous,
      streak_days: summary.streak_days,
      checked_in_today: summary.checked_in_today,
      total_check_ins: summary.total_check_ins,
      disclaimer: 'Check-ins are your own notes. Two entries show what changed lately, not a medical trend.',
    },
    meta: { request_id: 'local' },
  };
}
