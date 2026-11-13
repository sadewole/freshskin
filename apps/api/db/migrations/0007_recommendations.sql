-- 0007_recommendations.sql
-- Recommendations are persisted because §12.3 returns a recommendation_id, §feedback references
-- it, and §14.6 requires a stored reason that never changes on refresh. The unique key makes a
-- repeated request a replay rather than a duplicate write.

CREATE TYPE rec_kind AS ENUM ('cream', 'perfume', 'similar', 'pairing');
CREATE TYPE feedback_action AS ENUM ('view', 'save', 'dismiss', 'rate', 'purchase_intent');
CREATE TYPE dismiss_reason AS ENUM ('too_expensive', 'wrong_scent', 'wrong_skin', 'already_own', 'not_available', 'other');

CREATE TABLE recommendations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Derived from the pipeline inputs, so an identical request maps to the same session.
  session_id         uuid NOT NULL,
  kind               rec_kind NOT NULL,
  product_id         uuid NOT NULL REFERENCES products (id),
  rank               smallint NOT NULL CHECK (rank > 0),
  score              numeric(4, 1) NOT NULL CHECK (score >= 0 AND score <= 100),
  breakdown          jsonb NOT NULL,
  reason_text        text NOT NULL,
  algorithm_version  text NOT NULL,
  profile_version    text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_rank_per_product_per_session UNIQUE (session_id, product_id)
);

CREATE INDEX recommendations_user_created_idx ON recommendations (user_id, created_at DESC);

CREATE TABLE feedback (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id  uuid NOT NULL REFERENCES recommendations (id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  action             feedback_action NOT NULL,
  dismiss_reason     dismiss_reason,
  rating             smallint CHECK (rating BETWEEN 1 AND 5),
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT one_row_per_recommendation_action UNIQUE (recommendation_id, action),
  CONSTRAINT rating_required_for_rate CHECK (action <> 'rate' OR rating IS NOT NULL)
);

CREATE INDEX feedback_user_idx ON feedback (user_id);

ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendations FORCE ROW LEVEL SECURITY;
CREATE POLICY recommendations_owner ON recommendations
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_owner ON feedback
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON recommendations TO freshskin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON feedback TO freshskin_app;
GRANT SELECT ON recommendations, feedback TO freshskin_system;
