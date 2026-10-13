-- 012: Topic Ideation drafts. Additive only.
-- A blog outline, a LinkedIn post or a set of headlines written from a saved
-- idea and the posts saved with it. One per kind per saved idea (writing
-- another replaces it); removed with the saved idea, so each person's drafts
-- are as private as their board. See docs/in-progress/social-listening.md.
-- Apply after confirming rfp-prod (host check or `npm run whichdb`), before
-- deploying code that reads listening_idea_drafts.
-- Rollback: 012_listening_idea_drafts_DOWN.sql

CREATE TABLE IF NOT EXISTS listening_idea_drafts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_idea_id  uuid NOT NULL REFERENCES listening_saved_ideas(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('blog_outline', 'linkedin_post', 'headlines')),
  content        jsonb NOT NULL,                       -- shape depends on kind, see listening/types.ts
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (saved_idea_id, kind)
);

-- RLS matches 009 and 010: enabled, no permissive policies. Server connections bypass RLS as owner.
ALTER TABLE listening_idea_drafts ENABLE ROW LEVEL SECURITY;
