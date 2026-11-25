-- 0010_skin.sql — skin analyses and the 24-hour image window.
--
-- Two things are enforced here rather than in application code:
--   * a completed analysis must carry a usable confidence, and a low-confidence one must not
--     look complete, so a consumer cannot accidentally rank on a guess;
--   * the image key is nullable, so the purge can make "the photo is gone" a normal state.

CREATE TYPE skin_analysis_status AS ENUM ('queued', 'processing', 'complete', 'failed', 'low_confidence');
CREATE TYPE fitzpatrick_band AS ENUM ('I', 'II', 'III', 'IV', 'V', 'VI');
CREATE TYPE skin_undertone AS ENUM ('warm', 'cool', 'neutral', 'olive');

CREATE TABLE skin_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  image_key       text,
  image_deleted_at timestamptz,
  status          skin_analysis_status NOT NULL DEFAULT 'queued',
  tone_band       fitzpatrick_band,
  ita_degrees     numeric(5, 1) CHECK (ita_degrees BETWEEN -90 AND 90),
  undertone       skin_undertone,
  evenness_score  smallint CHECK (evenness_score BETWEEN 0 AND 100),
  texture_scores  jsonb,
  concerns        text[],
  confidence      numeric(3, 2) CHECK (confidence BETWEEN 0 AND 1),
  evidence        text[],
  error_code      text,
  model_version   text,
  capture_meta    jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,

  -- The confidence bands from §13.3, restated where a script cannot skip them.
  CONSTRAINT complete_requires_usable_confidence CHECK (
    status <> 'complete' OR (tone_band IS NOT NULL AND undertone IS NOT NULL AND confidence >= 0.55)
  ),
  CONSTRAINT low_confidence_is_below_threshold CHECK (
    status <> 'low_confidence' OR (confidence IS NOT NULL AND confidence < 0.55)
  ),
  CONSTRAINT failed_has_an_error CHECK (
    status <> 'failed' OR error_code IS NOT NULL
  )
);

CREATE INDEX skin_analyses_user_created_idx ON skin_analyses (user_id, created_at DESC);
CREATE INDEX skin_analyses_latest_idx ON skin_analyses (user_id, created_at DESC) WHERE status = 'complete';
-- Partial index on the side of the column that the purge selects.
CREATE INDEX skin_analyses_purge_idx ON skin_analyses (created_at) WHERE image_key IS NOT NULL;

ALTER TABLE profiles
  ADD COLUMN latest_analysis_id uuid REFERENCES skin_analyses (id) ON DELETE SET NULL;

ALTER TABLE skin_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE skin_analyses FORCE ROW LEVEL SECURITY;
CREATE POLICY skin_analyses_owner ON skin_analyses
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON skin_analyses TO freshskin_app;
GRANT SELECT ON skin_analyses TO freshskin_system;
