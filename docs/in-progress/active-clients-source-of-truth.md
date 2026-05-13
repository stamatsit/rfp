# Active Clients — Single Source of Truth

**Status:** Design decision locked. Migration and UI not written.
**Owner:** Eric Yerke
**Decided:** 2026-05-12
**Updated:** 2026-05-13 — added Do Not Contact list

---

## The problem

Today the app has zero answer to three basic questions that several features need to ask:

1. **Is this email address from an active client?** (Needed by: Webinars feature, future Sales Machine, future Outreach skill, AI brief generation)
2. **Which of our clients are currently active vs. former vs. prospects?** (Needed by: Client Portfolio filtering, renewal-risk reports, dashboard metrics)
3. **Should we be contacting this person at all?** (Needed by: every outbound feature, every import. People who've opted out, gone hostile, gone dark, or are otherwise off-limits need to stay off-limits — but we still want the historical record.)

The `clients` table has `name`, `sector`, `notes` — that's it. No email domain field. No lifecycle status. No do-not-contact tracking. The Client Portfolio shows every client indiscriminately.

Without this design, the Webinars feature would have to invent its own parallel client/domain registry and its own parallel suppression list. Those would drift from Client Portfolio the first time someone signs a new client (or asks to be left alone) and only updates one place. Multiply by every future feature that needs "is this a client?" / "are they on the no-contact list?" and you get a coordination problem that compounds.

## The decision

**One source of truth.** Two new columns on the existing `clients` table plus one new `do_not_contact` table. Three helper functions. Every feature reads from them.

### Migration

**Workflow is schema-first.** This repo uses Drizzle-Kit to emit SQL from `schema.ts` edits and update `meta/_journal.json`. Local apply is via `db:push`, which pushes the schema directly (the generated SQL file is the audit trail of what changed, not the apply mechanism). Prod migrations are applied via the Supabase MCP / SQL editor against the generated file.

#### ⚠️ drizzle-kit version gotcha — fix the npm scripts first

The installed `drizzle-kit` version is **^0.20.13** ([packages/server/package.json](../../packages/server/package.json)). In this version, the CLI commands are `generate:pg` and `push:pg` — NOT `generate` and `push`. The current npm scripts (`"db:generate": "drizzle-kit generate"` and `"db:push": "drizzle-kit push"`) reference commands that don't exist in this version. Confirmed via `npx drizzle-kit --help`.

**Step zero of this work**: update [packages/server/package.json](../../packages/server/package.json):

```json
"db:generate": "drizzle-kit generate:pg",
"db:push": "drizzle-kit push:pg",
"db:studio": "drizzle-kit studio"
```

(Or alternatively, upgrade drizzle-kit to ^0.21.x where bare `generate` / `push` with `dialect` config works. Doing the script-fix is lower risk for this PR. Upgrade is a separate decision.)

#### Critical Drizzle behavior the plan accounts for

After verifying against the real Drizzle-generated `0000_melodic_pride.sql` in this repo:

- **`text({ enum: [...] })` is TypeScript-only.** Drizzle emits a bare `"col" text NOT NULL` with NO SQL CHECK constraint. So the `clients.status` enum and the `auditLog.entityType` enum extension at the schema.ts level only protect against bad TypeScript inserts — they do not constrain the database.
- **GIN indexes are not supported by drizzle-kit ^0.20.x.** The kit's snapshot validator only allows `using: 'btree' | 'hash'`. Calling `.using("gin")` in the index builder will be silently dropped or fail validation — and the operator class `jsonb_path_ops` is definitely not expressible. **What Drizzle will actually emit for our `email_domains` index: a plain B-tree on the jsonb column** (which is useless for `@>` containment lookups). The hand-applied operational SQL file drops that B-tree and creates the proper `USING GIN (email_domains jsonb_path_ops)` index.

Both of these are why we have a **second, hand-applied SQL file** (`003_active_clients_constraints_and_rls.sql`) — to add database-level CHECK constraints, replace the placeholder index with a real GIN-with-`jsonb_path_ops` index, and enable RLS on the new table. The two-file pattern matches the existing repo (`0001_initial.sql` is a hand-written bootstrap that the Drizzle journal does not track).

#### Step-by-step

1. Update the `db:generate` / `db:push` npm scripts to use the `:pg` suffix (see "drizzle-kit version gotcha" above).
2. Edit `packages/server/src/db/schema.ts` — see "Schema.ts edits" below.
3. Run `npm run db:generate` from `packages/server/`. Drizzle emits a new file at `packages/server/src/db/migrations/000N_<auto_slug>.sql` and bumps `meta/_journal.json`.
4. Visually verify the generated SQL against the "Expected Drizzle output (bare DDL only)" block below. **Never hand-edit the generated migration** — if it's wrong, fix `schema.ts` and regenerate.
5. Apply locally via `npm run db:push`.
6. Apply the hand-written constraints/RLS file at `packages/server/migrations/003_active_clients_constraints_and_rls.sql` via the Supabase SQL editor (or MCP) — see block below.
7. **Verification step (proves CHECK constraints are live):** in a single transaction, attempt `INSERT INTO audit_log (action_type, entity_type) VALUES ('BOGUS', 'ANSWER');` and confirm it fails with `violates check constraint` (this proves the new CHECKs are enforcing). Then attempt `INSERT INTO audit_log (action_type, entity_type) VALUES ('DELETE', 'DO_NOT_CONTACT');` and confirm it succeeds (this proves the new values are allowed). `ROLLBACK` either result. If the negative test passes (i.e., `BOGUS` was accepted), no CHECK is in effect — the old constraint failed to drop. See "CHECK constraint name discovery" below.
8. Verify and (if needed) backfill existing rows — see "Backfill consideration."

#### Schema.ts edits

Imports at top of `schema.ts` need to grow:

```ts
// Before:
import { pgTable, text, integer, timestamp, date, primaryKey, jsonb, uuid, boolean, index } from "drizzle-orm/pg-core"
// After: add `uniqueIndex` to the same import.
import { pgTable, text, integer, timestamp, date, primaryKey, jsonb, uuid, boolean, index, uniqueIndex } from "drizzle-orm/pg-core"
// And a separate import for the sql tag, if not already imported in this file:
import { sql } from "drizzle-orm"
```

Then:

- `clients` table: add two columns AND add a third-argument index callback (the current definition has none — adding indexes requires growing the call signature):
  ```ts
  export const clients = pgTable("clients", {
    // existing columns…
    status: text("status", { enum: ["active", "prospect", "former", "archived"] }).notNull().default("active"),
    emailDomains: jsonb("email_domains").$type<string[]>().notNull().default([]),
  }, (t) => ({
    statusIdx: index("clients_status_idx").on(t.status),
    emailDomainsIdx: index("clients_email_domains_idx").on(t.emailDomains),  // placeholder B-tree; replaced by USING GIN (email_domains jsonb_path_ops) in 003 operational SQL
  }))
  ```
  Note `jsonb`, not `text[]`, to match every other array column in this repo (`tags`, `servicesOffered`, etc.).

- `auditLog` table: extend the `entityType` enum to `["ANSWER", "PHOTO", "SYSTEM", "DO_NOT_CONTACT", "CLIENT"]` AND extend the `actionType` enum to add `"DELETE"`. Reason for `DELETE`: we use a dedicated action type for DNC removals rather than overloading `UNLINK` (which has photo-answer-unlink semantics). One word, one meaning, clean queries.

- New table `doNotContact`:
  ```ts
  export const doNotContact = pgTable("do_not_contact", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    domain: text("domain").notNull(),  // lower(extractDomain(email)), set server-side at insert
    institution: text("institution").notNull(),
    comment: text("comment"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("unknown"),
  }, (t) => ({
    domainIdx: index("do_not_contact_domain_idx").on(t.domain),
  }))
  ```

  **Note: the unique index on `lower(email)` is NOT in the schema.ts definition.** Drizzle-orm ^0.29.5's `uniqueIndex(...).on()` types only accept `PgColumn`, not a `sql` template — so `uniqueIndex(...).on(sql\`lower(${t.email})\`)` doesn't compile. The functional-expression unique index lives in the hand-applied operational SQL file instead. (Same reason the GIN index is there.)

  Also export types: `export type DoNotContactEntry = typeof doNotContact.$inferSelect` and `NewDoNotContactEntry`.

#### Expected Drizzle output (bare DDL only — no CHECK constraints, no GIN)

```sql
ALTER TABLE "clients" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;
ALTER TABLE "clients" ADD COLUMN "email_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;
CREATE INDEX "clients_status_idx" ON "clients" ("status");
-- Drizzle-kit ^0.20.x cannot emit USING GIN; this will be a plain B-tree on jsonb (useless).
-- The operational SQL file drops and recreates this with USING GIN (email_domains jsonb_path_ops).
CREATE INDEX "clients_email_domains_idx" ON "clients" ("email_domains");

CREATE TABLE "do_not_contact" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "domain" text NOT NULL,
  "institution" text NOT NULL,
  "comment" text,
  "client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text DEFAULT 'unknown' NOT NULL
);
CREATE INDEX "do_not_contact_domain_idx" ON "do_not_contact" ("domain");
```

That's it for Drizzle output. **No CHECK constraints, no real GIN index, no functional-expression UNIQUE on `lower(email)`** — all three are added in the hand-applied file. (Validator hint: if drizzle-kit suddenly starts emitting these on its own, you're on a different kit version than the one this plan was written against — revisit.)

