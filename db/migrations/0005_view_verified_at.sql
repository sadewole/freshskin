-- 0005_view_verified_at.sql
-- The candidate ordering (design decision D2) is data_confidence, then verified_at, then id.
-- The gated view must expose verified_at for that ordering to be expressible without reading
-- the base table, which the app role cannot do.
DROP VIEW IF EXISTS v_product_recommendable;

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
  p.verified_at,
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

GRANT SELECT ON v_product_recommendable TO freshskin_app;
