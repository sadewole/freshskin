-- 0014_routine_checkins_tips.sql — curated routine content, reviewed tips, weekly check-ins.
--
-- Routine steps and tips are curated data hunks, never branches: wording changes ship as a new
-- migration with a new content_version, never as edits. The ±1 day Lagos window on checked_on
-- tolerates the offline outbox (decision 0004); the server still computes the canonical day.

CREATE TYPE tip_topic AS ENUM ('routine', 'scent', 'sun', 'ingredients');
CREATE TYPE checkin_completion AS ENUM ('skipped', 'partly', 'done');
CREATE TYPE skin_feel AS ENUM ('drier', 'about_same', 'more_comfortable', 'not_sure');

CREATE TABLE routine_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  content_version text NOT NULL UNIQUE,
  audience        text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tips (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       tip_topic NOT NULL,
  body        text NOT NULL CHECK (char_length(body) <= 140),
  why         text NOT NULL CHECK (char_length(why) <= 140),
  inputs      text[] NOT NULL DEFAULT '{}',
  position    integer NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviewed_before_active CHECK (NOT active OR reviewed_at IS NOT NULL),
  UNIQUE (topic, position)
);

CREATE TABLE routine_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES routine_templates (id) ON DELETE CASCADE,
  position    integer NOT NULL CHECK (position >= 1 AND position <= 8),
  title       text NOT NULL,
  instruction text NOT NULL CHECK (char_length(instruction) <= 140),
  why         text NOT NULL CHECK (char_length(why) <= 140),
  inputs      text[] NOT NULL DEFAULT '{}',
  tip_id      uuid REFERENCES tips (id) ON DELETE SET NULL,
  UNIQUE (template_id, position)
);

CREATE TABLE check_ins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  checked_on  date NOT NULL,
  completion  checkin_completion NOT NULL,
  feel        skin_feel,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT check_ins_lagos_window CHECK (
    checked_on >= ((now() AT TIME ZONE 'Africa/Lagos')::date - 1)
    AND checked_on <= ((now() AT TIME ZONE 'Africa/Lagos')::date + 1)
  )
);

CREATE UNIQUE INDEX check_ins_live_unique
  ON check_ins (user_id, checked_on)
  WHERE deleted_at IS NULL;

CREATE INDEX check_ins_user_idx ON check_ins (user_id, checked_on DESC) WHERE deleted_at IS NULL;

ALTER TABLE routine_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY routine_templates_read ON routine_templates FOR SELECT USING (true);

ALTER TABLE routine_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE routine_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY routine_steps_read ON routine_steps FOR SELECT USING (true);

ALTER TABLE tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips FORCE ROW LEVEL SECURITY;
CREATE POLICY tips_read ON tips FOR SELECT USING (true);

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins FORCE ROW LEVEL SECURITY;
CREATE POLICY check_ins_owner ON check_ins
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT ON routine_templates, routine_steps, tips TO freshskin_app;
GRANT SELECT ON routine_templates, routine_steps, tips TO freshskin_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON check_ins TO freshskin_app;
GRANT SELECT ON check_ins TO freshskin_system;

-- Frozen seed: body-basic 1.0.0, reviewed once. Same strings as the Phase 1 web fixture.
INSERT INTO routine_templates (id, slug, title, content_version, audience) VALUES
  ('b0d1ba51-0000-4000-8000-000000000001', 'body-basic', 'A simple body routine', 'body-basic-1.0.0', '{}');

INSERT INTO tips (id, topic, body, why, inputs, position, active, reviewed_at) VALUES
  ('b0d1ba51-0000-4000-8000-000000000011', 'routine',
   'A short routine you repeat suits body skin better than a long one you skip.',
   'Consistency matters more than the number of steps for a body routine.',
   '{body skin}', 1, true, now()),
  ('b0d1ba51-0000-4000-8000-000000000012', 'scent',
   'Apply perfume after moisturiser so it settles on skin that is already conditioned.',
   'An unscented base lets a scent lead, which is the same logic as pairing.',
   '{cream,perfume}', 2, true, now()),
  ('b0d1ba51-0000-4000-8000-000000000013', 'sun',
   'SPF counts on arms and legs too, not only on skin you would call facial.',
   'Uncovered limbs take daily sun, which affects uneven tone over time.',
   '{arms,legs}', 3, true, now());

INSERT INTO routine_steps (id, template_id, position, title, instruction, why, inputs, tip_id) VALUES
  ('b0d1ba51-0000-4000-8000-000000000021', 'b0d1ba51-0000-4000-8000-000000000001', 1,
   'Wash gently',
   'Use lukewarm water and a gentle body wash, then pat dry.',
   'Hot water and harsh soap strip oils, which dry or sensitive body skin notices.',
   '{body skin,plain water}', NULL),
  ('b0d1ba51-0000-4000-8000-000000000022', 'b0d1ba51-0000-4000-8000-000000000001', 2,
   'Moisturise damp skin',
   'Smooth body cream over damp skin within a minute of drying.',
   'Cream holds water better on damp skin, which matters in hot, humid Lagos.',
   '{your skin type,Lagos humidity}', NULL),
  ('b0d1ba51-0000-4000-8000-000000000023', 'b0d1ba51-0000-4000-8000-000000000001', 3,
   'Protect uncovered skin',
   'Apply broad-spectrum SPF 30 or higher to arms and legs in direct sun.',
   'Sun exposure affects uneven tone, and SPF is the step most routines skip.',
   '{daily sun exposure}', NULL);
