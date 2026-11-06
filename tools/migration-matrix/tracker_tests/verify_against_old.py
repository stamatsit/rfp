#!/usr/bin/env python3
"""Read-only. Compare a built tracker's stored results with the old tracker it was built from,
working every expected number out here from typed inputs, never from the workbook's own formulas.

  verify_against_old.py NEW.xlsx OLD.xlsx
"""
import datetime as dt
import sys
from collections import defaultdict

from openpyxl import load_workbook

JOBS = ["As Is Page Building", "Optimize Page Building", "QA", "Publish", "Firefighting"]
SHORT = ["As Is", "Optimize", "QA", "Publish", "Firefighting"]

new_path, old_path = sys.argv[1:3]
new = load_workbook(new_path, data_only=True)
old = load_workbook(old_path, data_only=True)
fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail else ""))
    if not ok:
        fails.append(name)


def d(v):
    return v.date() if isinstance(v, dt.datetime) else v


def keys(ws):
    return {ws.cell(1, c).value: c for c in range(1, ws.max_column + 1) if ws.cell(1, c).value}


C = new["_contract"]
con = {C.cell(r, 1).value: C.cell(r, 2).value for r in range(1, C.max_row + 1)}

# errors anywhere, hidden sheets included
bad = []
for ws in new.worksheets:
    for row in ws.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("#"):
                bad.append(f"{ws.title}!{c.coordinate}={c.value}")
check("no formula errors in any sheet", not bad, str(bad[:6]))

A = new["Assignments"]
ak = keys(A)
goal_cols = {dt.date.fromisoformat(k[5:]): c for k, c in ak.items() if k.startswith("goal:")}
check("66 goal keys", len(goal_cols) == 66)
new_rows = {}
for r in range(int(con["assignment_first_row"]), int(con["assignment_last_row"]) + 1):
    p, pr, j = (A.cell(r, ak[k]).value for k in ("asg.person", "asg.project", "asg.job"))
    if p or pr or j:
        new_rows[(p, pr, j)] = r

OA = old["Assignments"]
weeks = {d(OA.cell(4, c).value): c for c in range(5, OA.max_column + 1) if isinstance(OA.cell(4, c).value, dt.datetime)}
goal_diff, hours_diff, left_diff, compared_h, compared_l = [], [], [], 0, 0
CS = new["Capacity"]
cap_weeks = {d(CS.cell(7, c).value): c for c in range(6, CS.max_column + 1) if isinstance(CS.cell(7, c).value, dt.datetime)}
CAP = {(CS.cell(r, 2).value, w): CS.cell(r, c).value for r in range(11, 51) if CS.cell(r, 2).value for w, c in cap_weeks.items()}
n_old = 0
for r in range(6, OA.max_row + 1):
    p, pr, j = (OA.cell(r, c).value for c in (1, 2, 3))
    if not (p or pr or j):
        continue
    n_old += 1
    nr = new_rows.get((p, pr, j))
    if nr is None:
        goal_diff.append(("missing row", p, pr, j))
        continue
    for wk, c in weeks.items():
        og = OA.cell(r, c).value
        og = og if isinstance(og, (int, float)) else None
        g = goal_cols[wk]
        ng = A.cell(nr, g).value
        if og != ng:
            goal_diff.append((p, pr, j, wk.isoformat(), og, ng))
        oh, nh = OA.cell(r, c + 1).value, A.cell(nr, g + 1).value
        if isinstance(oh, (int, float)):
            compared_h += 1
            if not isinstance(nh, (int, float)) or abs(oh - nh) > 0.01:
                hours_diff.append((p, pr, wk.isoformat(), oh, nh))
        ol, nl = OA.cell(r, c + 2).value, CAP.get((p, wk))
        if isinstance(ol, (int, float)):
            compared_l += 1
            if not isinstance(nl, (int, float)) or abs(ol - nl) > 0.11:
                left_diff.append((p, wk.isoformat(), round(ol, 2), nl))
check(f"all {n_old} assignment rows carried, every goal in every week identical", not goal_diff, str(goal_diff[:6]))
check(f"Hours match the old sheet ({compared_h} cells compared)", not hours_diff, str(hours_diff[:6]))
check(f"Hours Left on the Capacity tab match the old sheet ({compared_l} cells compared)", not left_diff, str(left_diff[:8]))

