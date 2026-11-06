# Migration Tracker tests

Nothing here touches production, and no client links or passwords belong in this folder (the repo is public).

## Everything that can run by itself

```bash
cd tools/migration-matrix
python tracker_tests/run_all.py --old OLD_TRACKER.xlsx
```

Builds a release workbook, then runs:

- `test_client_matrix.py`: matrix columns are found by name; moved columns change nothing; missing ones stop the run.
- `verify_against_old.py`: every goal, person, hours and hours-left value matches the old tracker, and Still to assign
  matches a calculation done here from the old page totals.
- `stress.py`: adds a person and projects, then tries bad names, duplicates, text and negative goals, overbooking,
  a removed line, a seventh project in Still to assign, and layout damage.
- `test_tracker_v1.py`: damaged files are refused with a plain message.

Needs Python with openpyxl and xlsxwriter, plus LibreOffice (`soffice`).

## The real server route on a real database

```bash
docker run -d --name mm-e2e-pg -e POSTGRES_PASSWORD=local -p 127.0.0.1:55432:5432 postgres:15-alpine
docker exec mm-e2e-pg psql -U postgres -c "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;"
docker exec mm-e2e-pg psql -U postgres -c "CREATE TABLE clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);"
for f in 005_migration_matrix.sql 006_mm_reports.sql; do
  docker exec -i mm-e2e-pg psql -U postgres -v ON_ERROR_STOP=1 < packages/server/migrations/$f
done
cd packages/server
DATABASE_URL='postgres://postgres:local@127.0.0.1:55432/postgres' MM_INGEST_TOKEN=local-e2e \
  SUPABASE_URL=http://127.0.0.1:9 SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy \
  npx tsx e2e/mm-harness.ts &
python tools/migration-matrix/tracker_tests/e2e_realdb.py SNAPSHOT.json
```

`SNAPSHOT.json` comes from `push_snapshot.build_snapshot()` after a local `build_master.py` and `make_present.py`.

## The real sync without production

**`cloud_sync.py` posts to production unless told otherwise.** Always set `MM_INGEST_URL` to a local address:

```bash
MM_INGEST_URL=http://127.0.0.1:3002/api/migration/ingest MM_INGEST_TOKEN=local-e2e \
  SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=dummy MM_SHARE_URLS="<tracker link>" \
  python cloud_sync.py
```

Run it from a copy of this folder, because it writes `sources/` and `master.db` beside itself.

## By hand, in real Excel

LibreOffice calculates formulas but behaves differently from Excel, and real Excel has caught bugs nothing else did
(`##########` in narrow date columns, cut-and-paste rewiring formulas). After any layout change, on a test copy:

1. It opens with no repair prompt. Colors and frozen panes look right on every tab.
2. Typing in a locked cell is refused. The dropdowns open. A made-up name and text in a goal are refused.
3. Add a person on Team. They appear in the Assignments dropdown and on Capacity.
4. Paste text over a goal: the row shows Bad goal and the chip says 1 to fix.
5. Cut a goal to another week: its hours and Left follow it. Cut a name to another row: both rows show Incomplete.
   Change a goal: Still to assign moves at once. Clear a line's person, project and job: its pages come back.
6. Filter by project. Open a link. Close the file, download it, and run `test_tracker_v1.py` on Excel's saved copy.
