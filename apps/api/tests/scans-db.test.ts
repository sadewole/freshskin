import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/close.js';
import { presentScan } from '../src/http/present-scan.js';
import { completeScan, getScan, ScanNotInFlight, submitScan } from '../src/scans/service.js';
import type { ParsedToken, ScanSubject } from '../src/scans/verdict.js';
import type { Collision } from '../src/safety/conflicts.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

async function reachable(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const tokens = (matched: number, total: number): ParsedToken[] =>
  Array.from({ length: total }, (_, index) => ({
    raw: `token-${index}`,
    ingredientId: index < matched ? `ing-${index}` : null,
  }));

const subject = (over: Partial<ScanSubject> = {}): ScanSubject => ({
  concerns: [],
  collisions: [],
  highIrritantCount: 0,
  comedogenicHits: 0,
  fragranceAllergen: false,
  beneficialCount: 0,
  ...over,
});

const collision = (): Collision => ({
  sensitivity: {
    id: 's1',
    ingredientId: 'ing-0',
    freeText: null,
    severity: 'severe',
    appliesTo: ['cream'],
  },
  hit: { ingredientId: 'ing-0', inciName: 'Fragrance', isAllergen: true },
  kind: 'declared',
  severity: 'severe',
});

const userA = randomUUID();
const userB = randomUUID();
const hasDb = await reachable();

describe('scan persistence and invariants', { skip: hasDb ? false : 'database unreachable' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2), ($3, $4)', [
      userA,
      `scan-a-${userA}@example.test`,
      userB,
      `scan-b-${userB}@example.test`,
    ]);
    await admin.query(
      `INSERT INTO consent_records (user_id, kind, policy_version, granted)
       VALUES ($1, 'image_processing', '2026-11-01', true), ($2, 'image_processing', '2026-11-01', true)`,
      [userA, userB],
    );
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
    await admin.end();
    await closePools();
  });

  it('completes a scan, stores findings, and returns a verdict', async () => {
    const { scanId } = await submitScan(userA, { kind: 'ingredient_label', imageKey: 'img-1' });
    const result = await completeScan(userA, scanId, tokens(8, 10), subject({ collisions: [collision()] }));

    assert.equal(result.status, 'complete');
    assert.equal(result.verdict?.kind, 'avoid');
    assert.ok(result.findings.length > 0);

    const stored = await getScan(userA, scanId);
    assert.equal(stored?.verdict, 'avoid');
    assert.equal(stored?.status, 'complete');

    const findings = await admin.query('SELECT severity, label FROM scan_findings WHERE scan_id = $1', [scanId]);
    assert.equal(findings.rowCount, result.findings.length);
  });

  it('refuses to judge a label it could not read, and stores no verdict', async () => {
    const { scanId } = await submitScan(userA, { kind: 'ingredient_label', imageKey: 'img-2' });
    const result = await completeScan(userA, scanId, tokens(2, 12), subject());

    assert.equal(result.status, 'low_confidence');
    assert.equal(result.verdict, null);
    assert.equal(result.insufficientReason, 'too_few_recognised');

    const stored = await getScan(userA, scanId);
    assert.equal(stored?.verdict, null);
    assert.equal(stored?.status, 'low_confidence');

    const wire = presentScan(result, { requestId: 'req-1' });
    assert.equal(wire.data.verdict, null);
    assert.equal(wire.data.retake.needed, true);
  });

  it('lets exactly one worker finalise a scan', async () => {
    const { scanId } = await submitScan(userA, { kind: 'ingredient_label', imageKey: 'img-3' });
    await completeScan(userA, scanId, tokens(9, 9), subject());

    await assert.rejects(
      () => completeScan(userA, scanId, tokens(9, 9), subject()),
      (error: unknown) => error instanceof ScanNotInFlight,
    );
  });

  it('hides a scan from another user', async () => {
    const { scanId } = await submitScan(userA, { kind: 'ingredient_label', imageKey: 'img-4' });
    assert.equal(await getScan(userB, scanId), null);
  });

  it('enforces the 60% floor in the database, not only in TypeScript', async () => {
    const { scanId } = await submitScan(userA, { kind: 'ingredient_label', imageKey: 'img-5' });

    await assert.rejects(
      () =>
        admin.query(
          `UPDATE scans SET status = 'complete', parsed = '[]'::jsonb, matched_count = 3,
             match_rate = 0.40, verdict = 'avoid' WHERE id = $1`,
          [scanId],
        ),
      (error: unknown) => (error as { code?: string }).code === '23514',
    );
  });

  it('refuses a complete scan with no results', async () => {
    const { scanId } = await submitScan(userA, { kind: 'ingredient_label', imageKey: 'img-6' });

    await assert.rejects(
      () => admin.query(`UPDATE scans SET status = 'complete' WHERE id = $1`, [scanId]),
      (error: unknown) => (error as { code?: string }).code === '23514',
    );
  });

  it('refuses a verdict on a low-confidence scan', async () => {
    const { scanId } = await submitScan(userA, { kind: 'ingredient_label', imageKey: 'img-7' });

    await assert.rejects(
      () =>
        admin.query(
          `UPDATE scans SET status = 'low_confidence', verdict = 'okay', parsed = '[]'::jsonb,
             matched_count = 8, match_rate = 0.8 WHERE id = $1`,
          [scanId],
        ),
      (error: unknown) => (error as { code?: string }).code === '23514',
    );
  });
});
