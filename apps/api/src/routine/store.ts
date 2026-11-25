import { appPool, withUser } from '../db/client.js';
import type { RoutineStep, RoutineTemplate, StoredCheckIn } from './types.js';
import { bestTips, selectRoutine, type RoutineProfile, type TemplateCandidate } from './template.js';

/**
 * Routine persistence. Check-ins run through withUser, mirroring saved/items.ts: the same-day
 * upsert revives a soft-deleted row rather than inserting a duplicate, and deleting is a
 * tombstone so the "one live row per (user, day)" invariant survives removals. Curated
 * content (templates, steps, tips) reads as the app role with no user setting — it is public
 * and there is no per-user filtering to leak.
 */

interface TipRow {
  readonly id: string;
  readonly topic: string;
  readonly body: string;
  readonly why: string;
  readonly inputs: readonly string[];
  readonly position: number;
}

export async function loadTemplateCandidates(): Promise<TemplateCandidate[]> {
  const { rows: templates } = await appPool.query<{
    id: string;
    slug: string;
    title: string;
    content_version: string;
    audience: string[] | null;
  }>(`SELECT id, slug, title, content_version, audience FROM routine_templates ORDER BY slug`);
  const { rows: steps } = await appPool.query<{
    id: string;
    template_id: string;
    position: number;
    title: string;
    instruction: string;
    why: string;
    inputs: string[] | null;
    tip_id: string | null;
  }>(
    `SELECT id, template_id, position, title, instruction, why, inputs, tip_id
      FROM routine_steps ORDER BY template_id, position`,
  );

  const byTemplate = new Map<string, RoutineStep[]>();
  for (const step of steps) {
    const list = byTemplate.get(step.template_id) ?? [];
    list.push({
      id: step.id,
      position: step.position,
      title: step.title,
      instruction: step.instruction,
      why: step.why,
      inputs: step.inputs ?? [],
      tipId: step.tip_id,
    });
    byTemplate.set(step.template_id, list);
  }

  return templates.map((template) => ({
    slug: template.slug,
    title: template.title,
    contentVersion: template.content_version,
    audience: template.audience ?? [],
    steps: byTemplate.get(template.id) ?? [],
  }));
}

export async function loadActiveTips(): Promise<TipRow[]> {
  const { rows } = await appPool.query<{
    id: string;
    topic: string;
    body: string;
    why: string;
    inputs: string[] | null;
    position: number;
  }>(
    `SELECT id, topic, body, why, inputs, position FROM tips
      WHERE active AND reviewed_at IS NOT NULL ORDER BY position, id`,
  );
  return rows.map((row) => ({ ...row, inputs: row.inputs ?? [] }));
}

export interface RoutineContent {
  readonly routine: RoutineTemplate;
  readonly tips: readonly TipRow[];
}

export async function loadRoutineContent(profile: RoutineProfile): Promise<RoutineContent | null> {
  const [templates, tips] = await Promise.all([loadTemplateCandidates(), loadActiveTips()]);
  const chosen = selectRoutine(profile, templates);
  if (chosen === null) return null;
  return {
    routine: {
      slug: chosen.slug,
      title: chosen.title,
      contentVersion: chosen.contentVersion,
      steps: chosen.steps,
    },
    tips: bestTips(tips),
  };
}

function toStoredCheckIn(row: {
  id: string;
  checked_on: string;
  completion: StoredCheckIn['completion'];
  feel: StoredCheckIn['feel'];
  created_at: Date;
}): StoredCheckIn {
  return {
    id: row.id,
    checkedOn: row.checked_on.slice(0, 10),
    completion: row.completion,
    feel: row.feel,
    createdAt: row.created_at,
  };
}

export async function listRecentCheckIns(userId: string, limit = 3): Promise<StoredCheckIn[]> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      checked_on: string;
      completion: StoredCheckIn['completion'];
      feel: StoredCheckIn['feel'];
      created_at: Date;
    }>(
      // checked_on as text: pg parses date columns to midnight server-local, which shifts the
      // day under UTC. The calendar day is what the streak walks, so keep it a plain string.
      `SELECT id, checked_on::text, completion, feel, created_at FROM check_ins
        WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY checked_on DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(toStoredCheckIn);
  });
}

export async function countCheckIns(userId: string): Promise<number> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM check_ins WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  });
}

export async function recordCheckIn(
  userId: string,
  checkedOn: string,
  completion: StoredCheckIn['completion'],
  feel: StoredCheckIn['feel'],
): Promise<void> {
  await withUser(userId, async (client) => {
    const revived = await client.query(
      `UPDATE check_ins SET deleted_at = NULL, completion = $3, feel = $4, created_at = now()
        WHERE user_id = $1 AND checked_on = $2::date AND deleted_at IS NOT NULL`,
      [userId, checkedOn, completion, feel],
    );
    if ((revived.rowCount ?? 0) > 0) return;

    await client.query(
      `INSERT INTO check_ins (user_id, checked_on, completion, feel)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (user_id, checked_on) WHERE deleted_at IS NULL
       DO UPDATE SET completion = EXCLUDED.completion, feel = EXCLUDED.feel, created_at = now()`,
      [userId, checkedOn, completion, feel],
    );
  });
}

export async function removeCheckIn(userId: string, id: string): Promise<boolean> {
  return withUser(userId, async (client) => {
    const { rowCount } = await client.query(
      `UPDATE check_ins SET deleted_at = now()
        WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL`,
      [userId, id],
    );
    return (rowCount ?? 0) > 0;
  });
}

/**
 * Personalization trigger inputs (decision 0004): the generic routine personalizes once the
 * user has skin basics (a completed analysis) plus at least one owned cream.
 */
export async function loadRoutineProfile(userId: string): Promise<RoutineProfile> {
  return withUser(userId, async (client) => {
    const { rows: basics } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM skin_analyses WHERE user_id = $1 AND status = 'complete'`,
      [userId],
    );
    const { rows: owned } = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM saved_items s
         JOIN v_product_browse p ON p.id = s.product_id
        WHERE s.user_id = $1 AND s.list = 'owned' AND s.deleted_at IS NULL
          AND p.category = 'cream'`,
      [userId],
    );
    return {
      hasSkinBasics: Number(basics[0]?.n ?? 0) > 0,
      ownedCreamCount: Number(owned[0]?.n ?? 0),
    };
  });
}
