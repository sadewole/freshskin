-- 0008_lexicon_view.sql
-- The label matcher needs INCI names and aliases, but the app role cannot read `ingredients`.
-- This view exposes exactly the matching lexicon and nothing else: no risk ratings, no evidence
-- grades, no advisory notes.

CREATE VIEW v_ingredient_lexicon WITH (security_invoker = false) AS
SELECT
  i.id AS ingredient_id,
  i.inci_name,
  i.aliases
FROM ingredients i;

GRANT SELECT ON v_ingredient_lexicon TO freshskin_app;
