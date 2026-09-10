-- Rollback for 008_client_portal.sql. Drops every portal table; the storage
-- bucket `portal-images` must be emptied and removed separately.
DROP TABLE IF EXISTS portal_images;
DROP TABLE IF EXISTS portal_client_domains;
DROP TABLE IF EXISTS portal_users;
