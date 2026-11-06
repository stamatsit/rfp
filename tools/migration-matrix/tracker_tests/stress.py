#!/usr/bin/env python3
"""Try to break a COPY of a built tracker the way real use would, recalculate it, and check each problem is caught.

  stress.py BUILT.xlsx

Never touches the file it is given. Needs LibreOffice (soffice) on the path.
"""
import datetime as dt
import os
import sys
import tempfile

from openpyxl import load_workbook

from tracker_release import calculate

src = sys.argv[1]
work = tempfile.mkdtemp()
wb = load_workbook(src)
A, T, P = wb["Assignments"], wb["Team"], wb["Projects"]


def keymap(ws):
    return {ws.cell(1, c).value: c for c in range(1, ws.max_column + 1) if ws.cell(1, c).value}


def contract(book):
    ws = book["_contract"]
    return {ws.cell(r, 1).value: ws.cell(r, 2).value for r in range(1, ws.max_row + 1)}


AK, TK, PK = keymap(A), keymap(T), keymap(P)
before = load_workbook(src, data_only=True)
FIRST = int(contract(before)["assignment_first_row"])
STATUS = AK["asg.job"] + 1  # the Check column sits right after Job
wk, wk2, wk3 = "2026-11-09", "2026-11-16", "2026-11-23"
G, G2 = AK[f"goal:{wk}"], AK[f"goal:{wk2}"]
WCC, COE = "Washtenaw Community College", "Coe"
ASIS, OPT = "As Is Page Building", "Optimize Page Building"


def line(n):
    """Assignment line n, counting from 1."""
    return FIRST + n - 1


def team_row(r, **kv):
    for k, v in kv.items():
        T.cell(r, TK[k]).value = v


def asg(n, person, project, job, goal=None, col=None):
    r = line(n)
    A.cell(r, AK["asg.person"]).value = person
    A.cell(r, AK["asg.project"]).value = project
    A.cell(r, AK["asg.job"]).value = job
    if goal is not None:
        A.cell(r, col or G).value = goal


# Add a team member, with usual hours, and use them
team_row(19, **{"team.name": "New Person", "team.initials": "NP", "team.role": "Senior migrator", "team.status": "Active", "team.usual_hours": 30})
asg(17, "New Person", COE, "Publish", 1)                    # Coe has no publish rate, so "No rate"
asg(18, "New Person", WCC, ASIS, 10)                        # fine, 10 pages at 2 per hour is 5 hours
asg(19, "Nobody Real", WCC, ASIS, 5)                        # person not on Team
asg(20, "Brian", "Not A Project", ASIS, 5)                  # project not listed
asg(21, "Brian", WCC, "Not A Job", 5)                       # job not listed
asg(22, "Brian", WCC, ASIS)                                 # same person, project, job as line 1
asg(23, "New Person", WCC, OPT, "abc")                      # text pasted over a goal
asg(24, "New Person", WCC, "QA", " ")                       # stray space
asg(25, "New Person", WCC, "Publish", -5)                   # negative goal (also no rate)
asg(26, None, WCC, OPT, 3)                                  # incomplete line, no person
asg(27, "Debbie", COE, OPT, 500, G2)                        # pushes Coe Optimize over
asg(29, None, None, None, 25)                               # a cleared line with a goal left behind
# Remove a real line the way the sheet says to: clear its person, project and job, leave its goals
KELLY = line(4)
assert before["Assignments"].cell(KELLY, AK["asg.person"]).value == "Kelly OF", "line 4 moved; update this test"
kelly_pages = sum(before["Assignments"].cell(KELLY, c).value for k, c in AK.items()
                  if k.startswith("goal:") and isinstance(before["Assignments"].cell(KELLY, c).value, (int, float)))
LK = keymap(before["_lists"])  # _lists row 1 holds its column names
wcc_as_is_before = next(before["_lists"].cell(r - 8 + 2, LK["left:as_is"]).value
                        for r in range(8, 38) if before["Projects"].cell(r, PK["project.name"]).value == WCC)
for k in ("asg.person", "asg.project", "asg.job"):
    A.cell(KELLY, AK[k]).value = None
