-- Rollback for 009_listening.sql. Drops every Topic Ideation table and its data.
DROP TABLE IF EXISTS listening_items;
DROP TABLE IF EXISTS listening_runs;
DROP TABLE IF EXISTS listening_topics;
DROP TABLE IF EXISTS listening_cache;
