import type pg from 'pg';
import { withUser } from '../db/client.js';
import { assessParse, decideVerdict, deriveFindings, type Finding, type ParsedToken, type ScanSubject, type Verdict } from './verdict.js';

/**
 * Scan persistence. The guarded UPDATE is the concurrency control: a scan can only leave
 * `processing` once, so two workers finalising the same job produce one result and one 409,
 * never two verdicts.
 */

export class ScanNotInFlight extends Error {
  constructor(scanId: string) {
    super(`scan ${scanId} is not in flight`);
    this.name = 'ScanNotInFlight';
  }
}

export interface ScanResult {
  readonly scanId: string;
  readonly status: 'complete' | 'low_confidence';
  readonly verdict: Verdict | null;
  readonly findings: readonly Finding[];
  readonly matchRate: number;
  readonly matched: number;
  /** Set only when we refused to judge, so the client can explain the retake. */
  readonly insufficientReason: 'empty_label' | 'too_few_recognised' | 'match_rate_too_low' | null;
}

export async function submitScan(
  userId: string,
  input: { kind: 'ingredient_label' | 'bottle'; imageKey: string | null },
): Promise<{ scanId: string }> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO scans (user_id, kind, image_key, status)
       VALUES ($1, $2, $3, 'queued')
       RETURNING id`,
      [userId, input.kind, input.imageKey],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('scan insert returned no row');
    return { scanId: id };
  });
}

export async function completeScan(
  userId: string,
  scanId: string,
  tokens: readonly ParsedToken[],
  subject: ScanSubject,
): Promise<ScanResult> {
  const parse = assessParse(tokens);

  return withUser(userId, async (client) => {
    // Claim the transition first: queued -> processing is a separate step in the worker, so
    // by the time we finalise, `processing` is the only legal source state.
    const claimed = await client.query<{ id: string }>(
      `UPDATE scans
          SET status = 'processing', updated_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'queued'
        RETURNING id`,
      [scanId, userId],
    );

    if (claimed.rowCount === 0) {
      const { rows } = await client.query<{ status: string }>(
        'SELECT status FROM scans WHERE id = $1 AND user_id = $2',
        [scanId, userId],
      );
      const status = rows[0]?.status;
      if (status === undefined) throw new ScanNotInFlight(scanId);
      if (status !== 'processing') throw new ScanNotInFlight(scanId);
    }

    if (!parse.usable) {
      const insufficient = parse;
      const { rowCount } = await client.query(
        `UPDATE scans
            SET status = 'low_confidence',
                parsed = $3::jsonb,
                matched_count = $4,
                match_rate = $5,
                verdict = NULL,
                updated_at = now()
          WHERE id = $1 AND user_id = $2 AND status = 'processing'`,
        [scanId, userId, JSON.stringify(tokens), insufficient.matched, insufficient.matchRate.toFixed(2)],
      );
      if (rowCount === 0) throw new ScanNotInFlight(scanId);

      return {
        scanId,
        status: 'low_confidence',
        verdict: null,
        findings: [],
        matchRate: insufficient.matchRate,
        matched: insufficient.matched,
        insufficientReason: insufficient.reason,
      };
    }

    const findings = deriveFindings(subject);
    const verdict = decideVerdict(parse, findings);

    const { rowCount } = await client.query(
      `UPDATE scans
          SET status = 'complete',
              parsed = $3::jsonb,
              matched_count = $4,
              match_rate = $5,
              verdict = $6,
              updated_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'processing'`,
      [
        scanId,
        userId,
        JSON.stringify(tokens),
        parse.matched,
        parse.matchRate.toFixed(2),
        verdict.kind === 'insufficient_evidence' ? null : verdict.kind,
      ],
    );
    if (rowCount === 0) throw new ScanNotInFlight(scanId);

    await insertFindings(client, userId, scanId, findings);

    return {
      scanId,
      status: 'complete',
      verdict,
      findings,
      matchRate: parse.matchRate,
      matched: parse.matched,
      insufficientReason: null,
    };
  });
}

async function insertFindings(
  client: pg.PoolClient,
  userId: string,
  scanId: string,
  findings: readonly Finding[],
): Promise<void> {
  for (const finding of findings) {
    await client.query(
      `INSERT INTO scan_findings (scan_id, user_id, label, severity, reason, source)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [scanId, userId, finding.label, finding.severity, finding.reason, finding.source ?? null],
    );
  }
}

export interface ScanView {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly verdict: string | null;
  readonly matchRate: number | null;
  readonly matchedCount: number | null;
  readonly imageKey: string | null;
  readonly createdAt: Date;
}

export async function getScan(userId: string, scanId: string): Promise<ScanView | null> {
  return withUser(userId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      kind: string;
      status: string;
      verdict: string | null;
      match_rate: string | null;
      matched_count: number | null;
      image_key: string | null;
      created_at: Date;
    }>(
      `SELECT id, kind, status, verdict, match_rate, matched_count, image_key, created_at
         FROM scans WHERE id = $1 AND user_id = $2`,
      [scanId, userId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      verdict: row.verdict,
      matchRate: row.match_rate === null ? null : Number(row.match_rate),
      matchedCount: row.matched_count,
      imageKey: row.image_key,
      createdAt: row.created_at,
    };
  });
}
