-- 0003_grants.sql
--
-- Privilege is the guarantee. A developer who writes `db.select().from(products)` as the app
-- role gets `permission denied` on the first test run, not a silent draft in production.

GRANT USAGE ON SCHEMA public TO freshskin_app, freshskin_system, freshskin_support;
GRANT USAGE ON SCHEMA app TO freshskin_app, freshskin_system;

GRANT EXECUTE ON FUNCTION app.current_user_id() TO freshskin_app, freshskin_system;

-- ---------------------------------------------------------------------------
-- freshskin_app: request path
-- ---------------------------------------------------------------------------
-- Catalogue base tables: explicitly revoked. Reads go through the views only.
REVOKE ALL ON products, product_variants, product_ingredients, ingredients, brands, fragrance_families
  FROM freshskin_app, freshskin_support;

GRANT SELECT ON v_product_recommendable, v_product_browse TO freshskin_app;

-- User-owned tables the request path writes. RLS constrains these to the current user.
GRANT SELECT, INSERT, UPDATE, DELETE ON profiles, sensitivities TO freshskin_app;
GRANT SELECT, INSERT, UPDATE ON users TO freshskin_app;

-- ---------------------------------------------------------------------------
-- freshskin_support: read-only, narrow
-- ---------------------------------------------------------------------------
GRANT SELECT ON v_support_product TO freshskin_support;

-- ---------------------------------------------------------------------------
-- freshskin_system: workers only
-- ---------------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO freshskin_system;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO freshskin_system;
