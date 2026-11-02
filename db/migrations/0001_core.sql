-- 0001_core.sql — roles, core tables, RLS.
-- Hand-written SQL is the source of truth (design decision: drizzle-kit coverage risk).

-- ---------------------------------------------------------------------------
-- Roles. Three, with distinct capabilities.
--   freshskin_app     : request path. No BYPASSRLS. No SELECT on catalogue base tables.
--   freshskin_system  : workers only. BYPASSRLS.
--   freshskin_support : read-only, narrow views only.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freshskin_app') THEN
    CREATE ROLE freshskin_app LOGIN PASSWORD 'app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freshskin_system') THEN
    CREATE ROLE freshskin_system LOGIN PASSWORD 'system' BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'freshskin_support') THEN
    CREATE ROLE freshskin_support LOGIN PASSWORD 'support';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS app;

-- The only reader of the request's identity. `true` = missing setting returns NULL,
-- so an unset context yields no rows rather than an error.
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
CREATE TYPE product_category AS ENUM ('cream', 'perfume');

CREATE TABLE brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  country     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fragrance_families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  parent_id   uuid REFERENCES fragrance_families (id),
  sort_order  int NOT NULL DEFAULT 0
);

CREATE TABLE ingredients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inci_name           text NOT NULL UNIQUE,
  aliases             text[] NOT NULL DEFAULT '{}',
  common_name         text,
  functions           text[] NOT NULL DEFAULT '{}',
  comedogenic_rating  smallint CHECK (comedogenic_rating BETWEEN 0 AND 5),
  irritation_risk     text CHECK (irritation_risk IN ('none', 'low', 'moderate', 'high')),
  is_allergen         boolean NOT NULL DEFAULT false,
  evidence_grade      text CHECK (evidence_grade IN ('A', 'B', 'C', 'D')),
  needs_review        boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         uuid NOT NULL REFERENCES brands (id),
  category         product_category NOT NULL,
  name             text NOT NULL,
  slug             text NOT NULL,
  description      text,
  attributes       jsonb NOT NULL,
  data_confidence  numeric(3, 2) NOT NULL DEFAULT 0,
  -- catalogue coverage of the INCI list. NOT the scan-parse rate; they are different questions.
  inci_match_rate  numeric(3, 2),
  is_active        boolean NOT NULL DEFAULT true,
  verified_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Promoted out of jsonb so filtering is indexed and logic never reads `unknown`.
  richness        text GENERATED ALWAYS AS (attributes ->> 'richness') STORED,
  fragrance_free  boolean GENERATED ALWAYS AS (
    CASE WHEN jsonb_typeof(attributes -> 'fragrance_free') = 'boolean'
         THEN (attributes ->> 'fragrance_free')::boolean ELSE NULL END
  ) STORED,
  -- The single gating predicate (§15.4). No handler can write it.
  status          text GENERATED ALWAYS AS (
    CASE
      WHEN data_confidence < 0.70 THEN 'draft'
      WHEN category = 'cream' AND COALESCE(inci_match_rate, 0) < 0.95 THEN 'draft'
      ELSE 'ready'
    END
  ) STORED,

  CONSTRAINT products_slug_unique UNIQUE (brand_id, slug),
  CONSTRAINT cream_attributes_shape CHECK (
    category <> 'cream' OR (
      jsonb_typeof(attributes -> 'fragrance_free') = 'boolean'
      AND attributes ->> 'richness' IN ('light', 'medium', 'rich')
    )
  )
);

CREATE INDEX products_recommendable_idx ON products (category, status, is_active, verified_at DESC);
CREATE INDEX products_richness_idx ON products (richness);
CREATE INDEX products_fragrance_free_idx ON products (fragrance_free);

CREATE TABLE product_variants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  size_ml         numeric(6, 1) NOT NULL,
  price_ngn       integer NOT NULL CHECK (price_ngn >= 0),
  availability    text NOT NULL DEFAULT 'unknown'
                  CHECK (availability IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  retailer_id     text,
  last_checked_at timestamptz
);

CREATE INDEX product_variants_cheapest_idx ON product_variants (product_id, price_ngn);

CREATE TABLE product_ingredients (
  product_id          uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  ingredient_id       uuid NOT NULL REFERENCES ingredients (id),
  position            int NOT NULL CHECK (position > 0),
  concentration_band  text CHECK (concentration_band IN ('>1%', '0.1-1%', '<0.1%', 'unknown')),
  PRIMARY KEY (product_id, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text UNIQUE,
  market      text NOT NULL DEFAULT 'NG',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  skin_type   text NOT NULL DEFAULT 'unsure'
              CHECK (skin_type IN ('dry', 'normal', 'oily', 'combination', 'unsure')),
  concerns    text[] NOT NULL DEFAULT '{}',
  climate_zone text NOT NULL DEFAULT 'hot_humid'
              CHECK (climate_zone IN ('hot_humid', 'hot_dry', 'temperate', 'cold')),
  budget_max_ngn integer,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sensitivities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ingredient_id  uuid REFERENCES ingredients (id),
  free_text      text,
  severity       text NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe')),
  applies_to     text[] NOT NULL DEFAULT '{cream,perfume}',
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sensitivities_user_idx ON sensitivities (user_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- RLS: every user-owned row
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_owner ON profiles
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

ALTER TABLE sensitivities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensitivities FORCE ROW LEVEL SECURITY;
CREATE POLICY sensitivities_owner ON sensitivities
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());
