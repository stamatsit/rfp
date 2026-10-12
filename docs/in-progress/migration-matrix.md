# Migration Matrix

The migration team's live dashboard, fed by spreadsheet snapshots. The
authoritative plan (architecture, contract, DDL, build manifest, acceptance
script, rollback) is `~/Desktop/Apps/migration matrix/PRODUCT-PLAN.md` v3.1;
this doc tracks only what is done in THIS repo.

## Decisions locked in
- Snapshot contract 1.x: agent POSTs {contract, generated_at, source,
  source_files, week, week_lbl, data, facts, findings} to /api/migration/ingest.
- Machine auth: x-mm-ingest-token header vs MM_INGEST_TOKEN env, constant-time
  compare, handler in the PRE-AUTH zone of api/index.ts (and mounted before
  requireAuth in Express). First machine-auth endpoint in the app.
- Write gate: path.startsWith("/migration/") added to isWriteExemptPath so
  /migration/archive and /migration/chat/stream work for non-admins.
- Bundle queries mm_* via raw queryClient template literals (like clients /
  client_success_*); pgTable consts are reference-only, NOT registered in the
  drizzle schema param.
- Tables: mm_snapshots (immutable JSONB, dedupe by source_hash vs latest row),
  mm_projects (archive state, lower(name) unique), mm_ingest_log. RLS on all.
- Tile id `migration-matrix`, route `/migration` (the existing content-matrix
  tile/route is a DIFFERENT live DynoMapper tool; untouched).

## Files touched (Phase 1)
- packages/server/migrations/005_migration_matrix.sql (+ _DOWN.sql)
- packages/server/src/db/schema.ts (mm tables)
- packages/server/src/routes/migration.ts (ingestHandler + default router)
- packages/server/src/routes/index.ts (mount)
- packages/server/src/index.ts (pre-auth ingest mount)
- api/index.ts (schema consts, pre-auth ingest, session routes, write exemption)

## What's left
- Apply 005 to rfp-prod (whichdb first), vercel env add MM_INGEST_TOKEN.
- Phase 2: client module (pages/MigrationMatrix.tsx + components/migration-matrix/).
- Phase 3: chat + CHART_DATA graphics. Phase 4: morning cron. Phase 5: Graph.

## Phase 1 (2026-09-15): pages first, weekly view, contract 1.1
Team review (Laura, Crystal, Sandra) asked for a projects table, pages not
hours, and a Monday-morning weekly view. Shipped:
- Contract 1.1 (additive): client rows carry assigned / left / min_per_page /
  hours_to_finish / rate_set / priority / dates; data.weekly holds per person,
  per week, per project pages assigned (tracker) vs done. Done follows
  Crystal's rule: client matrix Completion (Date) cells where a matrix exists
  (attributed to people by initials, contract/initials-map.json overrides;
  unresolved initials surface on the Weekly tab and as a MEDIUM finding),
  else the tracker's Pages Completed.
- client_matrix.py detects page rows by content (row 4 counts row skipped,
  data from row 5, write-new pages without a legacy URL counted): Morehead
  went 152/81 -> 157/84, matching Crystal's own dashboard counts.
- chat_server.facts_blob adds projects_table, weekly_by_person and an
  up-to-date team_performance from present_data.json (make_present writes it).
- Client: ProjectsTable (sort, filter chips, text filter, totals row),
  Weekly tab (week picker, per-person assigned vs done with per-project
  expand, capacity, unmatched initials), Team and Person views pages first
  (hours muted), project page pages-first stats + by-person table.
- Briefs: manager brief is PROJECTS / PEOPLE / WATCH / NEXT one-liners;
  migrator brief is three lines. Both twins (service + api/index.ts).
Not done: Laura's tracker restructure (single sheet + status column) lands
later; HM projects have no matrix in the app, so their weekly "done" is the
tracker's Pages Completed until Crystal's HM sheets arrive.

## Rebuilt tracker (2026-10-12): contract 1.2
Laura rebuilt the assignment spreadsheet from scratch on 2026-09-30 (the
9/18 file was a prototype). The pipeline now reads both layouts:
- Rebuilt layout, detected by headers: one `Projects` sheet with a Status
  column (active / planned / completed) and per page type sizing (AS IS,
  OPTIMIZE, QA, PUBLISH, FIREFIGHTING: total pages, minutes per page, pages
  per hour, hours). `_parse_project_sheet_v2` folds the build types into the
  one-type fields the dashboard reads (pages and hours summed, blended rate,
  QA separate) and ships the detail as `page_types` (additive, hence 1.2).
  `Assignments` triplets are Pages Assigned / Hours / Hours Left from row 7
  with no completed column (done comes from the client matrix only); roles
  the Projects sheet sizes (Publish, Firefighting) count as page work. No
  Weekly Capacity sheet, so those checks are skipped.
- Planned projects without a page count (Coe, HM Physicians) now appear
  with their start dates ("no page count yet").
- New findings: `deadline-before-start` (Washtenaw was typed 2026-01-01),
  `hours-cell-stale` (sheet hours cell disagrees with pages at rate).
- Dropped by Laura's rebuild: Morehead, UTPB, Northwestern, CCC, Premier,
  HMAI. The Morehead matrix in the folder links to no project now.
Pending: Crystal's `content-matrix-washtenaw.xlsx` lives in her own OneDrive;
the sync only reads the shared Migration Matrix folder, so WCC done stays 0
until her working copy sits there next to the Morehead one.