#### `003_active_clients_constraints_and_rls.sql` (hand-applied)

```sql
-- ============================================================
-- CHECK constraint name discovery (run this part interactively first)
-- ============================================================
-- 0001_initial.sql wrote inline unnamed CHECK constraints like
--   CHECK(action_type IN (...))
-- Postgres auto-names these (usually audit_log_action_type_check / audit_log_entity_type_check
-- but it depends on prior history). We can't trust the name, so we query first:
--
-- SELECT conname FROM pg_constraint
-- WHERE conrelid = 'audit_log'::regclass
--   AND contype = 'c';
--
-- If the names match the expected ones below, the DROP IF EXISTS lines work as-is.
-- If they don't, drop by the discovered names instead (substitute in the block below).

-- ============================================================
-- DB-level CHECK constraints (Drizzle doesn't emit these from `text({enum})`)
-- ============================================================
DO $$
DECLARE
  c_name text;
BEGIN
  -- Drop any existing CHECK on audit_log.entity_type (whatever its auto-generated name)
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%entity_type%'
  LOOP
    EXECUTE 'ALTER TABLE audit_log DROP CONSTRAINT ' || quote_ident(c_name);
  END LOOP;

  -- Same for audit_log.action_type
  FOR c_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'audit_log'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%action_type%'
  LOOP
    EXECUTE 'ALTER TABLE audit_log DROP CONSTRAINT ' || quote_ident(c_name);
  END LOOP;
END $$;

ALTER TABLE clients
  ADD CONSTRAINT clients_status_check
    CHECK (status IN ('active', 'prospect', 'former', 'archived'));

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_entity_type_check
    CHECK (entity_type IN ('ANSWER', 'PHOTO', 'SYSTEM', 'DO_NOT_CONTACT', 'CLIENT'));

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_action_type_check
    CHECK (action_type IN ('IMPORT', 'EDIT', 'RENAME', 'DOWNLOAD', 'COPY', 'LINK', 'UNLINK', 'AI_REQUEST', 'DELETE'));

-- Defensive shape constraints on do_not_contact
ALTER TABLE do_not_contact
  ADD CONSTRAINT do_not_contact_email_format_check CHECK (position('@' in email) > 0),
  ADD CONSTRAINT do_not_contact_domain_nonempty_check CHECK (domain <> '');

-- ============================================================
-- Better GIN index for jsonb single-key containment
-- ============================================================
-- Drizzle-kit ^0.20.x emitted a plain B-tree on jsonb. Replace it.
DROP INDEX IF EXISTS clients_email_domains_idx;
CREATE INDEX clients_email_domains_idx ON clients USING GIN (email_domains jsonb_path_ops);

-- ============================================================
-- Functional-expression UNIQUE on lower(email) (Drizzle ^0.29.x cannot express this in schema)
-- ============================================================
CREATE UNIQUE INDEX do_not_contact_email_uniq ON do_not_contact (lower(email));

-- ============================================================
-- RLS on the new table — matches the existing pattern in 002_enable_rls_all_tables.sql.
-- No permissive policies; server-side Drizzle bypasses RLS, PostgREST exposure blocked.
-- ============================================================
ALTER TABLE do_not_contact ENABLE ROW LEVEL SECURITY;
```

The DO block handles whatever-the-old-CHECK-was-named. The verification INSERT in step 7 above proves it worked.

#### Backfill consideration for existing `clients` rows

The `ALTER TABLE clients ADD COLUMN status NOT NULL DEFAULT 'active'` sets every existing row to `active`. **Verify before running**: query `SELECT id, name FROM clients` (via Drizzle in Node, or via the Supabase SQL editor — both bypass RLS) and confirm every row is in fact currently an active client. If any are former, prospect, or archived in reality, run a one-time UPDATE before merging the work that surfaces the status filter. This is owned by Eric — pre-migration data check. The plan does not assume the count of existing rows; if there are 0 rows the check is trivial; if there are hundreds, this is critical path.

#### Why `jsonb` over `text[]` for `email_domains`

Every other array column in `schema.ts` uses `jsonb("col").$type<string[]>()`. Mixing Postgres array types into a codebase that's standardized on `jsonb` would force a divergent code path in any query builder helper. Cost: slightly different containment syntax (`@>` instead of `= ANY`). Benefit: consistency, plus jsonb's path-based GIN index (`jsonb_path_ops`) is smaller and faster for our exact use case (single-key containment).

