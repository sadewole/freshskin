-- 0004_ingredient_view.sql
-- Ingredients are needed to build a CosmeticSurface, but the app role cannot read the base
-- tables. A second definer view exposes exactly the columns the projection consumes.

CREATE VIEW v_product_ingredients WITH (security_invoker = false) AS
SELECT
  pi.product_id,
  i.id AS ingredient_id,
  i.inci_name,
  i.is_allergen,
  i.irritation_risk,
  i.comedogenic_rating,
  i.functions
FROM product_ingredients pi
JOIN ingredients i ON i.id = pi.ingredient_id;

GRANT SELECT ON v_product_ingredients TO freshskin_app;
GRANT SELECT ON v_product_ingredients TO freshskin_support;
