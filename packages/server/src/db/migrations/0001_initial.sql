-- Initial schema for RFP & Proposals (Postgres/Supabase)
-- Created: 2026-01-21

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Topics (controlled vocabulary)
CREATE TABLE IF NOT EXISTS topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Answer Items (current state)
CREATE TABLE IF NOT EXISTS answer_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id),
  subtopic TEXT,
  status TEXT NOT NULL DEFAULT 'Approved' CHECK(status IN ('Approved', 'Draft')),
  tags JSONB DEFAULT '[]'::jsonb,
  fingerprint TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Answer Item Versions (history)
CREATE TABLE IF NOT EXISTS answer_item_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  answer_item_id UUID NOT NULL REFERENCES answer_items(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  topic_id UUID NOT NULL,
  subtopic TEXT,
  status TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  version_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'local'
);

-- Photo Assets (current state)
CREATE TABLE IF NOT EXISTS photo_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_title TEXT NOT NULL,
  topic_id UUID NOT NULL REFERENCES topics(id),
  status TEXT NOT NULL DEFAULT 'Approved' CHECK(status IN ('Approved', 'Draft')),
  tags JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  storage_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Photo Asset Versions (history)
CREATE TABLE IF NOT EXISTS photo_asset_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  photo_asset_id UUID NOT NULL REFERENCES photo_assets(id) ON DELETE CASCADE,
  display_title TEXT NOT NULL,
  topic_id UUID NOT NULL,
  status TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  version_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'local'
);

-- Links between Answers and Photos
CREATE TABLE IF NOT EXISTS links_answer_photo (
  answer_item_id UUID NOT NULL REFERENCES answer_items(id) ON DELETE CASCADE,
  photo_asset_id UUID NOT NULL REFERENCES photo_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'local',
  PRIMARY KEY (answer_item_id, photo_asset_id)
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type TEXT NOT NULL CHECK(action_type IN ('IMPORT', 'EDIT', 'RENAME', 'DOWNLOAD', 'COPY', 'LINK', 'UNLINK', 'AI_REQUEST')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('ANSWER', 'PHOTO', 'SYSTEM')),
  entity_id UUID,
  details JSONB,
  actor TEXT NOT NULL DEFAULT 'local',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_answer_items_topic ON answer_items(topic_id);
CREATE INDEX IF NOT EXISTS idx_answer_items_status ON answer_items(status);
CREATE INDEX IF NOT EXISTS idx_answer_items_fingerprint ON answer_items(fingerprint);
CREATE INDEX IF NOT EXISTS idx_photo_assets_topic ON photo_assets(topic_id);
CREATE INDEX IF NOT EXISTS idx_photo_assets_status ON photo_assets(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action_type);

-- Full-text search indexes (Postgres native)
CREATE INDEX IF NOT EXISTS idx_answer_items_fts ON answer_items
  USING gin(to_tsvector('english', question || ' ' || answer));

CREATE INDEX IF NOT EXISTS idx_photo_assets_fts ON photo_assets
  USING gin(to_tsvector('english', display_title || ' ' || COALESCE(description, '')));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS answer_items_updated_at ON answer_items;
CREATE TRIGGER answer_items_updated_at
  BEFORE UPDATE ON answer_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS photo_assets_updated_at ON photo_assets;
CREATE TRIGGER photo_assets_updated_at
  BEFORE UPDATE ON photo_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
