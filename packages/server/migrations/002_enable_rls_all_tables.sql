-- Migration: Enable Row Level Security on all public tables
-- Date: 2026-03-25
-- Reason: Supabase security alert — tables exposed via PostgREST without RLS
--
-- This app accesses data exclusively through:
--   1. Drizzle ORM via direct postgres connection (bypasses RLS)
--   2. supabaseAdmin client with service_role key (bypasses RLS)
--
-- Enabling RLS with no permissive policies blocks all access through
-- the Supabase anon/public REST API while keeping server-side access intact.

-- Core Q&A
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE links_answer_photo ENABLE ROW LEVEL SECURITY;

-- Documents & RFPs
ALTER TABLE saved_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_criteria ENABLE ROW LEVEL SECURITY;

-- Proposals & Pipeline
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sync_log ENABLE ROW LEVEL SECURITY;

-- Client Management
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_qa_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_brand_kit ENABLE ROW LEVEL SECURITY;

-- Success Stories
ALTER TABLE client_success_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_success_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_success_testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_success_awards ENABLE ROW LEVEL SECURITY;

-- AI & Conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Document Studio
ALTER TABLE studio_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY;

-- Personalization
ALTER TABLE writing_persona_samples ENABLE ROW LEVEL SECURITY;

-- Audit
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
