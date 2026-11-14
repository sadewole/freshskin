import type { CheckInCompletion, SkinFeel } from '@freshskin/contracts';
import { dayDistance, lagosDay, summariseProgress, type CheckInsSummary } from './progress.js';
import {
  countCheckIns,
  listRecentCheckIns,
  loadRoutineContent,
  loadRoutineProfile,
  recordCheckIn,
  removeCheckIn,
  type RoutineContent,
} from './store.js';

/**
 * The composition root for routines and check-ins, mirroring src/service/discovery.ts: read
 * curated content, summarise the user's own rows, persist writes. Out-of-window checked_on
 * values (offline queue tolerance is ±1 day) come back as null so the route maps them to 400.
 */

export interface CheckInsResponse {
  readonly today: string;
  readonly latest: CheckInsSummary['latest'];
  readonly previous: CheckInsSummary['previous'];
  readonly streakDays: number;
  readonly checkedInToday: boolean;
  readonly totalCheckIns: number;
}

export async function getRoutineFor(userId: string): Promise<RoutineContent | null> {
  return loadRoutineContent(await loadRoutineProfile(userId));
}

export async function getCheckInsFor(userId: string): Promise<CheckInsResponse> {
  const today = lagosDay();
  const [recent, total] = await Promise.all([
    listRecentCheckIns(userId),
    countCheckIns(userId),
  ]);
  const summary = summariseProgress(recent, today);
  return {
    today,
    latest: summary.latest,
    previous: summary.previous,
    streakDays: summary.streakDays,
    checkedInToday: summary.checkedInToday,
    totalCheckIns: total,
  };
}

export async function recordCheckInFor(
  userId: string,
  input: { completion: CheckInCompletion; feel: SkinFeel | null; checkedOn?: string | undefined },
): Promise<CheckInsResponse | null> {
  const today = lagosDay();
  const checkedOn = input.checkedOn ?? today;
  if (!Number.isInteger(dayDistance(checkedOn, today)) || Math.abs(dayDistance(checkedOn, today)) > 1) {
    return null;
  }
  await recordCheckIn(userId, checkedOn, input.completion, input.feel);
  return getCheckInsFor(userId);
}

export async function deleteCheckInFor(userId: string, id: string): Promise<boolean> {
  return removeCheckIn(userId, id);
}
