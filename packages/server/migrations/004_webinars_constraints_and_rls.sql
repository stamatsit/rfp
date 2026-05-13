-- Migration: Webinars — DB-level CHECK constraints, functional unique index, RLS
-- Date: 2026-05-13
-- Reason: Drizzle ^0.20.13 does not emit SQL CHECK constraints from `text({enum})`,
--         and does not allow lower() inside uniqueIndex().on(). Apply manually.

-- CHECK constraints
ALTER TABLE webinar_uploads
  ADD CONSTRAINT webinar_uploads_upload_kind_check
    CHECK (upload_kind IN ('registration', 'attendance'));

ALTER TABLE webinar_registrants
  ADD CONSTRAINT webinar_registrants_category_check
    CHECK (category IN ('do-not-contact', 'client', 'employee', 'non-client'));

ALTER TABLE webinar_registrants
  ADD CONSTRAINT webinar_registrants_follow_up_status_check
    CHECK (follow_up_status IN ('no-outreach', 'vm-left', 'email-sent', 'connected', 'dead'));

-- Functional unique index — one (webinar_id, lower(email)) per webinar.
-- Needed for the attendance-report upsert path and to prevent dupes from
-- re-uploading the same registration export.
CREATE UNIQUE INDEX webinar_registrants_webinar_email_uniq
  ON webinar_registrants (webinar_id, lower(email));

-- RLS — matches the pattern in 002_enable_rls_all_tables.sql.
-- No permissive policies; server-side Drizzle bypasses RLS, PostgREST exposure blocked.
ALTER TABLE webinars ENABLE ROW LEVEL SECURITY;
ALTER TABLE webinar_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE webinar_registrants ENABLE ROW LEVEL SECURITY;
