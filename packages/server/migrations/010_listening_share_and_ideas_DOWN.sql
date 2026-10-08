-- Rollback for 010_listening_share_and_ideas.sql. Drops the idea board (and every saved
-- idea) and the sharing columns; topics themselves are untouched.
DROP TABLE IF EXISTS listening_saved_ideas;
DROP INDEX IF EXISTS listening_topics_shared_idx;
DROP INDEX IF EXISTS listening_topics_owner_idx;
ALTER TABLE listening_topics DROP COLUMN IF EXISTS shared_at;
ALTER TABLE listening_topics DROP COLUMN IF EXISTS shared;
