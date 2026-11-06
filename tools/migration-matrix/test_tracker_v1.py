#!/usr/bin/env python3
"""The dashboard must refuse a damaged tracker rather than show wrong numbers.

Usage: test_tracker_v1.py WORKBOOK.xlsx [EXCEL_SAVED.xlsx]

Takes a clean built workbook, damages copies in memory, and checks each one is
refused with a plain message. Loading with data_only keeps stored results as
plain values, so these copies behave like a file whose totals have gone stale.
"""
import sys

import openpyxl

import tracker_v1


def fresh(path):
    return openpyxl.load_workbook(path, data_only=True)


def norm(job):
    return "QA" if job == "QA" else "Migration"


def keys(ws):
    return {ws.cell(1, c).value: c for c in range(1, ws.max_column + 1) if ws.cell(1, c).value}


def set_contract(wb, name, value):
    ws = wb["_contract"]
    for r in range(1, ws.max_row + 1):
        if ws.cell(r, 1).value == name:
            ws.cell(r, 2).value = value
            return
    raise KeyError(name)


def first_goal_cell(wb):
    ws = wb["Assignments"]
    for k, c in keys(ws).items():
        if str(k).startswith("goal:"):
            for r in range(1, ws.max_row + 1):
                if isinstance(ws.cell(r, c).value, (int, float)) and not isinstance(ws.cell(r, c).value, bool) and r > 1:
                    return ws.cell(r, c)
    raise LookupError("no goal found")


def damage_goal(wb):
    first_goal_cell(wb).value += 5


def text_goal(wb):
    first_goal_cell(wb).value = "abc"


def rename_key(wb):
    wb["Assignments"].cell(1, keys(wb["Assignments"])["asg.person"]).value = "renamed"


def drop_week(wb):
    ws = wb["Assignments"]
    ws.cell(1, next(c for k, c in keys(ws).items() if str(k).startswith("goal:"))).value = None


def extra_person(wb):
    ws = wb["Team"]
    k = keys(ws)
    for r in range(8, ws.max_row + 1):
        if not ws.cell(r, k["team.name"]).value:
            ws.cell(r, k["team.name"]).value = "Pasted Person"
            return


def hours_stale(wb):
    con = tracker_v1.contract(wb)
    set_contract(wb, "hours_assigned_total", con["hours_assigned_total"] + 3)


def cleared_line(wb):
    """Rows can't be deleted on the locked tab, so a line is removed by clearing its person, project and job,
    which can leave goals behind (Laura did exactly this on 11/5). They count for nothing and must not block the file."""
    ws = wb["Assignments"]
    k = keys(ws)
    con = tracker_v1.contract(wb)
    goals = sorted(c for name, c in k.items() if str(name).startswith("goal:"))
    for r in range(int(con["assignment_first_row"]), int(con["assignment_last_row"]) + 1):
        if not any(ws.cell(r, k[x]).value for x in ("asg.person", "asg.project", "asg.job")):
            ws.cell(r, goals[6]).value = 0
            ws.cell(r, goals[7]).value = 30
            return
    raise LookupError("no open line")


ACCEPT = [("a cleared line with goals left in it", cleared_line)]

CASES = [
    ("a problem listed on Start Here", lambda wb: set_contract(wb, "errors", 2), "to fix"),
    ("unknown format version", lambda wb: set_contract(wb, "version", 2), "format version"),
    ("not a tracker at all", lambda wb: set_contract(wb, "format", "something-else"), "not a Migration Tracker"),
    ("a goal changed, total stale", damage_goal, "page goals do not add up"),
    ("text where a goal belongs", text_goal, "not a number"),
    ("a hidden key renamed", rename_key, "layout"),
    ("a week column lost", drop_week, "week columns"),
    ("a person added, total stale", extra_person, "team members do not add up"),
    ("hours total stale", hours_stale, "hours do not add up"),
    ("a stored result missing", lambda wb: set_contract(wb, "goals_total", None), "do not add up"),
    ("a stored row number missing", lambda wb: set_contract(wb, "team_first_row", None), "stored result"),
    ("the Assignments tab gone", lambda wb: wb.remove(wb["Assignments"]), "Assignments tab is missing"),
]


def main():
    clean, *others = sys.argv[1:]
    fails = 0
    for path in [clean] + others:
        got = tracker_v1.read(fresh(path), norm, set())
        print(f"PASS accepted: {path.rsplit('/', 1)[-1]} ({len(got['assigns'])} rows, {len(got['people'])} people, "
              f"{len(got['projects'])} projects, {len(got['initials'])} initials)")
    base = tracker_v1.read(fresh(clean), norm, set())
    for name, change in ACCEPT:
        wb = fresh(clean)
        change(wb)
        try:
            got = tracker_v1.read(wb, norm, set())
            same = (len(got["assigns"]), len(got["orphans"])) == (len(base["assigns"]), len(base["orphans"]))
            print(f"{'PASS' if same else 'FAIL'} accepted, {name}" + ("" if same else ": row count changed"))
            fails += 0 if same else 1
        except SystemExit as e:
            print(f"FAIL refused, {name}: {e}")
            fails += 1
    for name, damage, expect in CASES:
        wb = fresh(clean)
        damage(wb)
        try:
            tracker_v1.read(wb, norm, set())
            print(f"FAIL accepted a damaged file: {name}")
            fails += 1
        except SystemExit as e:
            msg = str(e)
            if expect in msg and "keeps its last good numbers" in msg:
                print(f"PASS refused, {name}: {msg}")
            else:
                print(f"FAIL wrong message, {name}: {msg}")
                fails += 1
    print("RESULT:", "ALL PASS" if not fails else f"{fails} FAILED")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
