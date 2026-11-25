-- 0002_views.sql
--
-- Two classes of view, deliberately different:
--
--   Catalogue views are SECURITY DEFINER (owner = the migration role). The app role has no
--   privilege on the base tables, so it can only ever see this projection. There is no RLS on
--   catalogue tables to launder, because catalogue data is not user data.
--
--   User-data views (a later slice) are SECURITY INVOKER so RLS applies as the invoker.

-- Gated catalogue: §15.4 readiness is already a stored column, so it cannot drift.
CREATE VIEW v_product_recommendable WITH (security_invoker = false) AS
SELECT
  p.id,
  p.category,
  p.name,
  p.slug,
  b.name AS brand_name,
  p.richness,
  p.fragrance_free,
  p.data_confidence,
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
WHERE p.status = 'ready' AND p.is_active;

-- Browse may show drafts, labelled. A draft product is findable, never recommendable.
CREATE VIEW v_product_browse WITH (security_invoker = false) AS
SELECT
  p.id,
  p.category,
  p.name,
  p.slug,
  b.name AS brand_name,
  p.status,
  p.richness,
  p.fragrance_free,
  p.data_confidence,
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
WHERE p.is_active;

-- Support: operational visibility with no images, no attributes blob, no user data.
CREATE VIEW v_support_product WITH (security_invoker = false) AS
SELECT
  p.id,
  p.category,
  p.name,
  p.slug,
  b.name AS brand_name,
  p.status,
  p.data_confidence,
  p.inci_match_rate,
  p.verified_at
FROM products p
JOIN brands b ON b.id = p.brand_id
WHERE p.is_active;
