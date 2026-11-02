-- 0012_auth_consent.sql — anonymous identity, sessions, and the consent ledger.
--
-- Consent is enforced by a trigger, not only by a service check, so a worker, a backfill, or
-- psql cannot insert a photo-backed row for a user who never granted image processing.

CREATE TYPE consent_kind AS ENUM ('terms', 'privacy', 'image_processing', 'model_training', 'marketing');

ALTER TABLE users
  ADD COLUMN status text NOT NULL DEFAULT 'active'
      CHECK (status IN ('anonymous', 'active', 'grace_period', 'deleted')),
  ADD COLUMN age_band text
      CHECK (age_band IN ('under_16', '16_17', '18_24', '25_34', '35_44', '45_plus'));

-- Append-only. Never updated, never deleted except by erasure.
CREATE TABLE consent_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind           consent_kind NOT NULL,
  policy_version text NOT NULL,
  granted        boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX consent_records_lookup_idx ON consent_records (user_id, kind, created_at DESC);

-- The raw token never touches the database, only its hash. A leaked table cannot be replayed.
CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);

CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Consent resolution
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.has_consent(p_user uuid, p_kind consent_kind) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT COALESCE((
      SELECT c.granted
        FROM consent_records c
       WHERE c.user_id = p_user AND c.kind = p_kind
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT 1
    ), false)
  $$;

CREATE FUNCTION app.require_image_consent() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NOT app.has_consent(NEW.user_id, 'image_processing') THEN
      RAISE EXCEPTION 'image processing consent has not been granted'
        USING ERRCODE = '42501', HINT = 'record an image_processing consent before storing images';
    END IF;
    RETURN NEW;
  END;
  $$;

CREATE TRIGGER skin_analyses_require_consent
  BEFORE INSERT ON skin_analyses
  FOR EACH ROW EXECUTE FUNCTION app.require_image_consent();

CREATE TRIGGER scans_require_consent
  BEFORE INSERT ON scans
  FOR EACH ROW EXECUTE FUNCTION app.require_image_consent();

-- ---------------------------------------------------------------------------
-- Session lifecycle as definer functions: the app can create and resolve its own session but
-- cannot select the sessions table, so one token cannot be enumerated from another.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app.create_anonymous_session(p_token_hash text, p_expires_at timestamptz)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_user_id uuid;
  BEGIN
    INSERT INTO users (status) VALUES ('anonymous') RETURNING id INTO v_user_id;
    INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (v_user_id, p_token_hash, p_expires_at);
    RETURN v_user_id;
  END;
  $$;

CREATE FUNCTION app.resolve_session(p_token_hash text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT s.user_id
      FROM sessions s
     WHERE s.token_hash = p_token_hash
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
     LIMIT 1
  $$;

CREATE FUNCTION app.revoke_session(p_token_hash text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_count integer;
  BEGIN
    UPDATE sessions SET revoked_at = now()
     WHERE token_hash = p_token_hash AND revoked_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count > 0;
  END;
  $$;

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
CREATE POLICY consent_records_owner ON consent_records
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT ON consent_records TO freshskin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO freshskin_system;
GRANT EXECUTE ON FUNCTION app.create_anonymous_session(text, timestamptz) TO freshskin_app;
GRANT EXECUTE ON FUNCTION app.resolve_session(text) TO freshskin_app;
GRANT EXECUTE ON FUNCTION app.revoke_session(text) TO freshskin_app;
GRANT EXECUTE ON FUNCTION app.has_consent(uuid, consent_kind) TO freshskin_app, freshskin_system;
