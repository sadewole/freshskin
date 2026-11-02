import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { closePools } from '../src/db/client.js';
import { completeScanFromText, getScan, submitScan } from '../src/scans/service.js';
import type { ScanSubject } from '../src/scans/verdict.js';
import type { Collision } from '../src/safety/conflicts.js';

const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:55432/freshskin';

async function seeded(): Promise<boolean> {
  const probe = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await probe.connect();
    const { rows } = await probe.query('SELECT count(*)::int AS n FROM v_ingredient_lexicon');
    return (rows[0]?.n ?? 0) >= 5;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => undefined);
  }
}

const subject = (over: Partial<ScanSubject> = {}): ScanSubject => ({
  concerns: [],
  collisions: [],
  highIrritantCount: 0,
  comedogenicHits: 0,
  fragranceAllergen: false,
  beneficialCount: 0,
  ...over,
});

const fragranceCollision: Collision = {
  sensitivity: {
    id: 's1',
    ingredientId: 'ing-fragrance',
    freeText: null,
    severity: 'severe',
    appliesTo: ['cream'],
  },
  hit: { ingredientId: 'ing-fragrance', inciName: 'Fragrance', isAllergen: true },
  kind: 'declared',
  severity: 'severe',
};

const userId = randomUUID();
const ready = await seeded();

describe('scan from raw label text', { skip: ready ? false : 'database not seeded' }, () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });

  before(async () => {
    await admin.connect();
    await admin.query('INSERT INTO users (id, email) VALUES ($1, $2)', [
      userId,
      `text-${userId}@example.test`,
    ]);
  });

  after(async () => {
    await admin.query('DELETE FROM users WHERE id = $1', [userId]);
    await admin.end();
    await closePools();
  });

  it('reads a real label, matches the lexicon, and returns a verdict', async () => {
    const { scanId } = await submitScan(userId, { kind: 'ingredient_label', imageKey: 'label-1' });
    const label =
      'Ingredients: Aqua, Glycerin, Butyrospermum Parkii Butter, Fragrance, Phenoxyethanol, ' +
      'Tocopherol, Sodium Hyaluronate, Niacinamide';

    const result = await completeScanFromText(
      userId,
      scanId,
      label,
      subject({ collisions: [fragranceCollision], beneficialCount: 3 }),
    );

    assert.equal(result.status, 'complete');
    assert.equal(result.verdict?.kind, 'avoid');
    // "Aqua" is not in the seed lexicon, so 7 of 8 tokens resolve.
    assert.equal(result.matchRate, 0.875);
    assert.equal(result.matched, 7);

    const stored = await getScan(userId, scanId);
    assert.equal(stored?.verdict, 'avoid');

    const rawText = await admin.query<{ raw_text: string }>('SELECT raw_text FROM scans WHERE id = $1', [
      scanId,
    ]);
    assert.match(rawText.rows[0]?.raw_text ?? '', /Butyrospermum Parkii Butter/);

    const findings = await admin.query<{ label: string; severity: string }>(
      'SELECT label, severity FROM scan_findings WHERE scan_id = $1',
      [scanId],
    );
    assert.ok(findings.rows.some((row) => row.label === 'Fragrance' && row.severity === 'avoid'));
  });

  it('refuses a label whose ingredients it mostly does not know', async () => {
    const { scanId } = await submitScan(userId, { kind: 'ingredient_label', imageKey: 'label-2' });
    const result = await completeScanFromText(
      userId,
      scanId,
      'Water, Unobtainium, Mystery Compound, Quux, Lorem Ipsum, Dolor Sit',
      subject(),
    );

    assert.equal(result.status, 'low_confidence');
    assert.equal(result.verdict, null);
    assert.equal(result.insufficientReason, 'too_few_recognised');
  });

  it('does not invent ingredients when the label is marketing copy', async () => {
    const { scanId } = await submitScan(userId, { kind: 'ingredient_label', imageKey: 'label-3' });
    const result = await completeScanFromText(
      userId,
      scanId,
      'Nourishing daily glow formula for beautiful skin',
      subject(),
    );

    assert.equal(result.status, 'low_confidence');
    assert.equal(result.verdict, null);
  });
});
