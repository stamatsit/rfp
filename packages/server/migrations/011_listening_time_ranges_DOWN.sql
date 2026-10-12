-- Rollback for 011_listening_time_ranges.sql. Topics scanned over a range the old
-- code does not know (1d, 1w, 1m, custom) are moved to "any time" first, so the
-- old constraint can be restored; their collected items are untouched.
ALTER TABLE listening_topics DROP CONSTRAINT IF EXISTS listening_topics_window_range_check;
ALTER TABLE listening_topics DROP CONSTRAINT IF EXISTS listening_topics_time_window_check;
UPDATE listening_topics SET time_window = 'any' WHERE time_window NOT IN ('3m', '1y', 'any');
ALTER TABLE listening_topics ADD CONSTRAINT listening_topics_time_window_check CHECK (time_window IN ('3m', '1y', 'any'));
ALTER TABLE listening_topics DROP COLUMN IF EXISTS window_to;
ALTER TABLE listening_topics DROP COLUMN IF EXISTS window_from;
