CREATE TABLE IF NOT EXISTS "webinar_registrants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webinar_id" uuid NOT NULL,
	"upload_id" uuid,
	"first_name" text,
	"last_name" text,
	"email" text NOT NULL,
	"organization_raw" text,
	"client_id" uuid,
	"category" text NOT NULL,
	"manual_override" boolean DEFAULT false NOT NULL,
	"attended" boolean,
	"follow_up_status" text DEFAULT 'no-outreach' NOT NULL,
	"follow_up_notes" text,
	"registered_at" timestamp with time zone,
	"attended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webinar_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webinar_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"upload_kind" text NOT NULL,
	"raw_rows" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webinars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"webinar_date" date,
	"source_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webinar_registrants_webinar_idx" ON "webinar_registrants" ("webinar_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webinar_registrants_email_idx" ON "webinar_registrants" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webinar_registrants_category_idx" ON "webinar_registrants" ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webinar_registrants_client_idx" ON "webinar_registrants" ("client_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webinar_registrants" ADD CONSTRAINT "webinar_registrants_webinar_id_webinars_id_fk" FOREIGN KEY ("webinar_id") REFERENCES "webinars"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webinar_registrants" ADD CONSTRAINT "webinar_registrants_upload_id_webinar_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "webinar_uploads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webinar_registrants" ADD CONSTRAINT "webinar_registrants_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webinar_uploads" ADD CONSTRAINT "webinar_uploads_webinar_id_webinars_id_fk" FOREIGN KEY ("webinar_id") REFERENCES "webinars"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
