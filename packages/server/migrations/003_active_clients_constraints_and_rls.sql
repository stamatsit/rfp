-- Migration: Active Clients + Do Not Contact — DB-level constraints, real GIN, RLS
-- Date: 2026-05-13
-- Reason: Drizzle ^0.20.13 does not emit SQL CHECK constraints from `text({enum})`,
--         does not emit USING GIN with operator class, and `uniqueIndex().on(sql\`\`)`
--         does not compile in drizzle-orm ^0.29.5. All three must be applied manually.

-- ============================================================
-- Drop existing inline CHECKs on audit_log by whatever auto-generated name they have.
-- 0001_initial.sql wrote them as unnamed CHECK(...) constraints; the auto-generated
-- names usually match audit_log_action_type_check / audit_log_entity_type_check
-- but we don't trust that — discover dynamically.
-- ============================================================
DO $$
DECLARE
  c_name text;
BEGIN
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%entity_type%'
  LOOP
    EXECUTE 'ALTER TABLE audit_log DROP CONSTRAINT ' || quote_ident(c_name);
  END LOOP;

  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%action_type%'
  LOOP
    EXECUTE 'ALTER TABLE audit_log DROP CONSTRAINT ' || quote_ident(c_name);
  END LOOP;
END $$;

-- ============================================================
-- CHECK constraints
-- ============================================================
ALTER TABLE clients
  ADD CONSTRAINT clients_status_check
    CHECK (status IN ('active', 'prospect', 'former', 'archived'));

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_entity_type_check
    CHECK (entity_type IN ('ANSWER', 'PHOTO', 'SYSTEM', 'DO_NOT_CONTACT', 'CLIENT'));

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_action_type_check
    CHECK (action_type IN ('IMPORT', 'EDIT', 'RENAME', 'DOWNLOAD', 'COPY', 'LINK', 'UNLINK', 'AI_REQUEST', 'DELETE'));

ALTER TABLE do_not_contact
  ADD CONSTRAINT do_not_contact_email_format_check CHECK (position('@' in email) > 0),
  ADD CONSTRAINT do_not_contact_domain_nonempty_check CHECK (domain <> '');

-- ============================================================
-- Replace placeholder B-tree on clients.email_domains with proper GIN+jsonb_path_ops
-- ============================================================
DROP INDEX IF EXISTS clients_email_domains_idx;
CREATE INDEX clients_email_domains_idx ON clients USING GIN (email_domains jsonb_path_ops);

-- ============================================================
-- Functional-expression UNIQUE on lower(email) (Drizzle ^0.29.x can't express this)
-- ============================================================
CREATE UNIQUE INDEX do_not_contact_email_uniq ON do_not_contact (lower(email));

-- ============================================================
-- RLS on the new table — matches 002_enable_rls_all_tables.sql pattern.
-- No permissive policies; server-side Drizzle bypasses RLS, PostgREST exposure blocked.
-- ============================================================
ALTER TABLE do_not_contact ENABLE ROW LEVEL SECURITY;
