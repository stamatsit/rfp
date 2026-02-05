CREATE TABLE IF NOT EXISTS "answer_item_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"answer_item_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"subtopic" text,
	"status" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"version_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'local' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "answer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"subtopic" text,
	"status" text DEFAULT 'Approved' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_items_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"details" jsonb,
	"actor" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "links_answer_photo" (
	"answer_item_id" uuid NOT NULL,
	"photo_asset_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'local' NOT NULL,
	CONSTRAINT "links_answer_photo_answer_item_id_photo_asset_id_pk" PRIMARY KEY("answer_item_id","photo_asset_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photo_asset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"photo_asset_id" uuid NOT NULL,
	"display_title" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"status" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"version_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'local' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "photo_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_title" text NOT NULL,
	"topic_id" uuid NOT NULL,
	"status" text DEFAULT 'Approved' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_size" integer,
	"mime_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_path" text NOT NULL,
	"file_mtime" timestamp with time zone NOT NULL,
	"total_rows" integer NOT NULL,
	"imported" integer NOT NULL,
	"updated" integer NOT NULL,
	"skipped" integer NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" timestamp with time zone,
	"ce" text,
	"client" text NOT NULL,
	"project_type" text,
	"rfp_number" text,
	"won" text,
	"school_type" text,
	"affiliation" text,
	"services_offered" jsonb DEFAULT '[]'::jsonb,
	"document_links" jsonb,
	"fingerprint" text NOT NULL,
	"source_row" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'RFP' NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"page_count" integer,
	"extracted_text" text NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_name_unique" UNIQUE("name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "answer_item_versions" ADD CONSTRAINT "answer_item_versions_answer_item_id_answer_items_id_fk" FOREIGN KEY ("answer_item_id") REFERENCES "answer_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "answer_items" ADD CONSTRAINT "answer_items_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "links_answer_photo" ADD CONSTRAINT "links_answer_photo_answer_item_id_answer_items_id_fk" FOREIGN KEY ("answer_item_id") REFERENCES "answer_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "links_answer_photo" ADD CONSTRAINT "links_answer_photo_photo_asset_id_photo_assets_id_fk" FOREIGN KEY ("photo_asset_id") REFERENCES "photo_assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_asset_versions" ADD CONSTRAINT "photo_asset_versions_photo_asset_id_photo_assets_id_fk" FOREIGN KEY ("photo_asset_id") REFERENCES "photo_assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "photo_assets" ADD CONSTRAINT "photo_assets_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
