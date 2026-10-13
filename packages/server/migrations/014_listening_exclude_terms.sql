-- 014: Topic Ideation words to leave out ("negative keywords"). Additive only.
-- A topic can carry up to eight words or phrases, set when it is first scanned.
-- Every search for it carries them as leave-out operators, and no post that
-- mentions one is counted in its report (listening/exclude.ts). Existing
-- topics get an empty list and behave as before.
-- Apply after confirming rfp-prod (host check or `npm run whichdb`), before
-- deploying code that selects exclude_terms.
-- Rollback: 014_listening_exclude_terms_DOWN.sql

ALTER TABLE listening_topics ADD COLUMN IF NOT EXISTS exclude_terms jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE listening_topics DROP CONSTRAINT IF EXISTS listening_topics_exclude_terms_check;
ALTER TABLE listening_topics ADD CONSTRAINT listening_topics_exclude_terms_check
  CHECK (jsonb_typeof(exclude_terms) = 'array' AND jsonb_array_length(exclude_terms) <= 8);
