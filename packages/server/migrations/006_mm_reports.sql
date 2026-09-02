-- 006: Migration Matrix morning reports. Apply with:
--   npm run whichdb   (must say rfp-prod)
--   then run via node/psql. Rollback: DROP TABLE IF EXISTS mm_reports;
CREATE TABLE IF NOT EXISTS mm_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  report_date  date NOT NULL,
  audience     text NOT NULL,           -- 'crystal' or a migrator name
  body         text NOT NULL,
  snapshot_id  uuid REFERENCES mm_snapshots(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS mm_reports_date_idx ON mm_reports (report_date DESC);
ALTER TABLE mm_reports ENABLE ROW LEVEL SECURITY;
