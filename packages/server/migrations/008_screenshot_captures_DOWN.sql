-- Rollback for 008_screenshot_captures.sql. Drops the metadata table only; the
-- "screenshots" storage bucket and its objects are left in place on purpose.
DROP TABLE IF EXISTS screenshot_captures;
