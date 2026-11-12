# Migration Tracker workbook

Replaces the old tracker spreadsheet. Built by `tools/migration-matrix/build_tracker_workbook.py`.
Started 2026-11-04. This repo is public: no share links or the structure password in here.

## Who owns what

- Laura approved Eric taking over the tracker on the to-do thread, 2026-11-04 ("make a copy so we
  have the original but go for it"). The original tracker file stays untouched.
- Crystal's client matrices are out of scope and do not change. They run the whole project (66
  columns, 13 marked as the client's), and a row-level audit found their entries nearly spotless.
- App changes stay local until Eric approves them after full end-to-end testing.

## Decisions locked in, from Laura's own description of how she works

- Keep her model: Projects holds the variables (pages, minutes per job), Assignments gives each
  person page goals by week.
- Keep Goal, Hours and Left beside each week, so feedback appears where she types.
- Keep the countdown, but as one number per project and job (changed 11/6 on Laura's feedback). She found the
  same number repeated on every row of a project, and wants to see the effect while she tries out goals on
  Assignments. Now "Still to assign" is pinned at the top of Assignments: one line per Active or Planned project
  with pages, each job's pages left of its total, a check at 0, "over" in amber, Active first. Six lines; past that,
  the last line counts the rest. The repeated per-row column is gone. The dashboard never read it.
- Removing a line: rows can't be deleted on a locked tab, and clearing a selection that includes a locked cell
  does nothing. Clearing a line's person, project and job removes it, and goals left on it count for nothing in
  the workbook and the reader alike. Found 11/5: Laura's leftover 0 on a nameless line made the reader refuse the
  file ("assignment rows do not add up").
- "I don't want to make it too complicated." People type in three tabs (Projects, Assignments,
  Team). Start Here and Capacity are read-only. No stats in the sheet: the dashboard does that.
- No macros (they do not run in Excel on the web), so adding someone means typing in the first
  open row, which is tinted.

## Integrity design

- Hidden key row (row 1) on Team, Projects and Assignments: `team.name`, `goal:2026-11-09`, etc.
  The dashboard must find columns by key, never by position or visible label.
- Hidden `_contract` sheet: format name and version, self-calculated totals, error count. The
  dashboard must refuse the file if the version is unknown, a total does not match its own sum, or
  errors is above 0, and keep the last good snapshot.
- Only entry cells are unlocked. Tabs are locked. Every formula is generated, so rows cannot drift.
- Color rules never point at another sheet, because Excel can treat that as a file problem.
- Dropdowns cannot stop a paste, which is why the Check column and Start Here checks exist.

## Bugs in the old tracker this fixes

- Pages Left on the Washtenaw As Is rows stopped counting after 10/26: showed 114, real number 46.
- Hours Needed used the wrong formula in places: Washtenaw As Is 15 (should be 380.5), Washtenaw
  Optimize 33.75 (30.75), Coe Optimize 60 (82). Rows used different formulas in the same column.
- The team dropdown range stopped one row short, so Leslie could not be picked.
- Week columns ended 12/28 and 9/7 was listed twice. Now runs through 12/27/2027.
- Weeks before 9/28 were not carried, because no assignment uses them.

## How it is built and tested

1. Build with xlsxwriter. 2. Have LibreOffice calculate every formula. 3. Rebuild with those results
stored, so a reader that never recalculates sees real numbers. 4. Compare against the old tracker
(every goal, hours, hours left, person) and run a stress test on a copy.

## What is left

- Move the verify, stress and upload scripts from the session scratchpad into the repo.
- Test in real Excel, in Teams and the browser: dropdowns, locks, color rules, links.
- New parser in `build_master.py` for this format, reading by key, with the refusal rules above.
- Read matrix columns by header name instead of fixed position in `client_matrix.py`.
- Connect matrices from the Projects tab's Matrix link column instead of the `MM_SHARE_URLS` secret
  (never log the links; Actions logs are public). Morehead is in the secret but not on Projects, so
  it needs a row first.
- Local end-to-end run with the Team tab rendered. Then Eric's approval, then a side-by-side week.
- Laura's dashboard column change is separate: branch `mm-laura-columns`, worktree `../data-app-mm-friday`.
- The destination link currently allows anonymous editing. The sync only needs to read, so tighten it
  after the final write.

## State as of 2026-11-04, end of day one

Everything below is local and uncommitted in worktree `../data-app-mm-tracker` (branch `mm-tracker-v2`),
which also carries Laura's column change. Nothing is pushed or deployed.

Added since the list above: `tools/migration-matrix/tracker_v1.py` (the reader and refusal gate),
`test_tracker_v1.py` (12 damaged-file cases), `sync_problem` on `/migration/latest` in both server paths
with a red banner on the page, and old-versus-new snapshot comparison (only QA pages on two planned
projects differ, because the workbook applies As Is + Optimize on every row).

Tested in real Excel for the web: opens clean, locks, dropdowns, rejected entries, filters, links, live
recalculation, and that hidden keys, protection and stored totals survive Excel's save. Full loop run with
real saves through the real `cloud_sync.py` against a local stub: add a person, break a row (refused, last
good numbers kept, banner shown), fix it (banner clears).

## Handoff, 2026-11-04 afternoon. Read this first when resuming.

Done and tested since the section above:
- `client_matrix.py` finds columns by header name. Moved columns change nothing; a missing required column stops
  the run. On real files it matches the old reader exactly, and with 2 columns inserted on every tab it still reads
  734 pages (the old reader read 0). `test_client_matrix.py` passes.
- `cloud_sync.py` reads matrix links from the Projects tab, maps each to its project, won't count a file twice,
  and only follows sharepoint.com links. Tested through the real sync with only the tracker link.
- The real `/migration` routes passed on a throwaway Postgres 15 in Docker (`sync_problem` shows and clears), apart
  from one wrong assertion since corrected, which still needs a rerun.
- Real paste tests in Excel on the web passed. Found and fixed a real bug: cut-and-paste rewired formulas and left
  hours under the wrong week. Rule now: no formula points directly at a typed cell (`safe_col`, `row_cell`, `_calc`
  mirrors). Retested in real Excel: hours follow the goal. A cut cell loses its styling, which is cosmetic.

Done 11/6 (Still to assign, see the decisions above):
- `tracker_tests/verify_against_old.py`, `stress.py` and `e2e_realdb.py` are in the repo; `run_all.py` passes. They
  read row positions from `_contract` and work out Still to assign independently.
- Desktop Excel (driven by AppleScript, copy in Excel's own container folder) calculates every value on every sheet
  exactly as LibreOffice does; `test_tracker_v1.py` and `verify_against_old.py` pass on Excel's saved copy. In Excel:
  Kelly OF +30 took Washtenaw As Is from 46 to 16; clearing her three cells gave her pages back.
- Uploaded to the real file (version 25 to 26, read back identical) after checking nobody had typed in it since
  11/5. Backups of both versions are in Dropbox From Bot, dated 11/6. Laura has not seen this version yet.

Found and fixed 11/6, in a full loop through Excel on the web on a test copy: Excel for the web does not
reliably recalculate a formula that uses an INDEX(...):INDEX(...) range and reads a helper cell. A new line for a
new person showed "Person?" and counted 0 pages, so the dashboard would have refused the file. Desktop Excel and
LibreOffice calculated it correctly, which is why nothing caught it before. Isolated with two small diagnostic
workbooks typed into in Excel on the web. The builder no longer builds any range with INDEX: lists run from their
locked header to the locked row after the table (item i is at position i + HEAD), and goal rows run from the locked
gap column to the locked column after the last week. Neither end of any range can be cut, so the 11/4 cut-and-paste
fix still holds (rechecked in desktop Excel: a cut goal keeps its hours, a cut name leaves the lookups whole). Every
value in the workbook is unchanged. Retested in Excel on the web: new person, new line, status OK, Still to assign
updates, real sync accepts it. The real file has this build as version 29.

Cutover done 11/6, 17:09 UTC: MM_SHARE_URLS now holds the new tracker plus the Morehead and Washtenaw matrices; the
old value is kept privately for rollback. A production sync read the new file, stored contract 1.4 with the same team
numbers, and "Open the tracker" now opens the new file.

11/12, Laura's feedback on the Team tab ("by assigned this week" looked like totals): the button only re-sorted, so
she read the all-weeks Assigned column as the week. The week button now switches the table to week columns only
(assigned, finished, hours planned, then last week), with a line saying where each number comes from. Finished is
only counted from a client matrix, and Eric says Coe will not have one for now, so a goal on a project with no matrix
shows "not counted" instead of 0 (`not_counted` and `not_counted_pages` on each week in the snapshot, additive).

Still to do:
1. Laura and Crystal's requests from the Basecamp post.
2. Coe's matrix link from Crystal, typed on the Projects tab.
3. Tighten the tracker's anonymous edit link once nothing reads it anonymously.
4. DONE differently (11/4, 3pm): Laura's blank stayed locked by a stuck guest session, so Eric chose to use his own
   copy. The real tracker is now `Migration Tracker.xlsx` in Eric's OneDrive folder "Migration Tracking Test", at the
   same share link as the old test copy (link kept in private notes, never here). The final build is on it; Excel
   re-saved it once, and the reader accepts that version. Laura's blank is unused and should be ignored or deleted.
   The link allows anonymous editing; tighten to Stamats people once the sync no longer needs anonymous reads.
5. Coe needs its matrix link from Crystal. Morehead is not on the Projects tab, so keep its link in `MM_SHARE_URLS`.
6. Cutover: Eric approves, point `MM_SHARE_URLS` at the new file, keep the old link as rollback.

Open decision for Eric: ship Laura's column change ahead of the tracker? It is due Friday 11/6.

Never commit: `packages/server/src/__e2e_harness.ts` is temporary, delete it (`packages/server/e2e/mm-harness.ts`
replaces it). Local processes that may still be running: vite on 5173, a stub on 3001, a harness on 3002, and the
Docker container `mm-e2e-pg`. They can all be stopped.
