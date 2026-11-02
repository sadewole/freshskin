-- 0006_scans.sql — the ingredient-scan lifecycle and its database-enforced invariants.
--
-- Two rules are enforced twice: once in the branded types (src/scans/verdict.ts) so a
-- developer gets a compile error, and once here so a backfill, a script, or psql cannot
-- write the same wrong row.

CREATE TYPE scan_kind AS ENUM ('ingredient_label', 'bottle');
CREATE TYPE scan_status AS ENUM ('queued', 'processing', 'complete', 'failed', 'low_confidence');
CREATE TYPE scan_verdict AS ENUM ('good', 'okay', 'avoid');

CREATE TABLE scans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind              scan_kind NOT NULL,
  -- Nullable: the 24h purge nulls it, so every read path is forced to handle "purged".
  image_key         text,
  image_deleted_at  timestamptz,
  status            scan_status NOT NULL DEFAULT 'queued',
  raw_text          text,
  parsed            jsonb,
  matched_count     int,
  -- This is the scan-parse rate. It is NOT products.inci_match_rate (catalogue quality);
  -- the two thresholds answer different questions and must never be unified.
  match_rate        numeric(3, 2),
  verdict           scan_verdict,
  confidence        numeric(3, 2),
  model_version     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT verdict_requires_sufficient_parse CHECK (
    verdict IS NULL OR (match_rate >= 0.60 AND matched_count >= 5)
  ),
  CONSTRAINT complete_has_results CHECK (
    status <> 'complete' OR (parsed IS NOT NULL AND match_rate IS NOT NULL)
  ),
  CONSTRAINT low_confidence_has_no_verdict CHECK (
    status <> 'low_confidence' OR verdict IS NULL
  )
);

CREATE INDEX scans_user_created_idx ON scans (user_id, created_at DESC);
CREATE INDEX scans_queued_idx ON scans (status) WHERE status = 'queued';

CREATE TABLE scan_findings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id        uuid NOT NULL REFERENCES scans (id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ingredient_id  uuid REFERENCES ingredients (id),
  label          text NOT NULL,
  severity       text NOT NULL CHECK (severity IN ('beneficial', 'neutral', 'caution', 'avoid')),
  reason         text NOT NULL,
  source         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX scan_findings_scan_idx ON scan_findings (scan_id);

ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans FORCE ROW LEVEL SECURITY;
CREATE POLICY scans_owner ON scans
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE scan_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_findings FORCE ROW LEVEL SECURITY;
CREATE POLICY scan_findings_owner ON scan_findings
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON scans TO freshskin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON scan_findings TO freshskin_app;
GRANT SELECT ON scans, scan_findings TO freshskin_system;
