#!/usr/bin/env python3
"""Client matrix columns are found by name, so layout changes cannot shift the numbers.

Run: test_client_matrix.py  (builds its own small workbook, no client data)
"""
import os
import sys
import tempfile

import openpyxl

import client_matrix as cm

COLUMNS = [
    ("", "Old/Legacy URL (Do Not Delete any URLS from this column)"), ("", "Assigned To"), ("SITE TREE", "Page ID"),
    ("SITE TREE", "Navigation Title"), ("SITE TREE", "New URL"), ("STATUS", "Revise"), ("STATUS", "As Is"),
    ("WRITING", "Assigned Writer"), ("WRITING", "Draft Delivered"), ("WRITING", "Assigned Reviewer"),
    ("WRITING", "Round 1 Updates Complete (Date)"), ("MIGRATION", "Assigned to"),
    ("MIGRATION", "Ready for Content Build (Date)"), ("MIGRATION", "Migrator (Initials)(Round 1)"),
    ("MIGRATION", "Completion (Date)"), ("QA", "QA (Initials)"), ("QA", "Complete (Date)"),
    ("MIGRATION", "Migrator (Initials) (Round 2)"), ("MIGRATION", "Migration Completion (Date) (Round 2)"),
    ("QA", "QA Initials (Round 2)"), ("QA", "Complete (Date) (Round 2)"), ("MIGRATION", "Migrator Initials (Round 3)"),
    ("MIGRATION", "Completion (Date) (Round 3)"), ("QA", "QA Initials (Round 3)"), ("QA", "Complete (Date) (Round 3)"),
    ("READY FOR REVIEW", "Deliver to Client (Date)"), ("MIGRATION REVIEW", "Final Review Complete (Date)"),
]
PAGES = [
    {"Navigation Title": "Built and passed", "New URL": "/a", "Assigned To": "Stamats", "Migrator (Initials)(Round 1)": "BM",
     "Completion (Date)": "2026-10-05", "QA (Initials)": "KE", "Complete (Date)": "2026-10-06",
     "Deliver to Client (Date)": "2026-10-07", "Final Review Complete (Date)": "2026-10-20"},
    {"Navigation Title": "Waiting on QA", "New URL": "/b", "Assigned To": "Stamats", "Migrator (Initials)(Round 1)": "DS",
     "Completion (Date)": "2026-10-12"},
    {"Navigation Title": "Being built", "New URL": "/c", "Assigned To": "Stamats", "Migrator (Initials)(Round 1)": "KO"},
    {"Navigation Title": "The client's page", "New URL": "/d", "Assigned To": "Client"},
]
EXPECTED = [("Built and passed", "delivered", "BM", "2026-10-05", "2026-10-06", True),
            ("Waiting on QA", "in QA", "DS", "2026-10-12", None, False),
            ("Being built", "building", "KO", None, None, False)]


def build(path, columns=None, rename=None, tab="1-Stamats", pad=70, pages=None):
    columns = list(columns or COLUMNS)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = tab
    for i, (group, label) in enumerate(columns, 1):
        ws.cell(2, i).value = group
        ws.cell(3, i).value = (rename or {}).get(label, label)
    ws.cell(3, pad).value = "padding"     # section tabs are wide
    for i, _ in enumerate(columns, 1):
        ws.cell(4, i).value = 5           # the counts row under the headers
    for r, page in enumerate(pages or PAGES, 5):
        for i, (_, label) in enumerate(columns, 1):
            if label in page:
                ws.cell(r, i).value = page[label]
    wb.save(path)


def summary(path):
    m = cm.parse_matrix(path)
    return [(p["title"], p["stage"], p["migrator"], p["migrated_date"], p["qa_date"], p["client_final"]) for p in m["pages"]], m


FAILS = []


def check(name, got, want):
    ok = got == want
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f": got {got!r}, wanted {want!r}"))
    if not ok:
        FAILS.append(name)


def refused(name, path, expect):
    try:
        cm.parse_matrix(path)
        check(name, "accepted", "refused")
    except SystemExit as e:
        msg = str(e)
        check(name, expect in msg and "keeps its last good numbers" in msg, True)
        print(f"     says: {msg}")


def main():
    d = tempfile.mkdtemp()
    p = os.path.join(d, "content-matrix-test.xlsx")

    build(p)
    got, m = summary(p)
    check("reads the normal layout", got, EXPECTED)
    check("leaves the client's page out", m["client_owned"], 1)

    build(p, columns=list(reversed(COLUMNS)))
    check("columns in reverse order, same result", summary(p)[0], EXPECTED)

    build(p, columns=COLUMNS[:12] + [("WRITING", "A brand new column")] + COLUMNS[12:])
    check("a column inserted in the middle, same result", summary(p)[0], EXPECTED)

    build(p, columns=[c for c in COLUMNS if c[1] != "Page ID"])
    got, m = summary(p)
    check("an optional column removed, same result", got, EXPECTED)
    check("the missing optional column is reported", any("Page ID" in x for x in m["missing_optional"]), True)

    build(p, rename={"Completion (Date)": "  completion  (date) ", "Deliver to Client (Date)": "DELIVER TO CLIENT (DATE)"})
    check("small wording changes are fine", summary(p)[0], EXPECTED)

    # Dates typed or pasted as text (seen in the Coe matrix, 11/12) are real dates, not blanks:
    # dropping them undercounted finished pages, and text in Deliver to Client crashed the run.
    import datetime
    text_dates = [dict(PAGES[0], **{"Completion (Date)": "11/9/26\n", "Complete (Date)": " 11/10/2026",
                                    "Deliver to Client (Date)": "11/12/26", "Draft Delivered": "10/1/26"}),
                  dict(PAGES[1], **{"Completion (Date)": datetime.datetime(2026, 10, 12)}),
                  dict(PAGES[2], **{"Deliver to Client (Date)": "11/112/2026"})]
    build(p, pages=text_dates)
    m = cm.parse_matrix(p)
    got = [(x["title"], x["migrated_date"], x["qa_date"], x["delivered_date"], x["draft_date"]) for x in m["pages"]]
    check("dates typed as text are read as dates; a real date is unchanged; a typo is left out", got, [
        ("Built and passed", "2026-11-09", "2026-11-10", "2026-11-12", "2026-10-01"),
        ("Waiting on QA", "2026-10-12", None, None, None),
        ("Being built", None, None, None, None)])

    build(p, columns=COLUMNS[:1] + [("", "Extra")] + COLUMNS[1:])
    check("the MIGRATION Assigned to is not mistaken for Assigned To", cm.find_columns(openpyxl.load_workbook(p).active)[1]["assigned_to"], 3)

    build(p, rename={"Completion (Date)": "Finished"})
    refused("a required column renamed", p, "'Completion (Date)'")

    build(p, columns=[c for c in COLUMNS if c[1] != "Deliver to Client (Date)"])
    refused("a required column deleted", p, "'Deliver to Client (Date)'")

    build(p, columns=COLUMNS + [("QA", "QA (Initials)")])
    refused("a required column doubled", p, "two columns")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "1-Stamats"
    ws.cell(1, 70).value = "wide, with no headers"
    wb.save(p)
    refused("a wide tab with no headers", p, "headers can't be found")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "1-Stamats"
    ws.cell(1, 1).value = "Just some notes"
    wb.save(p)
    m = cm.parse_matrix(p)
    check("a small numbered tab of notes is skipped, not an error", m["skipped"], ["1-Stamats"])

    print("RESULT:", "ALL PASS" if not FAILS else f"{len(FAILS)} FAILED: {FAILS}")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