#### How domain-matching works under jsonb

Drizzle SQL template for the active-client lookup:

```ts
sql`${clients.emailDomains} @> ${JSON.stringify([domain])}::jsonb`
```

This is parameterized (Drizzle's `sql` tagged template auto-parameterizes interpolated values). `domain` comes from `extractDomain(email)` which lowercases, trims, and returns null for malformed input — so the value reaching the SQL is always a safe lowercase string or we never reach the query. Defense in depth: also validate domain shape against the regex below before query.

#### Why store `email` *and* `domain`

The email is the audit trail ("who specifically triggered this entry"); the domain is what we actually match against incoming imports. We compute `domain` server-side at insert (`extractDomain(email)`) — **never trust the client to send it**.

#### Why `client_id` is nullable

A DNC entry can originate from flipping an existing client (links back) or from the standalone dialog where the person isn't in the client list (no link). The `ON DELETE SET NULL` clause means deleting a client doesn't cascade-delete their DNC entry — the suppression survives.

#### Why no separate `dnc_audit_log` table

The existing `audit_log` already has `details jsonb` which is perfect for snapshotting a deleted DNC entry (`{email, domain, institution, comment, createdBy, deletedBy, deletedAt}`). One table, extended enums, no new infrastructure. We add `'DELETE'` to the `actionType` enum (rather than overloading `'UNLINK'` which is photo-answer-unlink semantics) so audit queries can filter cleanly: `WHERE entity_type = 'DO_NOT_CONTACT' AND action_type = 'DELETE'` returns exactly the DNC removal history.

#### DNC entries are immutable (no PUT/PATCH)

The `doNotContact` table has no update route by design. To change an entry, delete and re-create. Reasons: (a) `domain` is computed from `email`, so an update would have to recompute consistently; (b) the audit-on-delete trail breaks down if entries can be silently mutated; (c) the use cases ("Move to Client", "Move to Non-Client", correcting a typo) are all delete-then-do-something flows anyway.

#### Drizzle relations() — deferred

The existing `schema.ts` has zero `relations()` declarations. The plan uses `db.query.*.findFirst({ where: ... })` which works without relations — but eager loading with `with: { ... }` does not. We don't need eager loading for v1 (each route loads its own data with manual joins where needed), so we don't add a `relations()` config in this PR. If a future feature needs `with: { client: true }` for DNC entries, that's a one-line addition then.

### Helper functions

Lives in `packages/server/src/lib/clientLookup.ts` (new file). **Build order matters**: this file imports `doNotContact` from `../db/index.js` (which re-exports from `schema.ts` via the existing `export * from "./schema.js"` at `db/index.ts:44`), so `schema.ts` must be updated *before* `clientLookup.ts` compiles.

The `db` symbol exported from `db/index.ts` is typed as `DrizzleInstance | null` (it's null when `DATABASE_URL` is unset, matching how the rest of the codebase guards against missing DB — see the `if (!db) return res.status(503)...` pattern in every existing route). Helpers must null-guard, returning `null` (mirroring the "no match" return) so callers don't have to know whether the absence is because of a missing DB or a missing row.

**Important: use `db.select()` not `db.query.*`.** Every existing query in this codebase uses `db.select().from(...).where(...)`. The relational query API (`db.query.clients.findFirst`) has zero prior usage. The helpers below match the established pattern, both to avoid being the first user of an untested code path and to keep the code style consistent.

```ts
import { db, clients, doNotContact } from "../db/index.js"
import { and, eq, sql } from "drizzle-orm"

// Canonical domain validator — exported so the chip input, seed script, and
// route handlers all use the same regex. Each label must start/end with alphanumeric,
// no leading/trailing hyphens, no consecutive dots, TLD is 2+ letters.
export const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export function extractDomain(email: string): string | null {
  if (!email) return null
  const at = email.indexOf("@")
  if (at < 0 || at === email.length - 1) return null
  const domain = email.slice(at + 1).toLowerCase().trim()
  return DOMAIN_RE.test(domain) ? domain : null
}

export async function lookupClientByEmail(email: string) {
  if (!db) return null
  const domain = extractDomain(email)
  if (!domain) return null
  const [row] = await db.select().from(clients).where(
    and(
      eq(clients.status, "active"),
      sql`${clients.emailDomains} @> ${JSON.stringify([domain])}::jsonb`
    )
  ).limit(1)
  return row ?? null
}

export async function listActiveClients() {
  if (!db) return []
  return db.select().from(clients).where(eq(clients.status, "active"))
}

/**
 * Returns the DNC entry that suppresses this email's domain, or null if not suppressed.
 * Important: matches by DOMAIN, not email — per the org-wide suppression decision.
 * The returned entry's email may not be the email passed in; it's whichever entry
 * caused the match.
 */
export async function isDoNotContact(email: string) {
  if (!db) return null
  const domain = extractDomain(email)
  if (!domain) return null
  const [row] = await db.select().from(doNotContact).where(eq(doNotContact.domain, domain)).limit(1)
  return row ?? null
}
```

These three functions are the only sanctioned way for app code to ask "is this an active client?" / "are they on the no-contact list?" No re-implementations elsewhere. **`extractDomain` and `DOMAIN_RE` are exported** so other modules (the seed script, the chip input's server-side validation, the webinar parser) use the same parse rules (lowercase, trimmed, validated → string or null).

**Unit tests** live at `packages/server/src/__tests__/clientLookup.test.ts` (matches the existing vitest pattern — `src/**/*.test.ts`). Cover: empty string, no `@`, trailing `@`, leading/trailing whitespace, uppercase normalization, plus-addressing (`jane+work@x.com` → domain `x.com`), uppercase domain, invalid TLD (single letter), leading dot, leading/trailing hyphen, consecutive dots.

### Categorization precedence

When a feature categorizes an email, **Do Not Contact wins**. Order of checks:

1. `isDoNotContact(email)` → if match, category = **Do Not Contact** (stop)
2. `lookupClientByEmail(email)` → if match, category = **Client**
3. Domain is `stamats.com` (verified via [packages/server/src/routes/auth.ts](../../packages/server/src/routes/auth.ts) registration check) → category = **Employee**
4. Otherwise → category = **Non-Client**

A row can be a client *and* on the DNC list (e.g., a contact at an active client who personally asked us to stop emailing them). DNC always wins on outreach decisions.

### What happens when a DNC entry is deleted

Deleting a DNC entry does **not** automatically re-categorize past imports. The category column on `webinar_registrants` (and any future imported list) is a derived field; it sticks until somebody clicks "Re-categorize" on that webinar's detail page. UX consequence: removing somebody from DNC requires either (a) clicking re-categorize on each affected webinar to update displayed categories, or (b) accepting that historical rows stay tagged DNC and only future imports see them as non-client. This is the same explicit-recategorize rule already in the mockup; it just also applies to DNC changes. We call this out in the DNC delete confirmation modal so the user knows.

## DNC is org-wide suppression — naming and UX must reflect that

Per the locked-in "match by email extension" decision, **a DNC entry suppresses the entire domain, not the individual**. We embrace that explicitly:

- The dialog header reads **"Add Organization to Do Not Contact"** (not "Add Contact"). The label on the email field reads **"Representative email at this organization"** with helper text: *"We store this email for record-keeping. Matching applies to the entire domain — anyone @{domain} will be suppressed."*
- The DNC list view shows entries grouped by `domain`, with the `institution` as the primary label and the `email` as a smaller secondary line.
- On submit, before save, the dialog shows a yellow callout: *"This will suppress all emails at `{domain}`. Are you sure?"* — one click to confirm, one to cancel. Cheap insurance against a user thinking they're flagging one person.

This resolves the prior framing inconsistency. If we later want per-person suppression at a domain we still serve, that's a separate `do_not_contact_email_exact` table and is **explicitly out of scope** for this PR (see "What we are not doing").

## What changes on the front end

### Client Portfolio

- **Status filter chips** at the top of the roster: `Active · Prospect · Former · Archived · Do Not Contact · All`. Defaults to Active.
  - `Active / Prospect / Former / Archived` filter on `clients.status`.
  - `Do Not Contact` is a **separate query** — it returns clients that have at least one matching row in `do_not_contact` (joined via `clients.id = do_not_contact.client_id`). It is not a value of `clients.status`.
  - `All` returns every client regardless of status, but **excludes the DNC view by default** — DNC entries are surfaced only when the DNC chip is explicitly selected, or when the global `Show Do Not Contact (N)` toggle is on.
  - `Archived` clients are visually de-emphasized (lower opacity) and excluded from any downstream "send outreach" features the same way DNC is, but are not part of the suppression list itself.
- **Status pill** on each client card (green Active, amber Prospect, grey Former, dim slate Archived). Clients that *also* appear on DNC get an additional small red "DNC" badge alongside their status pill — so a client can show "Active + DNC" visually.
- **Add/Edit Client modal** gains two fields:
  - Status dropdown (Active / Prospect / Former / Archived)
  - Email domains — `<ChipInput>` where typing a domain becomes a chip. One client can own many domains (e.g., Westlake Health Network has `medstar.example` and `medstar.example.org`; Bryan Health has `bryanhealth.example` and `bryanhealth.example.org`). Each chip is validated against the domain regex before being added.
- **"Move to Do Not Contact" action** on any client card (active / prospect / former). Opens the DNC dialog pre-filled with the client's name as Institution. The email field is **left empty** — the user must enter a real representative email. Pre-filling a placeholder like `contact@{domain}` was considered and rejected: users would submit it as-is, producing fake-looking audit data. If the client has multiple domains, the action presents a domain picker first — the user must consciously choose which domain(s) to suppress. The client stays in the `clients` table — they just also get a DNC entry linked via `client_id`. Reversible: delete the DNC entry and the institution is contactable again.

### Do Not Contact list

A new section/page in Client Portfolio.

- **Hidden by default** on every screen that lists people (Client Portfolio roster, Webinars registrants, future Outreach lists). A `Show Do Not Contact (N)` toggle reveals them. This applies to admin views too — DNC requires an explicit click to surface.
- **"Add Organization to Do Not Contact" dialog**, opened from a button on the DNC section header. Three fields:
  - **Representative email at this organization** (required) — validated by passing the trimmed value through `extractDomain` (server-side) and the mirrored client-side regex. Submit is blocked unless `extractDomain(email) !== null` — i.e., the email contains `@` and the domain portion matches `DOMAIN_RE`. Stored for the audit record. Helper text reminds users matching is org-wide.
  - **Institution name** (required, validated non-empty after trim) — human-readable label so the list isn't a wall of email domains.
  - **Comment** (optional) — why they're on the list. ("Asked to be removed 2026-04-15", "Hostile contact at former client", etc.)
- **Bi-directional movement.** From any DNC entry you can:
  - **"Move to Client"** → opens the Add/Edit Client modal pre-filled with the institution name and the entry's domain in the `emailDomains` chip. If the user is *editing* an existing client (because a client with that name already exists), the frontend reads the existing `emailDomains`, appends the DNC entry's domain if not already present, and sends the full updated array via `clientsApi.update`. If *creating* a new client, the array starts with just the DNC entry's domain. Saving creates/updates the client AND deletes the DNC entry (which also writes the audit row — see below), all inside a single transaction.
  - **"Move to Non-Client"** → just deletes the DNC entry (writes the audit row). Non-Client is the default for anyone not in the clients table — no positive action needed beyond removing the DNC flag.
- **Audit trail preserved on every delete path.** Whether the user clicks "Delete," "Move to Client," or "Move to Non-Client" — the DNC server route's DELETE handler first writes `{email, domain, institution, comment, createdBy, createdAt, deletedBy, deletedAt}` to `audit_log` (`actionType='DELETE'`, `entityType='DO_NOT_CONTACT'`, `details` jsonb) before deleting the row. Single code path, single audit guarantee. We add `DELETE` to the action_type enum specifically rather than overloading the existing `UNLINK` (which has photo-answer-unlink semantics in `auditService.logUnlink`) so future audit queries can filter cleanly. No new audit table — we reuse the one already in place. The schema edit extends both `auditLog.entityType` and `auditLog.actionType` Drizzle enums; the operational SQL file applies matching CHECK constraints; the `AuditEntityType` and `AuditActionType` TypeScript unions in `packages/server/src/types/index.ts` are updated in parallel.

- **"Move to Client" is transactional.** The two-step flow (insert/update client + write audit row + delete DNC entry) runs inside a Drizzle `db.transaction(async (tx) => ...)` block. If any step fails, the transaction rolls back and the user is shown an error. Without this, a partial failure would leave both a client AND a DNC entry for the same domain — and DNC wins in the precedence chain, so the institution would still be silently suppressed despite appearing as a client. Same transaction pattern wraps "Move to Non-Client" and plain "Delete" — the audit-log write and the row delete must commit together or neither commits.

**Implementation note:** `db.transaction(...)` has zero prior usage in this codebase (verified via grep). This work introduces the pattern. Test the transaction rollback path explicitly in the route tests — induce a constraint violation mid-transaction and assert the audit_log row was NOT written. The existing `auditService.logAudit` swallows errors with a console.error, which would break transaction rollback; the new `logDoNotContactDelete` helper must throw on failure to let the transaction abort.

**TS narrowing inside transactions**: `db` is typed `DrizzleInstance | null`. After the route-handler null guard (`if (!db) return res.status(503)...`), some TS versions don't narrow the type inside the closure passed to `db.transaction(async (tx) => ...)`. Pattern to use:

```ts
if (!db) return res.status(503).json({ error: "Database unavailable" })
const safeDb = db  // narrows for closure capture
await safeDb.transaction(async (tx) => {
  await logDoNotContactDelete(tx, snapshot, deletedBy)
  await tx.delete(doNotContact).where(eq(doNotContact.id, id))
})
```

Note: `drizzle-orm`'s `postgres-js` driver auto-rolls-back the transaction on any thrown error inside the callback, so re-throwing from `logDoNotContactDelete` is sufficient — no explicit `ROLLBACK` needed.

### Webinars feature

- The "Clients" tab from the mockup goes away.
- Replaced by a small "Manage clients →" link that navigates to Client Portfolio.
- The upload parser runs the precedence chain (DNC → Client → Employee → Non-Client) on each registrant. DNC rows are imported and stored — they're just **hidden from the default view** behind the same `Show Do Not Contact (N)` toggle used elsewhere. Counts in the summary stats exclude DNC unless the toggle is on.

### Re-categorization is explicit, not automatic

When a client's status flips (prospect → active, or active → former), or when an entry is added to / removed from Do Not Contact, past webinar registrants are *not* destructively updated. The category column on `webinar_registrants` is a derived field that we recompute only when somebody clicks "Re-categorize" on a webinar's detail page (already in the mockup). Explicit. Auditable. Undoable.

## Seed strategy

The CSV at [Webinar Data/Stamats-Client-Domains-2025-2026.csv](../../Webinar%20Data/Stamats-Client-Domains-2025-2026.csv) (60 rows + header, columns: `Organization, Website, Email Domain, Notes`) is the initial seed for `clients.email_domains[]` and the source of any net-new `clients` rows.

**Mechanism:** a one-time TypeScript script at `packages/server/src/scripts/seedClientDomains.ts`, run via `npm run seed:client-domains` (added to `packages/server/package.json`). Not inline migration SQL — Drizzle migrations can't read repo files reliably, and a script keeps the upsert logic readable and testable.

**Logic:**

1. Parse the CSV with `csv-parse` (the standalone npm package; install via `npm install csv-parse`). Use the sync API specifically: `import { parse } from "csv-parse/sync"`. Call `parse(fileContents, { columns: true, skip_empty_lines: true, trim: true })`. Keys come back exactly as the header row: `"Organization"`, `"Website"`, `"Email Domain"` (with the space — reference as `row["Email Domain"]`, not `row.emailDomain`), `"Notes"`. RFC 4180 compliant — handles quoted commas AND doubled-quote escapes like `""`. Regex parsing was considered and rejected: the CSV contains both quoted commas (`"Galen Health Institute, Inc."`) and doubled-quote escapes (`"Split from source line ""Golden West College..."""`).
2. For each row, **match by `lower(trim(clients.name)) = lower(trim(row["Organization"]))`** (precise definition, not fuzzy). Variant names — e.g., the CSV's "Alvin College" vs. an existing "Alvin Community College" row added manually — will not match and will create a new row. Merging variants is a follow-up admin task, not a one-time-script responsibility.
3. **The CSV's `Email Domain` column contains bare domains** (e.g., `alvincollege.edu`), NOT email addresses. Do **not** call `extractDomain` on these values — it expects an `@` and returns null otherwise. Instead, lowercase and trim the value directly, then validate against `DOMAIN_RE`. Skip + warn if it fails.
4. For each row:
   - **If client match exists**: append the CSV domain to `email_domains` if not already present (case-insensitive comparison against existing entries) and set `updatedAt = new Date()` on the same `db.update(clients).set({...})` call (matches the existing PUT route pattern at `clientSuccess.ts:150` — the table has no auto-update trigger). Do not modify `notes`, `sector`, or `status`.
   - **If no client match**: insert a new client with:
     - `name = row["Organization"]` (original casing)
     - `sector` defaulted from a `.edu`-suffix heuristic on the domain (`.edu` → `higher-ed`, all others → `other`); the developer reviews and re-classifies healthcare manually after seed
     - `email_domains = [lowercased_domain]`
     - `status = 'active'`
     - `notes = row["Notes"]` verbatim (so context like "Website is bryanhealth.com but employee email domain is bryanhealth.org" is preserved)
5. **Pre-check for domain conflicts.** Before insert, query `clients` for any row whose `email_domains` already contains the domain we're about to insert. If found (and the matching row's `name` differs from this CSV row's `Organization` — i.e., we'd be assigning the domain to two different clients), log an error, skip the row, and exit with a non-zero status at the end so the developer notices. Domain uniqueness across clients is not enforced by a database constraint (jsonb doesn't support cross-row unique on contents), so the seed must enforce it in application code.
6. Print a summary: inserted N, updated M, skipped K, conflicts C.
7. **Idempotent — with one caveat.** A second run after no CSV changes must produce `inserted=0, updated=0, skipped=K_first_run, conflicts=0`. The vitest test in `__tests__/seedClientDomains.test.ts` asserts this against a fixture. Caveat: if a user manually renames a client between runs (e.g., "Alvin College" → "Alvin Community College"), the case-insensitive name match will fail and the second run will insert a duplicate. Documented limitation; rename-then-re-seed is not a supported flow.

8. **Database access**: the seed script imports `db` from `../db/index.js` and inherits the existing `DATABASE_URL` env requirement. Run via `npm run seed:client-domains` (which invokes `tsx src/scripts/seedClientDomains.ts`). The npm script entry: `"seed:client-domains": "tsx src/scripts/seedClientDomains.ts"` (matches the existing dev-tooling pattern; `tsx` is already a dev dep used by the dev server). Null-guard `db` at script entry: if `DATABASE_URL` is unset, print a friendly error and exit non-zero.

**Edge cases the script handles:**

- Empty `Email Domain` cell → skip the row, log warning, count as skipped.
- Quoted commas in `Organization` — handled by `csv-parse`.
- Doubled-quote escapes inside Notes — handled by `csv-parse`.
- Source-line concatenation noted in the CSV ("Golden West College Chemeketa Community College" already split into separate rows by hand) — script doesn't need to re-split.
- Domain casing — lowercased before insert and before any compare.
- Domain regex validation — same `DOMAIN_RE` as `clientLookup.ts` (exported, single source of truth); invalid → log and skip.
- Cross-client domain conflicts — detected before insert, logged with row #, errors non-zero exit.

**Sub-entity decision** (resolves the contradiction with the Webinars feature mockup): **a parent client owns multiple domains in a single `clients` row.** Sub-entities are *not* separate rows. MedStar's five sub-orgs become one client with `email_domains = ['medstar.example', 'medstar.example.org', ...]`. The Webinars "Top Organizations" stat rolls up by `clients.id`, so the same client row already does the parent grouping — no separate rollup logic needed. The [webinars-feature.md](webinars-feature.md) decision line about "5 sub-orgs roll up to one parent in Top Organizations; they remain separate rows in the Clients admin" is **superseded by this doc**; update is tracked there.

## Multi-domain chip input

The `email_domains[]` field in the Add/Edit Client modal uses a chip-style input. Pattern reference: [packages/client/src/pages/TestimonialManager.tsx:1552-1680](../../packages/client/src/pages/TestimonialManager.tsx#L1552-L1680) and [ManualEntry.tsx:57-160](../../packages/client/src/pages/ManualEntry.tsx#L57-L160) already implement this idiom inline. We lift it into a small reusable `<ChipInput>` component at `packages/client/src/components/ChipInput.tsx` and consume from both `AddClientModal.tsx` and the new DNC dialog. Not a from-scratch build.

Validation: each chip must look like a domain (lowercased before testing). The component imports `DOMAIN_RE` from a shared client-side constants module — **NOT** duplicated. Since the canonical regex lives in `packages/server/src/lib/clientLookup.ts`, we mirror it in `packages/client/src/lib/domainRegex.ts` (or wherever the client-side string constants live) with a code comment pointing to the server-side source. Both must stay in sync — call this out in the PR description so future edits change both.

Rejects: `.foo.com`, `foo-.com`, `-foo.com`, `foo..com`. Accepts: `iu.edu`, `bryan-health.org`, `houstonmethodist.org`. IDN/punycode is not in scope — none of the existing client data uses it, and adding it would risk regressions. Document if/when needed.

## Routes — exact paths and mounting

The DNC router mounts as a **sub-router inside `clientSuccess.ts`**, so all DNC paths sit under `/api/client-success/do-not-contact`. Concretely:

```ts
// In packages/server/src/routes/clientSuccess.ts (near the existing clients routes):
import { doNotContactRouter } from "./doNotContact.js"
// …existing routes…
router.use("/do-not-contact", doNotContactRouter)
```

And `doNotContact.ts` exports a `Router` instance. Note: `requireAuth` is applied globally at `/api`, so the GET handler doesn't add it again — it inherits. (Mount position in `clientSuccess.ts` doesn't matter: `/do-not-contact` and `/clients/:id` have different first path segments and won't collide regardless of order.)

```ts
import { Router, type Request, type Response } from "express"
import { requireWriteAccess } from "../middleware/auth.js"
export const doNotContactRouter = Router()
doNotContactRouter.get("/", listHandler)
doNotContactRouter.post("/", requireWriteAccess, createHandler)
doNotContactRouter.delete("/:id", requireWriteAccess, deleteHandler)
// listHandler/createHandler/deleteHandler are (req: Request, res: Response) => Promise<void>
```

**Auth model**: this app applies `requireAuth` globally at `app.use("/api", requireAuth)` in [packages/server/src/index.ts:169](../../packages/server/src/index.ts#L169). So every `/api/*` request is already authenticated before reaching the DNC handlers. `requireWriteAccess` is an *additional* check (admin role only) on top of the global auth — it does NOT subsume `requireAuth`. The route file does NOT need to re-add `requireAuth`.

| Method | Path | Gate | Notes |
|---|---|---|---|
| GET | `/api/client-success/do-not-contact` | (global auth only) | Returns all DNC entries. Admin-only on the frontend (UI hides for non-admin) but API is open to any authenticated user — same level as `GET /clients` today. **Intentional.** |
| POST | `/api/client-success/do-not-contact` | `requireWriteAccess` | Body: `{ email, institution, comment?, clientId? }`. Server validation: (1) `extractDomain(email) !== null` (400 otherwise: "Invalid email — domain must be a valid format"); (2) `institution.trim() !== ""` (400 otherwise); (3) if `clientId` provided, query `clients` for existence (400 otherwise: "Linked client not found"); sets `domain` server-side, sets `createdBy = (req.session as any)?.userName \|\| 'unknown'`. Returns the inserted row. On duplicate email: catch postgres error code `'23505'` (unique_violation) explicitly — `try { ... } catch (e) { if ((e as any)?.code === '23505') return res.status(409).json({ error: 'A DNC entry already exists for this email' }); throw e; }`. Do not pattern-match on the error message (the unique index has no constraint name, so the message references the index name `do_not_contact_email_uniq`). |
| DELETE | `/api/client-success/do-not-contact/:id` | `requireWriteAccess` | Loads the row inside `db.transaction(async (tx) => …)`, calls `logDoNotContactDelete(tx, snapshot, deletedBy)`, deletes, commits. 404 if not found. The transaction guarantees audit-then-delete atomicity. |

`GET /api/client-success/clients` gains an optional `?status=active|prospect|former|archived` query param. Default behavior (no param): return all rows regardless of status — backwards-compatible with existing callers. The frontend roster always passes an explicit filter. **Invalid status values** (anything not in the allowed set) are silently ignored — handler treats them as "no filter," returning all rows. This matches the silent-tolerance pattern in `clientSuccess.ts` for similar query params and avoids breaking when a frontend sends a stale enum value during a deploy.

**Breaking type change to be aware of:** the response shape adds `status` and `emailDomains` fields. Any existing call site that destructures `ClientResponse` with an exhaustiveness check (TS `satisfies` or pattern match) will need to update. In practice the existing callers spread or pick specific fields, but verify before merging. The audit script: grep for `ClientResponse` across `packages/client/src/` and check each usage.

CSRF: existing CSRF middleware applies automatically to mutating routes — no per-route opt-in needed.

## Client API shape changes (api.ts)

```ts
// Extended ClientResponse
export interface ClientResponse {
  id: string
  name: string
  sector: "higher-ed" | "healthcare" | "other"
  notes: string | null
  status: "active" | "prospect" | "former" | "archived"   // NEW
  emailDomains: string[]                                    // NEW
  createdAt: string
  updatedAt: string
}

// Extended create/update params (both methods take the same shape)
async create(data: {
  name: string
  sector: "higher-ed" | "healthcare" | "other"
  notes?: string
  status?: "active" | "prospect" | "former" | "archived"   // defaults server-side to 'active'
  emailDomains?: string[]                                   // defaults server-side to []
}): Promise<ClientResponse>

// New
export interface DoNotContactEntry {
  id: string
  email: string
  domain: string
  institution: string
  comment: string | null
  clientId: string | null
  createdAt: string
  createdBy: string
}

export const doNotContactApi = {
  list: () => Promise<DoNotContactEntry[]>,
  create: (data: { email: string; institution: string; comment?: string; clientId?: string }) => Promise<DoNotContactEntry>,
  delete: (id: string) => Promise<void>,
}
```

## Files touched

### Server

- **Edit:** `packages/server/src/db/schema.ts` — add `uniqueIndex` and `sql` imports; add `status`, `emailDomains` columns to `clients` (with new third-arg index callback since clients currently has none); extend `auditLog.entityType` enum array to include `'DO_NOT_CONTACT'` and `'CLIENT'`; extend `auditLog.actionType` enum array to include `'DELETE'`; add `doNotContact` table; export `DoNotContactEntry` and `NewDoNotContactEntry` types
- **Edit:** `packages/server/src/types/index.ts` — extend `AuditEntityType` union to include `"DO_NOT_CONTACT" | "CLIENT"`; extend `AuditActionType` union to include `"DELETE"`
- **Generated by drizzle-kit:** `packages/server/src/db/migrations/<auto-named>.sql` — produced by `npm run db:generate`; verify against "Expected Drizzle output" block above; **do not hand-edit**
- **New:** `packages/server/migrations/003_active_clients_constraints_and_rls.sql` — CHECK constraints (recovered from auto-named CHECKs via DO block), real GIN+jsonb_path_ops index, and RLS on new table (hand-applied via Supabase SQL editor)
- **New:** `packages/server/src/lib/clientLookup.ts` — `extractDomain`, `lookupClientByEmail`, `listActiveClients`, `isDoNotContact`
- **New:** `packages/server/src/__tests__/clientLookup.test.ts` — vitest unit tests for `extractDomain` edge cases + lookup behavior with a stub db
- **New:** `packages/server/src/routes/doNotContact.ts` — GET/POST/DELETE handlers; DELETE writes audit row first via the new auditService helper
- **Edit:** `packages/server/src/routes/clientSuccess.ts` — extend POST `/clients` and PUT `/clients/:id` to accept `status` + `emailDomains`; add `?status` query support to GET `/clients` (silently ignore invalid values); extend DELETE `/clients/:id` to first query `do_not_contact` for `client_id` matches, log the count via the existing `auditService` pattern, return the count in the response body so the frontend warning modal can show "N DNC entries unlinked"; mount the DNC sub-router via `router.use("/do-not-contact", doNotContactRouter)`
- **Edit:** `packages/server/src/services/auditService.ts` — add `logDoNotContactDelete(tx, snapshot, deletedBy)` helper. The `tx` param is typed as the first argument of the Drizzle transaction callback: `type Tx = Parameters<Parameters<NonNullable<typeof db>["transaction"]>[0]>[0]` (a utility type that avoids importing Drizzle's internal `PgTransaction` types directly). The helper inserts via `tx.insert(auditLog)` (not the top-level `db`) so the audit write commits or rolls back with the DNC delete. Inserted row: `{ actionType: 'DELETE', entityType: 'DO_NOT_CONTACT', entityId: snapshot.id, details: {...snapshot, createdAt: snapshot.createdAt.toISOString(), deletedAt: new Date().toISOString()}, actor: deletedBy }` — `entityId` carries the deleted row's id; Date fields are serialized to ISO strings before going into `details` jsonb (Drizzle/postgres-js will serialize a raw `Date` as `{}` otherwise). Unlike the existing `logAudit` helper (which swallows errors with a console.error), this helper **must throw** on failure so the surrounding transaction rolls back.
- **New:** `packages/server/src/scripts/seedClientDomains.ts` — one-off seed script (see Seed strategy)
- **New:** `packages/server/src/__tests__/seedClientDomains.test.ts` — idempotency test (parse fixture, dry-run, second run must produce zero changes)
- **Edit:** `packages/server/package.json` — add `seed:client-domains` npm script; add `csv-parse` dependency (not currently in repo — verified)

### Client

- **New:** `packages/client/src/lib/domainRegex.ts` — mirror of `DOMAIN_RE` from the server-side `clientLookup.ts`, with a comment pointing to the server source. (Plain JS regex; trivial to keep in sync.)
- **New:** `packages/client/src/components/ChipInput.tsx` — reusable chip-style multi-input with regex validation; imports `DOMAIN_RE` from the above file
- **Edit:** `packages/client/src/components/client-portfolio/AddClientModal.tsx` — add Status dropdown + `<ChipInput>` for `emailDomains`; thread new fields through `clientsApi.create/update`
- **Edit:** `packages/client/src/components/client-portfolio/ClientRoster.tsx` — status filter chips (Active / Prospect / Former / Archived / DNC / All), status pills + optional DNC badge on each card, `Show Do Not Contact` toggle, "Move to DNC" action button per card (admin-gated via `useClientData().isAdmin`, matching the existing pattern in the same file)
- **New:** `packages/client/src/components/client-portfolio/DoNotContactSection.tsx` — DNC list view, bi-directional move actions
- **New:** `packages/client/src/components/client-portfolio/DoNotContactDialog.tsx` — the three-field "Add Organization to Do Not Contact" dialog with the org-wide confirmation callout
- **Edit:** `packages/client/src/components/client-portfolio/ClientPortfolioContext.tsx` — extend context to expose `dncEntries`, `refreshDnc()`, and a `showDnc` toggle state
- **Edit:** `packages/client/src/lib/api.ts` — extend `ClientResponse` + `clientsApi.create/update` types; add `doNotContactApi` and `DoNotContactEntry` type
- **Edit:** `packages/client/src/components/client-portfolio/types.ts` — add `ClientStatus` and re-export `DoNotContactEntry`

### Data / mockups

- **Read-only:** `Webinar Data/Stamats-Client-Domains-2025-2026.csv` — seed input, not modified
- **No change:** `packages/client/src/data/clientSuccessData.ts` — explicitly out of scope per the existing decision
- **Delete after webinars phase 1 ships:** `mockups/webinars-05-clients.html` — the standalone clients-registry mockup is superseded by Client Portfolio; deletion tracked in webinars-feature.md "What still needs to be built"

## The boss-friendly version

> "We manage the client list in one place — Client Portfolio. The Webinar feature reads from it. Active clients get tagged as clients. Anyone we shouldn't contact goes on a Do Not Contact list and disappears from all our outreach views — but we keep the record so we can reverse it later. Everyone else is a non-client, which is our outreach pool."

Four things to land: one list, it flows downstream, non-clients = leads, do-not-contact is hidden but reversible.

## What we are not doing (and why)

- **No second clients table.** The Webinars mockup's standalone domain registry idea is dead.
- **No second DNC list per feature.** Webinars, Sales Machine, future Outreach all read from the same `do_not_contact` table.
- **No sync job.** Sync is only a problem with two stores. One store, no sync.
- **No data migration of `clientSuccessData.namedClients`** in [packages/client/src/data/clientSuccessData.ts](../../packages/client/src/data/clientSuccessData.ts). That hardcoded list is for asset matching (case studies/testimonials), not lifecycle. Separate cleanup pass, separate doc.
- **No auto re-categorization** on status flip or DNC change. Explicit re-categorize button only — see above.
- **No hard delete of DNC entries without audit.** Removal writes to `audit_log` so "did we ever have X on the list?" is always answerable.
- **No per-individual DNC suppression.** A `do_not_contact_email_exact` table for blocking just one person at an org we still serve is out of scope. The current "matching by extension" decision means DNC is always org-wide. If we ever need per-individual suppression, that's a separate doc and a separate table.
- **No database-level cross-row domain uniqueness.** Postgres can't unique-constrain "this string doesn't appear in any other row's jsonb array." The seed script and the POST/PUT client routes enforce uniqueness in application code (pre-insert query). The first time someone tries to add a domain that's already on another client, they get a 409 with the conflicting client's name.

## Edge cases the UI surfaces explicitly

These are real cases the design has to handle, not hypotheticals — calling them out so they don't slip through to implementation:

- **A DNC domain is also on an active client's `emailDomains`.** Allowed. The Client Portfolio roster shows the client's status pill plus a small red "DNC" badge. The Webinars categorize chain returns "do-not-contact" (DNC wins) — so the registrant row has `category='do-not-contact'` and **`client_id=NULL`**, even though there's a matching active client. This means "Top Organizations" stats undercount that client by however many of their contacts hit DNC. Documented limitation; acceptable for v1.
- **A DNC entry's domain is not on any client.** Common case (the dialog can be filled out for any institution). The DNC entry has `client_id=NULL` (not because of DNC-wins precedence, but because no client owns the domain). Bi-directional move action "Move to Client" still works — it pre-fills the Add/Edit Client modal with the domain and lets the user create a client.
- **Deleting a client that has DNC entries linked.** The DB has `ON DELETE SET NULL` on `do_not_contact.client_id`, so DNC entries survive. The frontend `DELETE /clients/:id` confirmation modal warns: *"This client has N entries on the Do Not Contact list. Those entries will stay (suppression survives), but will no longer be linked to this client."*
- **A client's `status='archived'`.** Renders in the roster with reduced opacity, behind the `Archived` filter chip. Excluded from outbound-feature targeting the same way DNC is, but is NOT a member of the DNC list and does NOT appear under the `Do Not Contact` chip. Two different concepts: archived = "we don't actively work with them anymore," DNC = "do not reach out."

## Build order (prerequisites + sequence)

This work has hard dependencies — building in the wrong order produces compile errors with no obvious cause.

**Prerequisite (before this work starts):**

- The "Client Portfolio — Add Asset menu" feature (currently uncommitted, files: `NewEntryPanel.tsx`, `ClientAssetsTab.tsx`, `ClientPortfolioContext.tsx`) must be **smoke-tested in the browser and committed** first. That feature touches two of the same files this plan does (`ClientPortfolioContext.tsx`, peripheral to `AddClientModal.tsx`); merging them in flight is avoidable churn.

**Build sequence (linear — each step depends on the prior):**

0. Fix the `db:generate` / `db:push` npm scripts to use `:pg` suffix (see drizzle-kit gotcha section).
1. **Atomic edit (single commit) — schema.ts + types/index.ts**: add `status`/`emailDomains` to clients; add `doNotContact` table; extend `auditLog.entityType` and `auditLog.actionType` enums in schema.ts AND extend `AuditEntityType` and `AuditActionType` unions in types/index.ts at the same time. Splitting these across commits causes mid-commit type errors because auditService.ts imports from both.
2. `npm run db:generate`, verify generated SQL against the "Expected Drizzle output" block, apply locally via `db:push`.
3. Apply the hand-applied `003_active_clients_constraints_and_rls.sql` against the local DB via the Supabase SQL editor (CHECK constraints + GIN+jsonb_path_ops + unique `lower(email)` + RLS).
4. Verification INSERT in SQL editor: `INSERT INTO audit_log (action_type, entity_type) VALUES ('DELETE', 'DO_NOT_CONTACT');` — confirms new CHECKs are active. Then `ROLLBACK` or delete the test row.
5. `clientLookup.ts` + unit tests (vitest).
6. `auditService.ts` helper (`logDoNotContactDelete(tx, ...)` — accepts tx, throws on failure).
7. `doNotContact.ts` route file + extensions to `clientSuccess.ts` (mount + `?status` query + DELETE handler returning DNC orphan count).
8. `lib/api.ts` extensions (client-side).
9. `lib/domainRegex.ts` (client-side mirror of DOMAIN_RE) + `ChipInput.tsx`.
10. `AddClientModal.tsx` edits (status dropdown + chip input).
11. `ClientPortfolioContext.tsx` extensions (dncEntries, refreshDnc, showDnc).
12. `DoNotContactDialog.tsx` + `DoNotContactSection.tsx`.
13. `ClientRoster.tsx` edits (filter chips, pills, badges, Move-to-DNC, Delete-client warning when DNC orphans > 0).
14. `seedClientDomains.ts` + idempotency test + `npm install csv-parse`.
15. Backfill verification (`SELECT id, name, status FROM clients` to confirm 'active' default is correct for all existing rows).
16. Run seed script against local. Then commit if green.
17. Apply `003_*.sql` against the prod Supabase via MCP, then deploy code. Verification INSERT against prod, then ROLLBACK.
18. Manual smoke test (admin + non-admin paths, both UIs, every move action).

## Effort estimate

| Piece | Time |
|---|---|
| schema.ts edits + `db:generate` + verify output + local apply | ~30 min |
| `types/index.ts` enum extensions | ~5 min |
| Operational RLS migration (`003_*.sql`) + Supabase apply | ~10 min |
| `clientLookup.ts` helpers + unit tests against `extractDomain` edge cases | ~45 min |
| `auditService.ts` `logDoNotContactDelete` helper | ~15 min |
| `doNotContact.ts` routes (CRUD + audit-log on delete) | ~45 min |
| `clientSuccess.ts` PUT/POST extensions + `?status` query support + sub-router mount | ~30 min |
| `seedClientDomains.ts` script + idempotency test + `csv-parse` install | 1 hr |
| `ChipInput.tsx` reusable component + tests | ~30 min |
| `AddClientModal` status dropdown + chip input + thread through api.ts types | 1 hr |
| `ClientRoster.tsx` filter chips + status pills + DNC badge + Move-to-DNC action + show-DNC toggle | 1.5 hrs |
| `DoNotContactSection.tsx` + `DoNotContactDialog.tsx` + bi-directional moves + domain-picker for multi-domain clients | 2 hrs |
| `ClientPortfolioContext` extensions + `lib/api.ts` extensions | ~45 min |
| Backfill verification + run seed | ~30 min |
| Manual smoke test (admin + non-admin paths, both UIs) | ~45 min |
| **Total** | **~10–11 hrs of focused work** |
| Wiring Webinars upload parser to consume this | Comes for free during phase 1 of Webinars |

## Related work

- [webinars-feature.md](webinars-feature.md) — the first consumer of this source of truth
- [client-portfolio-add-asset-menu.md](client-portfolio-add-asset-menu.md) — recent uncommitted UI changes to Client Portfolio that overlap with the Add/Edit modal touched here
