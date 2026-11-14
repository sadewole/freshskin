import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/close.js';
import { withUser } from '../src/db/client.js';
import {
  countCheckIns,
  listRecentCheckIns,
  loadActiveTips,
  loadRoutineContent,
  loadTemplateCandidates,
  recordCheckIn,
  removeCheckIn,
} from '../src/routine/store.js';
import { lagosDay } from '../src/routine/progress.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

async function seeded(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await probe.connect();
    const { rows } = await probe.query(
      `SELECT count(*)::int AS n FROM routine_templates WHERE slug = 'body-basic'`,
    );
    return (rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const userA = randomUUID();
const userB = randomUUID();
const hasDb = await seeded();

describe('routine content and check-ins', { skip: hasDb ? false : 'routine migration not applied' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)', [
      userA,
      `routine-a-${userA}@example.test`,
      userB,
      `routine-b-${userB}@example.test`,
    ]);
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
    await admin.end();
    await closePools();
  });

  it('serves the seeded body-basic template with ordered steps and reviewed tips', async () => {
    const templates = await loadTemplateCandidates();
    assert.equal(templates.length, 1);
    assert.equal(templates[0]?.slug, 'body-basic');
    assert.deepEqual(
      templates[0]?.steps.map((step) => step.position),
      [1, 2, 3],
    );
    for (const step of templates[0]?.steps ?? []) {
      assert.ok(step.instruction.length <= 140, step.instruction);
      assert.ok(step.why.length <= 140, step.why);
    }

    const tips = await loadActiveTips();
    assert.ok(tips.length >= 3);
    assert.ok(tips.every((tip) => tip.body.length <= 140 && tip.why.length <= 140));
    const positions = tips.map((tip) => tip.position);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

    const content = await loadRoutineContent({ hasSkinBasics: false, ownedCreamCount: 0 });
    assert.equal(content?.routine.slug, 'body-basic');
    assert.ok((content?.tips.length ?? 0) >= 1);
  });

  it('keeps users isolated: one user never reads or deletes the other’s rows', async () => {
    const today = lagosDay();
    await recordCheckIn(userA, today, 'done', 'about_same');
    assert.deepEqual((await listRecentCheckIns(userB)).length, 0);
    assert.equal(await countCheckIns(userB), 0);

    const rows = await listRecentCheckIns(userA);
    assert.equal(rows.length, 1);
    const removedByOther = await removeCheckIn(userB, rows[0]?.id ?? '');
    assert.equal(removedByOther, false);
    assert.equal(await countCheckIns(userA), 1);
  });

  it('same-day writes replace and deletes revive as tombstones, never duplicates', async () => {
    const today = lagosDay();
    await recordCheckIn(userA, today, 'done', 'more_comfortable');
    await recordCheckIn(userA, today, 'partly', 'not_sure');
    const rows = await listRecentCheckIns(userA);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.completion, 'partly');

    const removed = await removeCheckIn(userA, rows[0]?.id ?? '');
    assert.equal(removed, true);
    assert.equal(await countCheckIns(userA), 0);

    await recordCheckIn(userA, today, 'done', null);
    assert.equal(await countCheckIns(userA), 1);
  });

  it('RLS blocks cross-user writes through a raw app-role client', async () => {
    const today = lagosDay();
    await withUser(userA, async (client) => {
      await assert.rejects(
        client.query(
          `INSERT INTO check_ins (user_id, checked_on, completion) VALUES ($1, $2::date, 'done')`,
          [userB, today],
        ),
      );
    });
  });
});
