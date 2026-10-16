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

## Sources read in place (2026-10-12)
The sync no longer needs copies in Eric's OneDrive folder. `MM_SHARE_URLS`
(GitHub secret, one "Anyone with the link" share per line, folder or single
file, any owner, optionally `name.xlsx=link`) replaces `MM_SHARE_URL`. A
file link is followed for its guest cookie, downloaded with `&download=1`,
and named via REST `GetFileById`. cloud_sync writes
`contract/sources-weburls.runtime.json` (name -> link) and push_snapshot
uses it for the dashboard's open buttons; `folder_url` is empty then.
Live links: Laura's tracker (her OneDrive root), Crystal's Morehead matrix
(morehead-alumni/), Crystal's WCC matrix (Documents/Washtenaw, link pending).
If an owner removes or regenerates a link the run fails loudly rather than
serving stale data. Graph (IT consent) remains the no-anonymous-links option.

## Matrix tabs and ownership (2026-10-13)
Crystal's WCC matrix exposed two accuracy holes in client_matrix.py:
- Tab selection was "any sheet 60+ columns wide", which swallowed
  For-Reuse-Delete (5,107 rows, 16,375 columns) as pages. Section tabs are
  now the numbered ones (`1-Stamats`, `2-Programs`, `3-WCC`); other wide tabs
  are skipped and reported (`matrix-tabs-skipped`). A matrix with no numbered
  tab keeps the width rule. The DASHBOARD tab cannot be the selector: its
  Tab ID rows are template leftovers.
- Pages whose Assigned To names the client (3-WCC: 544 rows) never get a
  Stamats completion date, so they are left out of every count
  (`matrix-client-owned`); a blank owner inherits its tab's majority.
`matrix-tracker-pages-differ` (MEDIUM) fires when the tracker's page count and
the matrix's Stamats page count differ by more than 5% (Washtenaw: 802 vs
697). Percent done stays matrix built over tracker total until they agree.

## Done means delivered (2026-10-13, Eric)
Deliver to Client (column BB) is the one source of truth for completion.
A project's Done and percent done are delivered pages over the tracker
total. Per person, a delivered page counts for the migrator who built it
(column AO) and the QA who passed it (column AR) in the week of its BB
date; the Weekly, Team and Person views all say "done" and mean delivered.
Built (column AP, the migrator's own completion date) is shown beside done
on the project page and drives hours to finish, since hours are about
building; required pace is pages not yet delivered over weeks left.
Columns AT to BA (QA and rework rounds) are read but are not progress.
Delivery lags building by about five days (112 built vs 14 delivered in
the week of 10/5), so a page built on Friday shows as done the week after.
Client rows add `built` and `left_to_build`; facts add `built` and
`not_delivered`.

## Pipeline, QA queue, per day (2026-10-13, contract 1.3)
Decided with Eric by multiple choice:
- Denominator: the matrix's Stamats page count where a matrix exists (same
  source as done); the tracker's sizing rides along as `planned_total` and
  shows as "planned N" under Total when it differs.
- One stage per page, from the latest round with any entry, no pass or fail
  inferred: delivered (BB) / in QA (build dated, QA not) / QA done, not
  delivered / building (initials, no build date) / ready to build (AN) /
  not started. `client_matrix.page_stage`. Stages sum to the matrix total.
- Waiting on: who holds pages in QA (latest round's QA initials) or to
  build (migrator initials); blank initials are an explicit "unassigned"
  row, never attributed. Project page card, Team tab columns In QA and
  Building (sort "by QA to finish"), `overview.qa_unassigned`, chat facts
  `pipeline` / `waiting_on` / `pages_in_qa_now`, manager brief WATCH line.
- Weekly tab: weeks stay the Monday number; each week carries `days`
  (pages delivered per working day per person) shown when a row expands
  and on the person page.
First run on Washtenaw: 697 Stamats pages, delivered 19 (3%), in QA 206 of
which 201 have no QA initials, building 228 (Chris J 150, Debbie 42,
Brian 27, Katie 9), ready 227, not started 9.

## Sync now (2026-10-16)
A button in the dashboard header reads the spreadsheets right away, on top of
the 10-minute schedule (Eric: "a sync button in addition to 10min intervals").
- Click: `POST /api/migration/sources/sync` fires the same repository_dispatch
  as the Vercel cron tick and returns `requested_at` (server clock, taken
  before the dispatch).
- Every run of `cloud_sync.py` stamps the moment it started reading
  (`run_started_at`, sent with the snapshot via `MM_RUN_STARTED_AT`). The
  ingest keeps it in `mm_ingest_log.detail` as `run_started_at=<iso>` on
  stored, deduped, rejected and heartbeat rows. No migration: the outcome
  CHECK constraint is unchanged.
- A failed run posts a heartbeat `sync failed: <reason>` with the same stamp
  (never on dry runs). Reasons are written for people: a revoked share link
  reads "spreadsheet link 2 of 3 stopped working (HTTP 404); check the file is
  still shared with 'Anyone with the link'". Messages name a link by position,
  never by URL (Actions logs on this public repo are public), and the report
  replaces any URL with `[link]` as a backstop.
- `GET /api/migration/sync-status?since=<requested_at>`: done once ANY run that
  started at or after the click stored or deduped (the dispatched run or a
  scheduled one that beat it; both read the sheets after the click), failed for
  a tagged failure or rejection, otherwise pending. A success wins over a
  failure. Runs already under way at the click, and untagged rows, never count.
  Logic: `packages/server/src/services/migrationSync.ts`, shared by both twins.
- Client: `hooks/useMigrationSync.ts`, a module-level store (survives the
  pathname-keyed remounts and resumes after a reload via sessionStorage). Polls
  every 4s, gives up after 5 minutes with advice, reports each outcome once
  (StrictMode-safe), reloads the snapshot on success. A failure shows at once
  but keeps listening until the timeout: a run queued behind the failed one
  (the workflow's concurrency group queues runs) can still succeed, and then
  the page turns to "Synced". The note under the header (`p[role=status]`)
  explains anything but success and clears once a newer read arrives (compared
  on server timestamps).
- Header: "Open the matrix" shows only when exactly one matrix feeds the
  dashboard; with several, each project page links its own and the Spreadsheets
  tab lists them all.
- Tests: `migrationSync.test.ts` (19), `e2e/migration-matrix.sync.spec.ts` (13:
  happy path, nothing new, failure announced once and cleared by a later read,
  failure recovered by a queued run, timeout, not configured, JSON and non-JSON
  server errors, keyboard and double press, reload resume, axe light and dark).
- Known gap, unchanged here: ingest dedupe never fires (it compares JSON from
  jsonb, which reorders keys), so every run stores a snapshot. If that is fixed,
  the header's "updated N min ago" must count from the last successful read,
  not the last stored snapshot, or a no-change sync will look stale.
