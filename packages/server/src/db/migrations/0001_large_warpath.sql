CREATE TABLE IF NOT EXISTS "client_brand_kit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" text NOT NULL,
	"website_url" text,
	"scraped_at" timestamp with time zone,
	"logo_storage_key" text,
	"logo_url" text,
	"primary_color" text,
	"secondary_color" text,
	"accent_color" text,
	"background_color" text,
	"text_color" text,
	"raw_colors" jsonb,
	"primary_font" text,
	"secondary_font" text,
	"font_stack" text,
	"tone" text,
	"style_notes" text,
	"scrape_status" text DEFAULT 'pending',
	"scrape_error" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_brand_kit_client_name_unique" UNIQUE("client_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" text NOT NULL,
	"title" text NOT NULL,
	"doc_type" text DEFAULT 'general' NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"extracted_text" text,
	"summary" text,
	"key_points" jsonb,
	"uploaded_by" text,
	"meeting_date" timestamp with time zone,
	"meeting_attendees" jsonb,
	"meeting_action_items" jsonb,
	"meeting_decisions" jsonb,
	"meeting_pain_points" jsonb,
	"meeting_opportunities" jsonb,
	"meeting_pull_quotes" jsonb,
	"diarized_transcript" text,
	"audio_storage_key" text,
	"audio_duration_secs" integer,
	"transcript_source" text,
	"processing_status" text,
	"processing_error" text,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_qa_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_name" text NOT NULL,
	"answer_id" uuid NOT NULL,
	"linked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_success_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"year" text NOT NULL,
	"client_or_project" text NOT NULL,
	"company_name" text,
	"issuing_agency" text,
	"category" text,
	"award_level" text,
	"submission_status" text,
	"badge_storage_key" text,
	"notes" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_success_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client" text NOT NULL,
	"category" text NOT NULL,
	"focus" text NOT NULL,
	"challenge" text,
	"solution" text,
	"metrics" jsonb DEFAULT '[]'::jsonb,
	"testimonial_quote" text,
	"testimonial_attribution" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_success_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric" text NOT NULL,
	"result" text NOT NULL,
	"client" text NOT NULL,
	"numeric_value" integer NOT NULL,
	"direction" text NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_success_testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote" text NOT NULL,
	"name" text,
	"title" text,
	"organization" text NOT NULL,
	"source" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sector" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"featured" boolean DEFAULT false NOT NULL,
	"added_by" text,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"fingerprint" text,
	"notes" text,
	"testimonial_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_success_testimonials_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sector" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page" text NOT NULL,
	"title" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_pipeline" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date_received" timestamp with time zone,
	"ce" text,
	"client" text,
	"description" text,
	"due_date" timestamp with time zone,
	"decision" text,
	"extra_info" text,
	"follow_up" text,
	"year" integer,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposal_pipeline_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scan_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"data" text NOT NULL,
	"thumbnail" text,
	"mime_type" text,
	"file_size" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"format_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"change_description" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"format_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mode" text DEFAULT 'draft' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"conversation_id" uuid,
	"user_id" text NOT NULL,
	"shared_with" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_id" uuid,
	"export_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"format_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"category" text DEFAULT 'custom' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"user_id" text,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"has_completed_tour" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "writing_persona_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"source_type" text DEFAULT 'paste' NOT NULL,
	"original_filename" text,
	"char_count" integer NOT NULL,
	"extracted_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "client" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_item_versions" ADD COLUMN "forked_to_id" uuid;--> statement-breakpoint
ALTER TABLE "answer_items" ADD COLUMN "usage_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_items" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photo_assets" ADD COLUMN "usage_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_assets" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "sheet_name" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "raw_data" jsonb;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "presentation_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "estimated_launch_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "actual_launch_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "cms_type" text;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "website_link" text;--> statement-breakpoint
ALTER TABLE "saved_documents" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "saved_documents" ADD COLUMN "uploader_name" text;--> statement-breakpoint
ALTER TABLE "saved_documents" ADD COLUMN "scan_results" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "saved_documents" ADD COLUMN "scan_criteria_snapshot" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "saved_documents" ADD COLUMN "scan_summary" text;--> statement-breakpoint
ALTER TABLE "saved_documents" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_docs_client" ON "client_documents" ("client_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_docs_type" ON "client_documents" ("doc_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_qa_links_client" ON "client_qa_links" ("client_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_client_qa_links_answer" ON "client_qa_links" ("answer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_testimonials_status" ON "client_success_testimonials" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_testimonials_sector" ON "client_success_testimonials" ("sector");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_testimonials_organization" ON "client_success_testimonials" ("organization");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_testimonials_usage_count" ON "client_success_testimonials" ("usage_count");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_user_id" ON "conversations" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_page" ON "conversations" ("page");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_created_at" ON "conversations" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_scan_criteria_user_id" ON "scan_criteria" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_persona_samples_user_id" ON "writing_persona_samples" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_answer_items_topic_id" ON "answer_items" ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_answer_items_status" ON "answer_items" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_answer_items_updated_at" ON "answer_items" ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_answer_items_topic_status" ON "answer_items" ("topic_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_answer_items_usage_count" ON "answer_items" ("usage_count");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_photo_assets_topic_id" ON "photo_assets" ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_photo_assets_status" ON "photo_assets" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_photo_assets_updated_at" ON "photo_assets" ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_photo_assets_topic_status" ON "photo_assets" ("topic_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_photo_assets_usage_count" ON "photo_assets" ("usage_count");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_category" ON "proposals" ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_won" ON "proposals" ("won");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_date" ON "proposals" ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_ce" ON "proposals" ("ce");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_client" ON "proposals" ("client");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_proposals_won_date" ON "proposals" ("won","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saved_documents_user_id" ON "saved_documents" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_saved_documents_type" ON "saved_documents" ("type");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_qa_links" ADD CONSTRAINT "client_qa_links_answer_id_answer_items_id_fk" FOREIGN KEY ("answer_id") REFERENCES "answer_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "studio_document_versions" ADD CONSTRAINT "studio_document_versions_document_id_studio_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "studio_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