team_row(20, **{"team.name": "Dupe Initials", "team.initials": "BM", "team.status": "Active"})     # same initials as Brian
team_row(21, **{"team.name": "Gone Person", "team.initials": "GP", "team.status": "Inactive"})     # must leave the dropdown
team_row(22, **{"team.name": "Brian", "team.initials": "ZZ", "team.status": "Active"})             # duplicate name
T.cell(19, TK[f"hours:{wk2}"]).value = "TBD"                # text in the hours grid
P.cell(14, PK["project.name"]).value = "Brand New Client"   # new project, usable right away
P.cell(14, PK["project.status"]).value = "Active"
P.cell(14, PK["as_is.pages"]).value = 100
asg(28, "New Person", "Brand New Client", ASIS, 40)         # pages but no minutes, "No rate"; 60 left
P.cell(15, PK["project.name"]).value = "Done Client"        # completed project leaves the dropdown and the box
P.cell(15, PK["project.status"]).value = "Completed"
P.cell(15, PK["as_is.pages"]).value = 10
P.cell(16, PK["project.name"]).value = COE                  # duplicate project name
P.cell(16, PK["project.status"]).value = "Planned"
P.cell(17, PK["project.name"]).value = "Seventh Client"     # a seventh project with pages: the box overflows
P.cell(17, PK["project.status"]).value = "Planned"
P.cell(17, PK["as_is.pages"]).value = 10
A.cell(line(18), AK[f"goal:{wk3}"]).value = 100             # 50 hours against 30 usual: truly overbooked
out = os.path.join(work, "stress.xlsx")
wb.save(out)

v = load_workbook(calculate(out, work), data_only=True)
A2, S, L, Cap = v["Assignments"], v["_checks"], v["_lists"], v["Capacity"]
fails = []


def check(name, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + f"{name}: {got!r}" + ("" if ok else f" (wanted {want!r})"))
    if not ok:
        fails.append(name)


stat = lambda n: A2.cell(line(n), STATUS).value
check("clean line stays OK", stat(2), "OK")
check("new person on a job with no pace", stat(17), "No rate")
check("new person, valid line", stat(18), "OK")
check("new person: hours work out", A2.cell(line(18), G + 1).value, 5)
check("person not on Team", stat(19), "Person?")
check("project not listed", stat(20), "Project?")
check("job not listed", stat(21), "Job?")
check("duplicate line flagged", stat(22), "Duplicate")
check("original of the duplicate flagged too", stat(1), "Duplicate")
check("text pasted over a goal", stat(23), "Bad goal")
check("stray space in a goal", stat(24), "Bad goal")
check("negative goal", stat(25), "Bad goal")
check("line with no person", stat(26), "Incomplete")
check("brand new project: no pace yet", stat(28), "No rate")
check("cleared line raises nothing", stat(29), None)
check("removed line raises nothing", stat(4), None)

# Still to assign
lk = keymap(L)
proj_row = {}
for r in range(8, 38):
    n = v["Projects"].cell(r, PK["project.name"]).value
    if n and n not in proj_row:
        proj_row[n] = r - 8 + 2  # _lists row for that Projects row
check("brand new project: 100 pages, 40 assigned", L.cell(proj_row["Brand New Client"], lk["left:as_is"]).value, 60)
check("over-assigned job goes negative", L.cell(proj_row[COE], lk["left:optimize"]).value, 82 - 82 - 500)
check("completed project has nothing to assign", L.cell(proj_row["Done Client"], lk["left:as_is"]).value, None)
start = next(r for r in range(1, 40) if A2.cell(r, AK["asg.person"]).value == "STILL TO ASSIGN")
box = [(A2.cell(r, AK["asg.person"]).value, A2.cell(r, AK["asg.job"]).value) for r in range(start + 1, start + 7)]
for n, text in box:
    print(f"       {n!s:34} {text}")
names = [n for n, _ in box]
check("box lists Active projects first, in tab order", names[:4], [WCC, 'HM Publishing "On Health"', COE, "Brand New Client"])
check("over-assigned job reads as over", "Optimize 500 over" in (dict(box).get(COE) or ""), True)
check("new project's line (QA pages are As Is plus Optimize)", dict(box).get("Brand New Client"),
      "As Is 60 of 100 · QA 100 of 100")
