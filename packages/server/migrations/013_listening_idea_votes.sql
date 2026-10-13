-- 013: Topic Ideation thumbs up and thumbs down on ideas. Additive only.
-- One vote per idea per person, keyed like saved ideas (topic id + normalized
-- headline) and kept with a small copy of the idea, so a vote still says what
-- the person likes after a rescan rewrites the topic's ideas or the topic is
-- deleted. Votes are shown to the model as guidance when it writes new ideas
-- (listening/taste.ts); nothing is trained on them.
-- Apply after confirming rfp-prod (host check or `npm run whichdb`), before
-- deploying code that reads listening_idea_votes.
-- Rollback: 013_listening_idea_votes_DOWN.sql

CREATE TABLE IF NOT EXISTS listening_idea_votes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   text NOT NULL,                          -- session email, lowercased
  topic_id     uuid REFERENCES listening_topics(id) ON DELETE SET NULL,
  fingerprint  text NOT NULL,                          -- topic id + normalized headline
  vote         smallint NOT NULL CHECK (vote IN (1, -1)),
  idea         jsonb NOT NULL,                         -- headline, angle, format, audience
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, fingerprint)
);

CREATE INDEX IF NOT EXISTS listening_idea_votes_topic_idx ON listening_idea_votes (topic_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS listening_idea_votes_owner_idx ON listening_idea_votes (created_by, updated_at DESC);

-- RLS matches the other listening tables: enabled, no permissive policies. Server connections bypass RLS as owner.
ALTER TABLE listening_idea_votes ENABLE ROW LEVEL SECURITY;
