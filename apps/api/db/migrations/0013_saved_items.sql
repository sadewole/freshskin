-- 0013_saved_items.sql — wishlist and owned lists.
--
-- Removing an item is a soft delete, and the uniqueness that matters is "one live row per
-- (user, product, list)", so it is a partial unique index rather than a plain constraint:
-- otherwise re-saving something after removing it would collide with the tombstone.

CREATE TYPE saved_list AS ENUM ('wishlist', 'owned');

CREATE TABLE saved_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  list        saved_list NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);

CREATE UNIQUE INDEX saved_items_live_unique
  ON saved_items (user_id, product_id, list)
  WHERE deleted_at IS NULL;

CREATE INDEX saved_items_user_list_idx ON saved_items (user_id, list) WHERE deleted_at IS NULL;

ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_items FORCE ROW LEVEL SECURITY;
CREATE POLICY saved_items_owner ON saved_items
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON saved_items TO freshskin_app;
GRANT SELECT ON saved_items TO freshskin_system;