T = new["Team"]
tk = keys(T)
hours_cols = {dt.date.fromisoformat(k[6:]): c for k, c in tk.items() if k.startswith("hours:")}
OR = old["USE THIS for weekly schedule"]
ow = {d(OR.cell(4, c).value): c for c in range(3, OR.max_column + 1) if isinstance(OR.cell(4, c).value, dt.datetime)}
tdiff, names = [], {}
for r in range(int(con["team_first_row"]), int(con["team_last_row"]) + 1):
    n = T.cell(r, tk["team.name"]).value
    if n:
        names[n] = r
n_people = 0
for r in range(5, OR.max_row + 1):
    n = OR.cell(r, 1).value
    if not n:
        continue
    n_people += 1
    if n not in names:
        tdiff.append(("missing", n))
        continue
    for wk, c in ow.items():
        if wk < dt.date(2026, 9, 28):
            continue
        o = OR.cell(r, c).value
        o = o if isinstance(o, (int, float)) else None
        if o != T.cell(names[n], hours_cols[wk]).value:
            tdiff.append((n, wk.isoformat(), o, T.cell(names[n], hours_cols[wk]).value))
check(f"all {n_people} people carried, weekly hours identical from 9/28 on", not tdiff, str(tdiff[:6]))

# Still to assign, worked out here from the old tracker's page totals and the goals typed in the new one
OP = old["Projects"]
totals = {}
for r in range(5, OP.max_row + 1):
    n = OP.cell(r, 1).value
    if not n:
        continue
    num = lambda c: OP.cell(r, c).value if isinstance(OP.cell(r, c).value, (int, float)) else 0
    totals[n] = dict(zip(JOBS, (num(6), num(10), num(6) + num(10), num(18), num(22))))
assigned = defaultdict(float)
for (p, pr, j), r in new_rows.items():
    assigned[(pr, j)] += sum(A.cell(r, c).value or 0 for c in goal_cols.values())

P = new["Projects"]
pk = keys(P)
listed = {"Active": [], "Planned": []}
for r in range(int(con["project_first_row"]), int(con["project_last_row"]) + 1):
    n, status = P.cell(r, pk["project.name"]).value, P.cell(r, pk["project.status"]).value
    if n and status in listed:
        listed[status].append(n)


def describe(name):
    parts = []
    for job, short in zip(JOBS, SHORT):
        pages = totals.get(name, {}).get(job, 0)
        if pages > 0:
            left = pages - assigned[(name, job)]
            parts.append((short, left, pages))
    if not parts:
        return None
    if all(left == 0 for _, left, _ in parts):
        return "All assigned ✓"
    return " · ".join(f"{s} ✓" if left == 0 else f"{s} {-left:,.0f} over" if left < 0 else f"{s} {left:,.0f} of {pages:,.0f}"
                      for s, left, pages in parts)


expected = [(n, describe(n)) for n in listed["Active"] + listed["Planned"] if describe(n)]
start = next(r for r in range(1, 40) if A.cell(r, ak["asg.person"]).value == "STILL TO ASSIGN")
shown = []
for r in range(start + 1, start + 20):
    n = A.cell(r, ak["asg.person"]).value
    if not n:
        break
    shown.append((n, A.cell(r, ak["asg.job"]).value))
check(f"Still to assign matches an independent calculation ({len(expected)} projects)", shown == expected,
      f"shown={shown} expected={expected}")
for n, text in shown:
    print(f"       {n[:30]:30} {text}")

print("     hours needed, new sheet:")
for r in range(int(con["project_first_row"]), int(con["project_last_row"]) + 1):
    n = P.cell(r, pk["project.name"]).value
    if n:
        print(f"       {n[:30]:30} as_is={P.cell(r, pk['as_is.hours']).value} optimize={P.cell(r, pk['optimize.hours']).value}"
              f" qa={P.cell(r, pk['qa.hours']).value} publish={P.cell(r, pk['publish.hours']).value}")

print("     contract:", {k: con[k] for k in ("format", "version", "goals_total", "assignment_rows", "team_count",
                                             "project_count", "errors", "warnings")})
check("workbook's own goal total equals the sum of typed goals",
      con["goals_total"] == sum(A.cell(r, c).value or 0 for r in new_rows.values() for c in goal_cols.values()))
check("no Fix items on a clean load", con["errors"] == 0, f"errors={con['errors']}")

S = new["_checks"]
print("     checks:")
for r in range(2, S.max_row + 1):
    if S.cell(r, 4).value:
        print(f"       {S.cell(r, 4).value:9} {S.cell(r, 3).value!s:>4}  {S.cell(r, 2).value}")
print("\nRESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
