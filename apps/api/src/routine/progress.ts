import type { StoredCheckIn } from './types.js';

/**
 * Progress summaries. Pure, so the web client's local store mirrors these exact rules:
 * latest two check-ins only, streak over consecutive non-skipped days, an unchecked today
 * never breaks an existing streak. Two entries plus a completion streak is not a trend
 * (PRD §6.4 carve-out) — there are no history arrays or trend fields anywhere below.
 */

/** Africa/Lagos is UTC+1 with no DST, so the offset is a constant — same as the web client. */
export function lagosDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface CheckInsSummary {
  readonly latest: StoredCheckIn | null;
  readonly previous: StoredCheckIn | null;
  readonly streakDays: number;
  readonly checkedInToday: boolean;
  readonly totalCheckIns: number;
}

function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Whole-day distance between two YYYY-MM-DD days. NaN when either side is not a real date. */
export function dayDistance(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export function summariseProgress(
  rows: readonly StoredCheckIn[],
  today: string,
): CheckInsSummary {
  const live = [...rows]
    .filter((row) => row.checkedOn <= today)
    .sort((a, b) => (a.checkedOn < b.checkedOn ? 1 : a.checkedOn > b.checkedOn ? -1 : 0));
  const latest = live[0] ?? null;
  const previous = live[1] ?? null;

  const byDay = new Map(live.map((row) => [row.checkedOn, row]));
  let cursor = byDay.has(today) ? today : addDays(today, -1);
  let streakDays = 0;
  for (;;) {
    const row = byDay.get(cursor);
    if (row === undefined || row.completion === 'skipped') break;
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  return {
    latest,
    previous,
    streakDays,
    checkedInToday: latest?.checkedOn === today,
    totalCheckIns: live.length,
  };
}