# Washtenaw As Is: the removed line's pages come back; 10 + 100 for New Person and 5 for Nobody Real go out.
# Optimize goes 3 over from the line with no person. QA's stray space counts for nothing.
wcc_as_is = wcc_as_is_before + kelly_pages - 115
as_is_text = f"As Is {-wcc_as_is:,.0f} over" if wcc_as_is < 0 else f"As Is {wcc_as_is:,.0f} of 761"
check(f"Washtenaw line (removed line gives back {kelly_pages:g} pages)", dict(box).get(WCC),
      f"{as_is_text} · Optimize 3 over · QA 147 of 802")
check("the seventh project overflows into a count", box[5], ("+2 more projects not shown", None))

team_list = [L.cell(r, 1).value for r in range(2, 42) if L.cell(r, 1).value]
proj_list = [L.cell(r, 3).value for r in range(2, 32) if L.cell(r, 3).value]
check("new person is in the dropdown", "New Person" in team_list, True)
check("inactive person left the dropdown", "Gone Person" in team_list, False)
check("new project is in the dropdown", "Brand New Client" in proj_list, True)
check("completed project left the dropdown", "Done Client" in proj_list, False)
cap_names = {Cap.cell(r, 2).value: r for r in range(11, 51) if Cap.cell(r, 2).value}
check("new person appears on Capacity", "New Person" in cap_names, True)
capk = {Cap.cell(7, c).value.date(): c for c in range(6, Cap.max_column + 1) if isinstance(Cap.cell(7, c).value, dt.datetime)}
check("usual hours fill the weeks: 30 minus 5", Cap.cell(cap_names["New Person"], capk[dt.date(2026, 11, 9)]).value, 25)
check("goals with no hours entered show as ?", Cap.cell(cap_names["Debbie"], capk[dt.date(2026, 11, 16)]).value, "?")
check("overbooking shows as negative", Cap.cell(cap_names["New Person"], capk[dt.date(2026, 11, 23)]).value, -20)
check("Left beside the goal agrees", A2.cell(line(18), AK[f"goal:{wk3}"] + 2).value, -20)
results = {S.cell(r, 2).value: (S.cell(r, 4).value, S.cell(r, 3).value) for r in range(2, S.max_row + 1) if S.cell(r, 4).value}
for k, want in (("A name is on the Team tab twice", "Fix"), ("Two people have the same initials", "Fix"),
                ("A project is on the Projects tab twice", "Fix"), ("Assignment rows with a problem", "Fix"),
                ("People over their hours", "Heads up"), ("Hours that are not numbers", "Heads up"),
                ("Assignment rows with no pace set", "Heads up"), ("More pages assigned than a project has", "Heads up")):
    check(f"check fires: {k}", results.get(k, ("missing",))[0], want)
con = contract(v)
check("contract reports errors so the dashboard would refuse", con["errors"], 4)
typed = 0
for r in range(int(con["assignment_first_row"]), int(con["assignment_last_row"]) + 1):
    if any(A2.cell(r, AK[k]).value for k in ("asg.person", "asg.project", "asg.job")):
        typed += sum(A2.cell(r, c).value for k, c in AK.items()
                     if k.startswith("goal:") and isinstance(A2.cell(r, c).value, (int, float)))
check("goal total skips the cleared line", con["goals_total"], typed)
print("\nall checks:")
for k, (a, b) in results.items():
    print(f"  {a:9} {b!s:>4}  {k}")

# Second copy: layout damage on its own. A hidden key changed, otherwise clean.
wb = load_workbook(src)
wb["Assignments"].cell(1, keymap(wb["Assignments"])[f"goal:{wk}"]).value = "renamed-key"
out2 = os.path.join(work, "stress2.xlsx")
wb.save(out2)
v = load_workbook(calculate(out2, work), data_only=True)
S2 = v["_checks"]
res2 = {S2.cell(r, 2).value: S2.cell(r, 4).value for r in range(2, S2.max_row + 1) if S2.cell(r, 4).value}
check("damaged layout is caught", res2.get("The layout was changed"), "Fix")
check("damaged layout: contract reports an error", contract(v)["errors"], 1)
print("\nRESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
