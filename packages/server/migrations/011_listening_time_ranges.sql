-- 011: Topic Ideation time ranges. Adds past 24 hours, week and month, and a
-- fixed custom range (first and last day). Existing topics keep their range:
-- every value allowed before is still allowed.
-- Apply after confirming rfp-prod (host check or `npm run whichdb`), before
-- deploying code that selects window_from/window_to.
-- Rollback: 011_listening_time_ranges_DOWN.sql

ALTER TABLE listening_topics ADD COLUMN IF NOT EXISTS window_from date;
ALTER TABLE listening_topics ADD COLUMN IF NOT EXISTS window_to date;

ALTER TABLE listening_topics DROP CONSTRAINT IF EXISTS listening_topics_time_window_check;
ALTER TABLE listening_topics ADD CONSTRAINT listening_topics_time_window_check
  CHECK (time_window IN ('1d', '1w', '1m', '3m', '1y', 'any', 'custom'));

-- A custom range always has both days, in order; presets never carry days.
ALTER TABLE listening_topics DROP CONSTRAINT IF EXISTS listening_topics_window_range_check;
ALTER TABLE listening_topics ADD CONSTRAINT listening_topics_window_range_check
  CHECK (
    (time_window = 'custom' AND window_from IS NOT NULL AND window_to IS NOT NULL AND window_from <= window_to)
    OR (time_window <> 'custom' AND window_from IS NULL AND window_to IS NULL)
  );
