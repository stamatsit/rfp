-- Migration: Add Performance Indexes
-- Date: 2026-02-10
-- Description: Add indexes on frequently queried columns to improve query performance

-- Conversations table indexes
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_page ON conversations(page);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);

-- Answer items indexes
CREATE INDEX IF NOT EXISTS idx_answer_items_topic_id ON answer_items(topic_id);
CREATE INDEX IF NOT EXISTS idx_answer_items_status ON answer_items(status);
CREATE INDEX IF NOT EXISTS idx_answer_items_updated_at ON answer_items(updated_at DESC);

-- Photo assets indexes
CREATE INDEX IF NOT EXISTS idx_photo_assets_topic_id ON photo_assets(topic_id);
CREATE INDEX IF NOT EXISTS idx_photo_assets_status ON photo_assets(status);
CREATE INDEX IF NOT EXISTS idx_photo_assets_updated_at ON photo_assets(updated_at DESC);

-- Proposals indexes
CREATE INDEX IF NOT EXISTS idx_proposals_category ON proposals(category);
CREATE INDEX IF NOT EXISTS idx_proposals_won ON proposals(won);
CREATE INDEX IF NOT EXISTS idx_proposals_date ON proposals(date DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_ce ON proposals(ce);
CREATE INDEX IF NOT EXISTS idx_proposals_client ON proposals(client);

-- Proposal pipeline indexes
CREATE INDEX IF NOT EXISTS idx_proposal_pipeline_decision ON proposal_pipeline(decision);
CREATE INDEX IF NOT EXISTS idx_proposal_pipeline_date_received ON proposal_pipeline(date_received DESC);
CREATE INDEX IF NOT EXISTS idx_proposal_pipeline_due_date ON proposal_pipeline(due_date);

-- Studio documents indexes
CREATE INDEX IF NOT EXISTS idx_studio_documents_user_id ON studio_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_studio_documents_mode ON studio_documents(mode);
CREATE INDEX IF NOT EXISTS idx_studio_documents_updated_at ON studio_documents(updated_at DESC);

-- Links table index (for reverse lookups)
CREATE INDEX IF NOT EXISTS idx_links_answer_photo_photo_id ON links_answer_photo(photo_asset_id);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_answer_items_topic_status ON answer_items(topic_id, status);
CREATE INDEX IF NOT EXISTS idx_photo_assets_topic_status ON photo_assets(topic_id, status);
CREATE INDEX IF NOT EXISTS idx_proposals_won_date ON proposals(won, date DESC);
