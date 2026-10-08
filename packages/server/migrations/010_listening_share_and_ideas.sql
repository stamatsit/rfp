-- 010: Topic Ideation sharing and the idea board. Additive only.
-- Topics stay private to their creator unless shared; a shared topic can be read
-- and exported by anyone with Topic Ideation access, never rescanned or deleted.
-- Saved ideas are frozen copies (headline, outline, sources) so a rescan that
-- rewrites a topic's ideas never changes or removes them. Each person's board is
-- their own. See docs/in-progress/social-listening.md.
-- Apply with a throwaway script using the server postgres client, after
-- `npm run whichdb` (or a host check) confirms rfp-prod.
-- Rollback: 010_listening_share_and_ideas_DOWN.sql

ALTER TABLE listening_topics ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;
ALTER TABLE listening_topics ADD COLUMN IF NOT EXISTS shared_at timestamptz;
CREATE INDEX IF NOT EXISTS listening_topics_shared_idx ON listening_topics (updated_at DESC) WHERE shared;
CREATE INDEX IF NOT EXISTS listening_topics_owner_idx ON listening_topics (lower(created_by), updated_at DESC);

CREATE TABLE IF NOT EXISTS listening_saved_ideas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   text NOT NULL,                          -- session email of whoever saved it
  topic_id     uuid REFERENCES listening_topics(id) ON DELETE SET NULL,
  topic_query  text NOT NULL,                          -- kept if the topic is deleted
  fingerprint  text NOT NULL,                          -- topic id + normalized headline: one save per idea per person
  idea         jsonb NOT NULL,                         -- headline, angle, audience, format, whyNow, outline, subtopic
  sources      jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{url, platform, text, publishedAt}]
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'pitched', 'in_progress', 'published', 'dropped')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, fingerprint)
);

CREATE INDEX IF NOT EXISTS listening_saved_ideas_owner_idx ON listening_saved_ideas (lower(created_by), updated_at DESC);

-- RLS matches 009: enabled, no permissive policies. Server connections bypass RLS as owner.
ALTER TABLE listening_saved_ideas ENABLE ROW LEVEL SECURITY;
