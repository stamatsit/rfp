CREATE TABLE IF NOT EXISTS "do_not_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"domain" text NOT NULL,
	"institution" text NOT NULL,
	"comment" text,
	"client_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text DEFAULT 'unknown' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "do_not_contact_domain_idx" ON "do_not_contact" ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_status_idx" ON "clients" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_email_domains_idx" ON "clients" ("email_domains");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "do_not_contact" ADD CONSTRAINT "do_not_contact_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
