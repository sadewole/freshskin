import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { createAnonymousSession, resolveSession, revokeSession } from '../src/auth/session.js';
import {
  ConsentMissing,
  loadConsents,
  recordConsent,
  UnderageBlocked,
} from '../src/consent/consent.js';
import { closePools } from '../src/db/close.js';
import { withUser } from '../src/db/client.js';
import { submitScan } from '../src/scans/service.js';

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

const hasDb = await reachable();
const minorId = randomUUID();

describe('sessions', { skip: hasDb ? false : 'database unreachable' }, () => {
  it('issues an anonymous session that resolves to its user', async () => {
    const { token, userId } = await createAnonymousSession();
    assert.ok(token.length >= 32);
    assert.equal(await resolveSession(token), userId);
  });

  it('does not resolve a token it never issued', async () => {
    assert.equal(await resolveSession('not-a-real-token'), null);
    assert.equal(await resolveSession(''), null);
  });

  it('stops resolving a revoked session', async () => {
    const { token } = await createAnonymousSession();
    assert.equal(await revokeSession(token), true);
    assert.equal(await resolveSession(token), null);
    assert.equal(await revokeSession(token), false, 'revoking twice is a no-op');
  });

  it('expires a session that was issued in the past', async () => {
    const { token } = await createAnonymousSession(-1);
    assert.equal(await resolveSession(token), null);
  });

  it('stores only a hash, never the token itself', async () => {
    const { token } = await createAnonymousSession();
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try {
      const { rows } = await admin.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM sessions WHERE token_hash = $1',
        [token],
      );
      assert.equal(rows[0]?.n, 0, 'the raw token must not appear in the table');
    } finally {
      await admin.end();
    }
  });
});

describe('consent ledger', { skip: hasDb ? false : 'database unreachable' }, () => {
  before(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query('INSERT INTO users (id, email, age_band) VALUES ($1, $2, $3)', [
      minorId,
      `minor-${minorId}@example.test`,
      'under_16',
    ]);
    await admin.end();
  });

  after(async () => {
    const admin = new pg.Client({ connectionString: ADMIN_URL });
    await admin.connect();
    await admin.query('DELETE FROM users WHERE id = $1', [minorId]);
    await admin.end();
  });

  it('starts with nothing granted', async () => {
    const { userId } = await createAnonymousSession();
    assert.deepEqual(await loadConsents(userId), {
      terms: false,
      privacy: false,
      image_processing: false,
      model_training: false,
      marketing: false,
    });
  });

  it('takes the latest record per kind, so withdrawal is an append', async () => {
    const { userId } = await createAnonymousSession();
    await recordConsent(userId, 'image_processing', true, '2026-11-01');
    assert.equal((await loadConsents(userId)).image_processing, true);

    await recordConsent(userId, 'image_processing', false, '2026-11-01');
    assert.equal((await loadConsents(userId)).image_processing, false);
  });

  it('refuses an image-backed scan without image consent', async () => {
    const { userId } = await createAnonymousSession();
    await assert.rejects(
      () => submitScan(userId, { kind: 'ingredient_label', imageKey: 'img-1' }),
      (error: unknown) => error instanceof ConsentMissing,
    );
  });

  it('enforces the same rule in the database, below the service', async () => {
    const { userId } = await createAnonymousSession();
    await assert.rejects(
      () =>
        withUser(userId, (client) =>
          client.query(
            `INSERT INTO scans (user_id, kind, image_key, status) VALUES ($1, 'ingredient_label', 'x', 'queued')`,
            [userId],
          ),
        ),
      (error: unknown) => (error as { code?: string }).code === '42501',
    );
  });

  it('allows a scan once image consent is recorded', async () => {
    const { userId } = await createAnonymousSession();
    await recordConsent(userId, 'image_processing', true, '2026-11-01');
    const { scanId } = await submitScan(userId, { kind: 'ingredient_label', imageKey: 'img-2' });
    assert.ok(scanId.length > 0);
  });

  it('blocks an under-16 user from consenting to terms', async () => {
    await assert.rejects(
      () => recordConsent(minorId, 'terms', true, '2026-11-01'),
      (error: unknown) => error instanceof UnderageBlocked,
    );
  });
});

// Pools are process-level, so they are closed once after every suite in this file.
after(async () => {
  await closePools();
});
