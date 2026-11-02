-- 0011_retention_grants.sql
-- The 24-hour purge updates image_key and image_deleted_at on both tables. The system role had
-- only SELECT on them, so the job would have failed the first time it found an expired row.
-- Grants stay narrow: UPDATE on exactly the two columns' tables the purge owns, nothing else.

GRANT UPDATE ON skin_analyses TO freshskin_system;
GRANT UPDATE ON scans TO freshskin_system;
