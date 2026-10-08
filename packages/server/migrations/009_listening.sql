-- 009: Topic Ideation (social listening for content ideas).
-- A topic is a saved search; items accumulate across runs (rescans), unique per
-- topic by canonical URL; labels are stored per item; the latest report is
-- rebuilt after each run. See docs/in-progress/social-listening.md.
-- Apply with:
--   npm run whichdb        (must say rfp-prod)
--   a throwaway script using the server postgres client; no psql on this machine
-- Rollback: 009_listening_DOWN.sql
-- RLS matches 002/005/007/008: enabled, no permissive policies. Server
-- connections bypass RLS as owner; PostgREST exposure is blocked.

CREATE TABLE IF NOT EXISTS listening_topics (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by       text NOT NULL,                        -- session email
  query            text NOT NULL,
  time_window      text NOT NULL DEFAULT '1y' CHECK (time_window IN ('3m', '1y', 'any')),
  plan             jsonb,                                -- searches, cursors, disambiguation
  report           jsonb,                                -- latest Report (see listening/types.ts)
  item_count       integer NOT NULL DEFAULT 0,
  relevant_count   integer NOT NULL DEFAULT 0,
  sentiment_score  integer,
  headline         text,
  last_run_at      timestamptz,
  last_run_status  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listening_topics_updated_idx ON listening_topics (updated_at DESC);

CREATE TABLE IF NOT EXISTS listening_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id          uuid NOT NULL REFERENCES listening_topics(id) ON DELETE CASCADE,
  created_by        text NOT NULL,
  trigger           text NOT NULL CHECK (trigger IN ('initial', 'rescan', 'rebuild')),
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'complete', 'failed', 'cancelled')),
  cancel_requested  boolean NOT NULL DEFAULT false,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  new_items         integer NOT NULL DEFAULT 0,
  total_items       integer NOT NULL DEFAULT 0,
  relevant_items    integer NOT NULL DEFAULT 0,
  sentiment_score   integer,
  search_calls      integer NOT NULL DEFAULT 0,
  youtube_units     integer NOT NULL DEFAULT 0,
  cost_usd          numeric(10, 4) NOT NULL DEFAULT 0,
  coverage          jsonb,
  error             text
);

CREATE INDEX IF NOT EXISTS listening_runs_topic_idx ON listening_runs (topic_id, started_at DESC);
-- At most one running scan per topic, enforced by the database rather than by a race-prone check.
CREATE UNIQUE INDEX IF NOT EXISTS listening_runs_one_active_idx ON listening_runs (topic_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS listening_runs_started_idx ON listening_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS listening_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id           uuid NOT NULL REFERENCES listening_topics(id) ON DELETE CASCADE,
  first_seen_run_id  uuid REFERENCES listening_runs(id) ON DELETE SET NULL,
  url                text NOT NULL,
  canonical_url      text NOT NULL,
  platform           text NOT NULL,
  kind               text NOT NULL,
  title              text NOT NULL DEFAULT '',
  body               text NOT NULL DEFAULT '',
  author             text,
  published_at       timestamptz,
  engagement         jsonb,
  parent_url         text,
  lane               text NOT NULL,
  depth              text NOT NULL CHECK (depth IN ('snippet', 'full')),
  labels             jsonb,                               -- ItemLabels, null until labeled
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topic_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS listening_items_topic_idx ON listening_items (topic_id, created_at);
CREATE INDEX IF NOT EXISTS listening_items_unlabeled_idx ON listening_items (topic_id) WHERE labels IS NULL;

-- Search/API response cache shared by all runs (protects the 100/day Google allowance).
CREATE TABLE IF NOT EXISTS listening_cache (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  expires_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS listening_cache_expires_idx ON listening_cache (expires_at);

ALTER TABLE listening_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_runs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_cache  ENABLE ROW LEVEL SECURITY;
