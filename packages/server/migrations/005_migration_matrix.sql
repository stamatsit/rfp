-- 005: Migration Matrix tables (mm_*). Apply with:
--   npm run whichdb        (must say rfp-prod)
--   psql "$DATABASE_URL" -f packages/server/migrations/005_migration_matrix.sql
-- Rollback: 005_migration_matrix_DOWN.sql
-- RLS matches the pattern in 002_enable_rls_all_tables.sql: no permissive
-- policies; server-side connections bypass RLS, PostgREST exposure blocked.

CREATE TABLE IF NOT EXISTS mm_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  contract     text NOT NULL,
  source       text NOT NULL DEFAULT 'mac-agent',
  source_hash  text NOT NULL,
  week_label   text,
  data         jsonb NOT NULL,
  facts        jsonb NOT NULL,
  findings     jsonb NOT NULL DEFAULT '[]',
  CONSTRAINT mm_snapshots_source_chk
    CHECK (source IN ('mac-agent','github-action','graph','manual'))
);
CREATE INDEX IF NOT EXISTS mm_snapshots_created_idx ON mm_snapshots (created_at DESC);
ALTER TABLE mm_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS mm_projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  archived     boolean NOT NULL DEFAULT false,
  archived_by  text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS mm_projects_name_lower_idx ON mm_projects (lower(name));
ALTER TABLE mm_projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS mm_ingest_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  outcome      text NOT NULL,
  snapshot_id  uuid REFERENCES mm_snapshots(id) ON DELETE SET NULL,
  detail       text,
  CONSTRAINT mm_ingest_log_outcome_chk
    CHECK (outcome IN ('stored','deduped','rejected','heartbeat'))
);
CREATE INDEX IF NOT EXISTS mm_ingest_log_created_idx ON mm_ingest_log (created_at DESC);
ALTER TABLE mm_ingest_log ENABLE ROW LEVEL SECURITY;
