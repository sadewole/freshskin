-- 0009_perfumes.sql — the fragrance half of the catalogue and the scent quiz.
--
-- Perfumes carry notes and families instead of an INCI list. The cream gate (95% INCI match)
-- does not apply to them: their readiness is data confidence plus a populated note pyramid.

ALTER TABLE products
  ADD COLUMN concentration  text CHECK (concentration IN ('edc', 'edt', 'edp', 'parfum', 'extrait')),
  ADD COLUMN performance    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN occasion_tags  text[] NOT NULL DEFAULT '{}',
  -- Decision D1: a canonical family table, referenced rather than spelled in free text.
  ADD COLUMN family_ids     uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE fragrance_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  family_id   uuid REFERENCES fragrance_families (id),
  descriptor  text,
  volatility  smallint CHECK (volatility BETWEEN 1 AND 5)
);

CREATE TABLE product_notes (
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  note_id     uuid NOT NULL REFERENCES fragrance_notes (id),
  layer       text NOT NULL CHECK (layer IN ('top', 'heart', 'base')),
  prominence  smallint NOT NULL DEFAULT 2 CHECK (prominence BETWEEN 1 AND 3),
  PRIMARY KEY (product_id, note_id)
);

CREATE TABLE fragrance_profiles (
  user_id            uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  families_liked     text[] NOT NULL DEFAULT '{}',
  families_disliked  text[] NOT NULL DEFAULT '{}',
  notes_loved        text[] NOT NULL DEFAULT '{}',
  notes_avoided      text[] NOT NULL DEFAULT '{}',
  strength_pref      text NOT NULL DEFAULT 'moderate'
                     CHECK (strength_pref IN ('light', 'moderate', 'strong', 'very_strong')),
  occasions          text[] NOT NULL DEFAULT '{}',
  budget_min_ngn     integer,
  budget_max_ngn     integer,
  quiz_version       text,
  completed_at       timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT disliked_and_liked_disjoint CHECK (
    NOT (families_liked && families_disliked)
  )
);

ALTER TABLE fragrance_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fragrance_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY fragrance_profiles_owner ON fragrance_profiles
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON fragrance_profiles TO freshskin_app;

-- Perfume candidates need notes and families, which the app role cannot read from base tables.
CREATE VIEW v_perfume_recommendable WITH (security_invoker = false) AS
SELECT
  p.id,
  p.name,
  p.slug,
  b.name AS brand_name,
  p.data_confidence,
  p.verified_at,
  p.concentration,
  p.performance,
  p.occasion_tags,
  p.family_ids,
  ARRAY(SELECT f.name FROM fragrance_families f WHERE f.id = ANY (p.family_ids)) AS family_names,
  mv.price_ngn,
  mv.availability
FROM products p
JOIN brands b ON b.id = p.brand_id
LEFT JOIN LATERAL (
  SELECT v.price_ngn, v.availability
  FROM product_variants v
  WHERE v.product_id = p.id
  ORDER BY v.price_ngn ASC
  LIMIT 1
) mv ON true
WHERE p.category = 'perfume' AND p.status = 'ready' AND p.is_active;

CREATE VIEW v_perfume_notes WITH (security_invoker = false) AS
SELECT
  pn.product_id,
  pn.layer,
  pn.prominence,
  fn.name AS note_name
FROM product_notes pn
JOIN fragrance_notes fn ON fn.id = pn.note_id;

GRANT SELECT ON v_perfume_recommendable, v_perfume_notes TO freshskin_app;
