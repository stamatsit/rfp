-- 008: Screenshot library. One row per screenshot captured by Image Toolkit's
-- "Capture from URL" tool. Bytes live in the PRIVATE Supabase Storage bucket
-- "screenshots" (scripts/create-screenshots-bucket.mjs); this table is metadata.
-- Apply with (see docs/in-progress/screenshot-library.md):
--   npm run whichdb        (must say rfp-prod)
--   a throwaway script using the server postgres client; no psql on this machine
-- Rollback: 008_screenshot_captures_DOWN.sql
-- RLS matches 002/005/007: enabled on the table, no permissive policies. Server
-- connections bypass RLS as owner; PostgREST exposure is blocked.

CREATE TABLE IF NOT EXISTS screenshot_captures (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url               text NOT NULL,                       -- as requested
  url_key           text NOT NULL,                       -- normalized identity of the page (see screenshotLibrary.ts)
  domain            text NOT NULL,                       -- hostname without www, lowercase
  viewport          text NOT NULL CHECK (viewport IN ('desktop', 'mobile')),
  bucket            text NOT NULL DEFAULT 'screenshots',
  storage_key       text NOT NULL UNIQUE,                -- <domain>/<yyyy-mm>/<slug>-<viewport>-<ts>-<hash>.png
  file_size         integer NOT NULL,
  width             integer,
  height            integer,
  provider          text NOT NULL,                       -- 'screenshotone' | 'microlink'
  captured_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  captured_by_name  text,
  captured_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS screenshot_captures_domain_at_idx
  ON screenshot_captures (domain, captured_at DESC);
CREATE INDEX IF NOT EXISTS screenshot_captures_key_vp_at_idx
  ON screenshot_captures (url_key, viewport, captured_at DESC);

ALTER TABLE screenshot_captures ENABLE ROW LEVEL SECURITY;
