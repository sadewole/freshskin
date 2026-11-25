import type { CheckInCompletion, SkinFeel, WireCheckIn, WireCheckIns, WireRoutine } from '@freshskin/contracts';
import type { CheckInsResponse } from '../routine/service.js';
import type { RoutineContent } from '../routine/store.js';
import type { StoredCheckIn } from '../routine/types.js';

/** Wire shapes for the routine and check-in surfaces. Like the others: rename, nest, decide nothing. */

export type { WireCheckIn, WireCheckIns, WireRoutine } from '@freshskin/contracts';

/** Canonical disclaimers (PRD §16.7). Present on every routine and check-in response. */
export const ROUTINE_DISCLAIMER =
  'This routine is general cosmetic guidance, not medical advice. Skin changes have many causes, so see a dermatologist if something worries you.';

export const CHECK_INS_DISCLAIMER =
  'Check-ins are your own notes. Two entries show what changed lately, not a medical trend.';

function presentCheckIn(row: StoredCheckIn): WireCheckIn {
  return {
    id: row.id,
    checked_on: row.checkedOn,
    completion: row.completion satisfies CheckInCompletion,
    feel: row.feel satisfies SkinFeel | null,
    created_at: row.createdAt.toISOString(),
  };
}

export function presentRoutine(content: RoutineContent, meta: { requestId: string }): WireRoutine {
  return {
    data: {
      routine: {
        slug: content.routine.slug,
        title: content.routine.title,
        content_version: content.routine.contentVersion,
        steps: content.routine.steps.map((step) => ({
          id: step.id,
          position: step.position,
          title: step.title,
          instruction: step.instruction,
          why: step.why,
          inputs: [...step.inputs],
          tip_id: step.tipId,
        })),
      },
      tips: content.tips.map((tip) => ({
        id: tip.id,
        topic: tip.topic as WireRoutine['data']['tips'][number]['topic'],
        body: tip.body,
        why: tip.why,
        inputs: [...tip.inputs],
      })),
      disclaimer: ROUTINE_DISCLAIMER,
    },
    meta: { request_id: meta.requestId },
  };
}

export function presentCheckIns(
  response: CheckInsResponse,
  meta: { requestId: string },
): WireCheckIns {
  return {
    data: {
      today: response.today,
      latest: response.latest === null ? null : presentCheckIn(response.latest),
      previous: response.previous === null ? null : presentCheckIn(response.previous),
      streak_days: response.streakDays,
      checked_in_today: response.checkedInToday,
      total_check_ins: response.totalCheckIns,
      disclaimer: CHECK_INS_DISCLAIMER,
    },
    meta: { request_id: meta.requestId },
  };
}
