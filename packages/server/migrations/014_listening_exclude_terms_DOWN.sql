-- Rollback for 014. Topics keep everything already collected; their leave-out lists are dropped.
ALTER TABLE listening_topics DROP CONSTRAINT IF EXISTS listening_topics_exclude_terms_check;
ALTER TABLE listening_topics DROP COLUMN IF EXISTS exclude_terms;
