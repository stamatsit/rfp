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
