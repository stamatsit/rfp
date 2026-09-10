-- 008: Client Portal (public Image Toolkit access for invited client users).
-- Apply with:
--   npm run whichdb        (must say rfp-prod)
--   node scripts/apply-migration.mjs packages/server/migrations/008_client_portal.sql
-- Rollback: 008_client_portal_DOWN.sql
-- RLS matches 002/005/007: enabled on every table, no permissive policies. The
-- server connection bypasses RLS as owner; PostgREST exposure is blocked.
--
-- Portal users are NOT rows in `users` (staff). They live in their own table,
-- sign in through their own endpoint, and carry their own session cookie, so a
-- portal session is meaningless to every internal route.

CREATE TABLE IF NOT EXISTS portal_users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email            text NOT NULL UNIQUE,
  name             text,
  password_hash    text,
  status           text NOT NULL DEFAULT 'invited'
                   CHECK (status IN ('invited', 'active', 'disabled')),
  token_hash       text,
  token_purpose    text CHECK (token_purpose IN ('invite', 'reset')),
  token_expires_at timestamptz,
  invited_by       text,
  invited_at       timestamptz NOT NULL DEFAULT now(),
  accepted_at      timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_users_client_idx ON portal_users (client_id);
CREATE INDEX IF NOT EXISTS portal_users_token_idx ON portal_users (token_hash) WHERE token_hash IS NOT NULL;
ALTER TABLE portal_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS portal_client_domains (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain      text NOT NULL UNIQUE
              CHECK (domain = lower(domain) AND domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_client_domains_client_idx ON portal_client_domains (client_id);
ALTER TABLE portal_client_domains ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS portal_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES portal_users(id) ON DELETE SET NULL,
  storage_key  text NOT NULL UNIQUE,
  filename     text NOT NULL,
  mime_type    text NOT NULL,
  size_bytes   integer NOT NULL,
  width        integer,
  height       integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_images_client_idx ON portal_images (client_id, created_at DESC);
ALTER TABLE portal_images ENABLE ROW LEVEL SECURITY;
