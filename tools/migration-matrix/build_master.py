#!/usr/bin/env python3
"""Content Migration Master Report — proof of concept.

Reads the migrator assignment tracker snapshot (values-extracted .xlsx),
normalizes it into SQLite, runs data-quality validation, and generates:
  - master.db                     normalized database
  - master-report.xlsx            regenerated master report (4 sheets)
  - morning-report-<date>.md      sample Phase-2 morning report

The tracker is treated as read-only reference input. Nothing is written
back to the source files.
"""

import datetime
import json
import os
import re
import sqlite3
import sys

import openpyxl
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = os.path.dirname(os.path.abspath(__file__))


def _resolve_src():
    """MM_SOURCE env var wins; else the canonical snapshot; else the newest
    tracker .xlsx in the parent folder — so a re-named export just works.
    Client content matrices are a separate input and never picked here."""
    override = os.environ.get("MM_SOURCE")
    if override:
        return os.path.abspath(override)
    parent = os.path.abspath(os.path.join(HERE, ".."))
    exact = os.path.join(
        parent, "migrator-assignment-tracker-2026-08-17-values-extracted.xlsx")
    if os.path.exists(exact):
        return exact
    import glob
    candidates = [
        p for p in glob.glob(os.path.join(parent, "*.xlsx"))
        if "REPAIRED" not in p and not os.path.basename(p).startswith("~$")
        and "master-report" not in p
        and "content-matrix" not in os.path.basename(p).lower()
    ]
    if not candidates:
        return exact  # let callers report the missing canonical path
    return max(candidates, key=os.path.getmtime)


SRC = _resolve_src()
DB_PATH = os.path.join(HERE, "master.db")
REPORT_PATH = os.path.join(HERE, "master-report.xlsx")
TODAY = datetime.date.today()

FALLBACK_WEEKS = [
    "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20",
    "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24",
    "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28",
]
# Structural problems found while reading headers (duplicate week columns,
# legacy sheets, unknown roles). validate() folds them into the findings.
STRUCTURE_FINDINGS = []


def _header_weeks(ws, row, first_col, step, stop_words=("notes",)):
    """Week columns from a header row: [(col, iso_week)]. A repeated header
    date keeps its label (the two columns are summed) and is flagged; the
    live tracker has '9/7/2026' twice on the roster."""
    out, seen = [], set()
    c = first_col
    while c <= ws.max_column:
        v = ws.cell(row, c).value
        txt = (to_text(v) or "").lower()
        if txt and any(txt.startswith(w) for w in stop_words):
            break
        wk = to_date(v)
        if wk:
            if wk in seen:
                STRUCTURE_FINDINGS.append((
                    "HIGH", "duplicate-week-header",
                    f"Sheet '{ws.title}' header row {row} lists the week of "
                    f"{wk} twice (column {c}); hours in both columns were "
                    f"combined. Fix the header so each week appears once."))
            seen.add(wk)
            out.append((c, wk))
        c += step
    return out


def _derive_weeks(path):
    """Union of the roster's week columns; the constant is the fallback."""
    try:
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb["USE THIS for weekly schedule"]
        # read_only sheets need a materialised row for cell access
        hdr = next(ws.iter_rows(min_row=4, max_row=4, values_only=True))
        weeks = []
        for v in hdr[2:]:
            t = (to_text(v) or "").lower()
            if t.startswith("notes"):
                break
            wk = to_date(v)
            if wk and wk not in weeks:
                weeks.append(wk)
        wb.close()
        if len(weeks) >= 4:
            return sorted(weeks)
    except Exception:
        pass
    return list(FALLBACK_WEEKS)


WEEKS = None  # set below, after to_text/to_date are defined


def current_week(today=None):
    """Monday of the given date's week — but if that week has no staffed
    hours in the data (a snapshot goes stale while the calendar moves on),
    snap back to the latest week that does. Uses the existing master.db
    from the prior run; falls back to a safe clamp on first ever run."""
    today = today or TODAY
    monday = (today - datetime.timedelta(days=today.weekday())).isoformat()
    if monday not in WEEKS:
        monday = None
    try:
        db = sqlite3.connect(DB_PATH)
        staffed = sorted(w for (w,) in db.execute(
            "SELECT DISTINCT week FROM capacity WHERE hours > 0"))
        db.close()
        if staffed:
            if monday in staffed:
                return monday
            past = [w for w in staffed if monday is None or w <= monday]
            return past[-1] if past else staffed[0]
    except Exception:
        pass
    return monday or "2026-08-17"


def to_num(v):
    """Tracker values arrive as text ('1,929', '10.', ' ', '-') — or as real
    numbers if the file has been re-saved by Excel. Accept both."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "")
    if s in ("", "-", "."):
        return None
    s = s.rstrip(".")
    try:
        return float(s)
    except ValueError:
        return None


def to_text(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    s = "" if v is None else str(v).strip()
    return s or None


def to_date(v):
    if isinstance(v, datetime.datetime):  # Excel may coerce text to dates
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    s = to_text(v)
    if not s or s.upper() == "TBD":
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"):
        try:
            return datetime.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


WEEKS = _derive_weeks(SRC)
CUR_WEEK = current_week()
NEXT_WEEK = (datetime.date.fromisoformat(CUR_WEEK)
             + datetime.timedelta(days=7)).isoformat()


# ---------------------------------------------------------------- ingest

def parse_roster(wb):
    ws = wb["USE THIS for weekly schedule"]
    people, capacity = [], []
    week_cols = _header_weeks(ws, 4, 3, 1)  # once: dup headers flagged once
    hdr = {c: (to_text(ws.cell(4, c).value) or "").lower()
           for c in range(1, ws.max_column + 1)}
    notes_c = next((c for c, h in hdr.items() if h.startswith("notes")), 18)
    pto_c = next((c for c, h in hdr.items() if "time off" in h), notes_c + 1)
    for r in range(5, ws.max_row + 1):
        name = to_text(ws.cell(r, 1).value)
        if not name:
            continue
        people.append({
            "name": name,
            "role": to_text(ws.cell(r, 2).value),
            "notes": to_text(ws.cell(r, notes_c).value),
            "planned_time_off": to_text(ws.cell(r, pto_c).value),
        })
        acc = {}
        for col, week in week_cols:
            hrs = to_num(ws.cell(r, col).value)
            if hrs is not None:
                acc[week] = acc.get(week, 0) + hrs
        for week, hrs in acc.items():
            capacity.append({"person": name, "week": week, "hours": hrs})
    return people, capacity


PROJECT_FIELDS = [
    # field, matcher over the normalised header text (first match wins)
    ("page_type", lambda h: "page type" in h),
    ("complexity", lambda h: "complexity" in h),
    ("total_pages", lambda h: h == "total pages" or (h.startswith("total") and "pages" in h and "hours" not in h and "qa" not in h)),
    ("mig_min_per_page", lambda h: "minutes per page" in h and "qa" not in h),
    ("mig_rate", lambda h: "pages/hour" in h and "qa" not in h),
    ("mig_hours_needed", lambda h: "hours needed" in h and "qa" not in h),
    ("mig_pages_assigned_shown", lambda h: "assigned" in h and "qa" not in h),
    ("mig_pages_remaining_shown", lambda h: "remaining" in h and "qa" not in h),
    ("qa_min_per_page", lambda h: "qa minutes" in h),
    ("qa_rate", lambda h: "qa/hour" in h),
    ("qa_hours_needed", lambda h: "qa hours" in h),
    ("qa_pages_assigned_shown", lambda h: "qa pages assigned" in h),
    ("qa_pages_remaining_shown", lambda h: "qa pages remaining" in h),
    ("start_date", lambda h: "start date" in h),
    ("mig_deadline", lambda h: "migration deadline" in h or "build deadline" in h),
    ("client_deadline", lambda h: "client" in h and "deadline" in h),
    ("priority", lambda h: h == "priority" or h.startswith("priority")),
    ("status", lambda h: h == "status" or h.startswith("status")),
    ("notes", lambda h: h == "notes" or h.startswith("notes")),
]
# the seeded tracker's fixed layout, used when a sheet has no readable header
PROJECT_FIXED = {"page_type": 2, "complexity": 3, "total_pages": 4,
                 "mig_min_per_page": 5, "mig_rate": 6, "mig_hours_needed": 7,
                 "mig_pages_assigned_shown": 8, "mig_pages_remaining_shown": 9,
                 "qa_min_per_page": 10, "qa_rate": 11, "qa_hours_needed": 12,
                 "qa_pages_assigned_shown": 13, "qa_pages_remaining_shown": 14,
                 "start_date": 15, "mig_deadline": 16, "client_deadline": 17,
                 "priority": 18, "status": 19, "notes": 20}
DATE_FIELDS = {"start_date", "mig_deadline", "client_deadline"}
TEXT_FIELDS = {"page_type", "complexity", "priority", "status", "notes"}


def _project_columns(ws):
    """Map project fields to columns by header text (row 4); the live
    tracker reorders columns and renames 'Migration' to 'Page Build'."""
    headers = {c: re.sub(r"\s+", " ", to_text(ws.cell(4, c).value)).strip().lower()
               for c in range(1, ws.max_column + 1)}
    if not any("project" in h for h in headers.values()):
        return dict(PROJECT_FIXED)
    cols = {}
    for field, match in PROJECT_FIELDS:
        for c, h in headers.items():
            if h and c not in cols.values() and match(h):
                cols[field] = c
                break
    for field, c in PROJECT_FIXED.items():   # anything unmatched: old slot
        cols.setdefault(field, c)
    return cols


def _parse_project_sheet(ws, listname):
    cols = _project_columns(ws)
    rows = []
    for r in range(5, ws.max_row + 1):
        name = to_text(ws.cell(r, 1).value)
        if not name or name.startswith("Deadline Color Key") \
                or name.startswith("Formulas") or name.startswith("["):
            continue
        row = {"row": r, "name": name, "list": listname}
        for field, c in cols.items():
            v = ws.cell(r, c).value
            row[field] = (to_date(v) if field in DATE_FIELDS
                          else to_text(v) if field in TEXT_FIELDS
                          else to_num(v))
        # Files saved by Excel Online can carry formulas WITHOUT cached
        # results, so the sheet's own rate/hours formulas read as blank.
        # Re-derive them from the hand-entered minutes-per-page exactly as
        # the sheet does (=60/minutes, =total/rate).
        if not row.get("mig_rate") and row.get("mig_min_per_page"):
            row["mig_rate"] = 60.0 / row["mig_min_per_page"]
        if not row.get("qa_rate") and row.get("qa_min_per_page"):
            row["qa_rate"] = 60.0 / row["qa_min_per_page"]
        if row.get("mig_hours_needed") is None and row.get("total_pages") and row.get("mig_rate"):
            row["mig_hours_needed"] = row["total_pages"] / row["mig_rate"]
        if row.get("qa_hours_needed") is None and row.get("total_pages") and row.get("qa_rate"):
            row["qa_hours_needed"] = row["total_pages"] / row["qa_rate"]
        rows.append(row)
    return rows


def parse_projects(wb):
    """Live layout: Active Projects (wins) + Planned Projects + Completed
    Projects; the legacy 'Projects' sheet is ignored when Active exists.
    Seeded layout: just 'Projects'. Names are deduped by precedence."""
    names = {n.strip(): n for n in wb.sheetnames}
    rows, seen = [], set()
    if "Active Projects" in names:
        order = [("Active Projects", "active"), ("Planned Projects", "planned"),
                 ("Completed Projects", "completed")]
        if "Projects" in names:
            STRUCTURE_FINDINGS.append((
                "LOW", "legacy-projects-sheet",
                "The workbook still carries the old 'Projects' sheet next to "
                "'Active Projects'; it was ignored. Delete it to avoid stale "
                "numbers (its On Health Articles row says 2,000 pages)."))
    else:
        order = [("Projects", "active")]
    for sheet, listname in order:
        if sheet not in names:
            continue
        for row in _parse_project_sheet(wb[names[sheet]], listname):
            key = row["name"].lower()
            if key in seen:
                continue
            seen.add(key)
            rows.append(row)
    return rows


def normalize_role(raw):
    """The live tracker renamed 'Migration' to 'Page Building' and added
    'Publish'. Rollups key on Migration/QA; other roles count hours only."""
    t = (raw or "").strip().lower()
    if not t:
        return None
    if "page build" in t or t == "migration" or t.startswith("migrat"):
        return "Migration"
    if t == "qa" or t.startswith("q/a") or t.startswith("qa "):
        return "QA"
    return (raw or "").strip()


def parse_assignments(wb, sheet, source, rates=None):
    ws = wb[sheet]
    assigns, orphans = [], []
    weeks = _header_weeks(ws, 4, 6, 3)
    if not weeks:  # header unreadable: fall back to the fixed 3-col grid
        weeks = [(6 + 3 * w, wk) for w, wk in enumerate(WEEKS)]
    seen_roles = set()
    for r in range(6, ws.max_row + 1):
        person = to_text(ws.cell(r, 1).value)
        project = to_text(ws.cell(r, 2).value)
        role_raw = to_text(ws.cell(r, 3).value)
        role = normalize_role(role_raw)
        if role_raw:
            seen_roles.add(role_raw)
        rate = to_num(ws.cell(r, 4).value)
        if rate is None and rates and project and role in ("Migration", "QA"):
            rate = rates.get((project.lower(), role))
        week_cells = []
        for col, week in weeks:
            pages = to_num(ws.cell(r, col).value)
            hours = to_num(ws.cell(r, col + 1).value)
            done = to_num(ws.cell(r, col + 2).value)
            if pages is None and hours is None and done is None:
                continue
            eff = hours
            if eff is None and pages is not None and rate:
                eff = pages / rate
            week_cells.append({
                "week": week, "pages_assigned": pages, "hours": hours,
                "hours_effective": eff, "pages_completed": done,
            })
        if not (person or project or week_cells):
            continue
        row = {
            "source": source, "src_row": r, "person": person,
            "project": project, "role": role, "role_raw": role_raw,
            "rate": rate, "weeks": week_cells,
        }
        if person and project:
            assigns.append(row)
        else:
            orphans.append(row)
    extra = sorted(x for x in seen_roles
                   if normalize_role(x) not in ("Migration", "QA"))
    if extra:
        STRUCTURE_FINDINGS.append((
            "LOW", "roles-outside-rollup",
            f"Sheet '{sheet}' uses role(s) {', '.join(extra)}: their hours "
            f"count toward capacity, their pages do not count as migration "
            f"or QA progress."))
    return assigns, orphans


def parse_reported_capacity(wb):
    """The tracker's own Weekly Capacity numbers, kept for comparison."""
    ws = wb["Weekly Capacity"]
    rows = []
    weeks = _header_weeks(ws, 4, 2, 2, stop_words=("legend", "total")) \
        or [(2 + 2 * w, wk) for w, wk in enumerate(WEEKS)]
    for r in range(6, ws.max_row + 1):
        name = to_text(ws.cell(r, 1).value)
        if not name:
            continue
        if name.lower().startswith(("total", "legend")):
            break
        for col, week in weeks:
            rows.append({
                "person": name, "week": week,
                "available": to_num(ws.cell(r, col).value),
                "assigned": to_num(ws.cell(r, col + 1).value),
            })
    return rows


# ---------------------------------------------------------------- database

def build_db(people, capacity, projects, assigns, orphans, reported):
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    db = sqlite3.connect(DB_PATH)
    db.executescript("""
        CREATE TABLE people (name TEXT PRIMARY KEY, role TEXT, notes TEXT,
                             planned_time_off TEXT);
        CREATE TABLE capacity (person TEXT, week TEXT, hours REAL,
                               PRIMARY KEY (person, week));
        CREATE TABLE projects (name TEXT, row INTEGER, page_type TEXT,
            complexity TEXT, total_pages REAL, mig_min_per_page REAL,
            mig_rate REAL, mig_hours_needed REAL,
            mig_pages_assigned_shown REAL, mig_pages_remaining_shown REAL,
            qa_min_per_page REAL, qa_rate REAL, qa_hours_needed REAL,
            qa_pages_assigned_shown REAL, qa_pages_remaining_shown REAL,
            start_date TEXT, mig_deadline TEXT, client_deadline TEXT,
            priority TEXT, status TEXT, notes TEXT, list TEXT);
        CREATE TABLE assignments (id INTEGER PRIMARY KEY, source TEXT,
            src_row INTEGER, person TEXT, project TEXT, role TEXT,
            role_raw TEXT, rate REAL, orphan INTEGER DEFAULT 0);
        CREATE TABLE assignment_weeks (assignment_id INTEGER, week TEXT,
            pages_assigned REAL, hours REAL, hours_effective REAL,
            pages_completed REAL);
        CREATE TABLE reported_capacity (person TEXT, week TEXT,
            available REAL, assigned REAL);
    """)
    db.executemany(
        "INSERT INTO people VALUES (:name,:role,:notes,:planned_time_off)",
        people)
    db.executemany(
        "INSERT OR REPLACE INTO capacity VALUES (:person,:week,:hours)", capacity)
    cols = [c for c in projects[0] if c != "row"]
    db.executemany(
        f"INSERT INTO projects (name,row,{','.join(c for c in cols if c != 'name')}) "
        f"VALUES (:name,:row,{','.join(':' + c for c in cols if c != 'name')})",
        projects)
    for row in assigns + orphans:
        cur = db.execute(
            "INSERT INTO assignments (source,src_row,person,project,role,role_raw,rate,orphan) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (row["source"], row["src_row"], row["person"], row["project"],
             row["role"], row.get("role_raw"), row["rate"], 0 if row in assigns else 1))
        aid = cur.lastrowid
        for wc in row["weeks"]:
            db.execute(
                "INSERT INTO assignment_weeks VALUES (?,?,?,?,?,?)",
                (aid, wc["week"], wc["pages_assigned"], wc["hours"],
                 wc["hours_effective"], wc["pages_completed"]))
    db.executemany(
        "INSERT INTO reported_capacity VALUES (:person,:week,:available,:assigned)",
        reported)
    db.commit()
    return db


# ---------------------------------------------------------------- rollups

def project_rollup(db):
    """Per-project recomputed totals, main Assignments tab (tracker's own
    source of record), with the On Health fork tab summed separately."""
    out = {}
    for src in ("Assignments", "Assignments On Health"):
        q = db.execute("""
            SELECT a.project, a.role,
                   SUM(COALESCE(w.pages_assigned, 0)),
                   SUM(COALESCE(w.hours_effective, 0)),
                   SUM(COALESCE(w.pages_completed, 0))
            FROM assignments a JOIN assignment_weeks w ON w.assignment_id = a.id
            WHERE a.orphan = 0 AND a.source = ?
            GROUP BY a.project, a.role
        """, (src,))
        for project, role, pages, hours, done in q:
            key = (project, role or "?")
            slot = out.setdefault(key, {
                "main_pages": 0, "main_hours": 0, "main_done": 0,
                "fork_pages": 0, "fork_hours": 0, "fork_done": 0,
            })
            pre = "main_" if src == "Assignments" else "fork_"
            slot[pre + "pages"] += pages
            slot[pre + "hours"] += hours
            slot[pre + "done"] += done
    return out


def effective_week_rows(db):
    """The two assignment tabs overlap: the 'Assignments On Health' tab is a
    newer re-plan of On Health work that still has stale rows on the main tab.
    Where both tabs schedule the same (person, project, week), the On Health
    tab supersedes; everything else passes through."""
    rows = list(db.execute("""
        SELECT a.source, a.person, a.project, a.role, w.week,
               COALESCE(w.pages_assigned, 0), COALESCE(w.hours_effective, 0),
               COALESCE(w.pages_completed, 0)
        FROM assignments a JOIN assignment_weeks w ON w.assignment_id = a.id
        WHERE a.orphan = 0"""))
    fork_keys = {(p, pr, wk) for s, p, pr, _, wk, *_ in rows
                 if s != "Assignments"}
    out = []
    for s, person, project, role, week, pages, hours, done in rows:
        if s == "Assignments" and (person, project, week) in fork_keys:
            continue
        out.append({"source": s, "person": person, "project": project,
                    "role": role, "week": week, "pages": pages,
                    "hours": hours, "completed": done})
    return out


def person_week_hours_effective(db):
    ph = {}
    for r in effective_week_rows(db):
        key = (r["person"], r["week"])
        ph[key] = ph.get(key, 0) + r["hours"]
    return ph


def weekly_flow(db, weeks=None):
    """Pages assigned vs completed per week, main tab, for charts."""
    weeks = weeks or WEEKS[:10]
    flow = {w: [0, 0] for w in weeks}
    for week, a, c in db.execute("""
        SELECT w.week, SUM(COALESCE(w.pages_assigned,0)),
               SUM(COALESCE(w.pages_completed,0))
        FROM assignments x JOIN assignment_weeks w ON w.assignment_id = x.id
        WHERE x.orphan = 0 AND x.source = 'Assignments' GROUP BY w.week"""):
        if week in flow:
            flow[week] = [round(a), round(c)]
    return [(w[5:7].lstrip("0") + "/" + w[8:10].lstrip("0"), *flow[w])
            for w in weeks]


def person_week_hours(db, sources):
    ph = {}
    q = db.execute(f"""
        SELECT a.person, w.week, SUM(COALESCE(w.hours_effective, 0))
        FROM assignments a JOIN assignment_weeks w ON w.assignment_id = a.id
        WHERE a.orphan = 0 AND a.source IN ({','.join('?' * len(sources))})
        GROUP BY a.person, w.week
    """, sources)
    for person, week, hrs in q:
        ph[(person, week)] = hrs
    return ph


# ---------------------------------------------------------------- forecast

FORECAST_START = datetime.date.fromisoformat(NEXT_WEEK)  # first plannable week
FORECAST_HORIZON = 52  # weeks


def typical_weekly_hours(db):
    """Median team availability across populated roster weeks — the
    steady-state capacity assumption (roster is empty beyond 8/24)."""
    totals = sorted(h for _, h in db.execute(
        "SELECT week, SUM(hours) FROM capacity GROUP BY week HAVING SUM(hours) > 0"))
    if not totals:
        return 0
    n = len(totals)
    return totals[n // 2] if n % 2 else (totals[n // 2 - 1] + totals[n // 2]) / 2


def project_demand(db, projects):
    """Remaining migration + QA hours per sized project with work left."""
    rollup = project_rollup(db)
    out = []
    for pr in projects:
        total = pr["total_pages"]
        if not total:
            continue
        mig = rollup.get((pr["name"], "Migration"), {})
        rem = total - mig.get("main_pages", 0)
        if rem <= 0:
            continue
        mig_h = rem / pr["mig_rate"] if pr["mig_rate"] else 0
        qa_rem = max(rem - rollup.get((pr["name"], "QA"), {}).get("main_pages", 0), 0)
        qa_h = qa_rem / pr["qa_rate"] if pr["qa_rate"] else 0
        out.append({
            "name": pr["name"], "deadline": pr["client_deadline"],
            "pages_remaining": round(rem), "mig_hours": round(mig_h, 1),
            "qa_hours": round(qa_h, 1), "hours": round(mig_h + qa_h, 1),
            "estimated": (mig_h + qa_h) > 0,  # no rates -> can't forecast
            "status": pr["status"], "priority": pr["priority"],
        })
    out.sort(key=lambda d: d["deadline"] or "9999")
    return out


def forecast(demands, weekly_hours):
    """Greedy allocation: each week's capacity goes to the earliest-deadline
    project first. Returns demands annotated with projected finish + slip.
    Mirrored in JS on the dashboard for the what-if slider."""
    left = {d["name"]: d["hours"] for d in demands}
    finish = {}
    for w in range(FORECAST_HORIZON):
        cap = weekly_hours
        for d in demands:
            if left[d["name"]] <= 0 or cap <= 0:
                continue
            take = min(cap, left[d["name"]])
            left[d["name"]] -= take
            cap -= take
            if left[d["name"]] <= 1e-9:
                finish[d["name"]] = FORECAST_START + datetime.timedelta(
                    days=7 * w + 6)
        if all(v <= 1e-9 for v in left.values()):
            break
    out = []
    for d in demands:
        f = finish.get(d["name"])
        slip = None
        if f and d["deadline"]:
            slip = (f - datetime.date.fromisoformat(d["deadline"])).days
        out.append({**d, "finish": f.isoformat() if f else None, "slip": slip})
    return out


# ---------------------------------------------------------------- validation

def validate(db, projects):
    findings = []

    def add(severity, check, detail):
        findings.append({"severity": severity, "check": check, "detail": detail})

    for sev, check, detail in dict.fromkeys(STRUCTURE_FINDINGS):
        add(sev, check, detail)

    # 1. Tracker's Weekly Capacity "Assigned" vs correctly recomputed hours.
    real = person_week_hours(db, ("Assignments",))
    mismatch = 0
    example = None
    for person, week, reported in db.execute(
            "SELECT person, week, COALESCE(assigned, 0) FROM reported_capacity"):
        actual = real.get((person, week), 0)
        if abs(reported - actual) > 0.05 and (reported or actual):
            mismatch += 1
            if example is None:
                example = (person, week, reported, actual)
    if mismatch:
        p, wk, rep, act = example
        add("HIGH", "capacity-wrong-column",
            f"Tracker Weekly Capacity 'Assigned' disagrees with summed hours in "
            f"{mismatch} person-weeks; its SUMIFs point at Pages Completed columns. "
            f"e.g. {p} wk {wk}: tracker says {rep:g}, actual hours {act:g}.")

    # 2. People wiring: assignments vs capacity sheet vs roster.
    roster = {r[0] for r in db.execute("SELECT name FROM people")}
    assigned_people = {r[0] for r in db.execute(
        "SELECT DISTINCT person FROM assignments WHERE orphan = 0")}
    reported_people = {r[0] for r in db.execute(
        "SELECT DISTINCT person FROM reported_capacity")}
    for p in sorted(assigned_people - reported_people):
        add("HIGH", "person-missing-from-capacity",
            f"'{p}' has assignments but no row on the Weekly Capacity sheet — "
            f"their hours are never capacity-checked.")
    for p in sorted(reported_people - roster):
        add("MEDIUM", "ghost-capacity-row",
            f"'{p}' is on the Weekly Capacity sheet but not on the roster "
            f"(source formula shows #REF!).")

    # 3. Hardcoded Pages Remaining overrides on Projects.
    rollup = project_rollup(db)
    for pr in projects:
        total = pr["total_pages"]
        shown = pr["mig_pages_remaining_shown"]
        if total is None or shown is None:
            continue
        assigned = rollup.get((pr["name"], "Migration"), {}).get("main_pages", 0)
        calc = total - assigned
        if abs(calc - shown) > 0.5:
            add("HIGH", "hardcoded-remaining",
                f"'{pr['name']}': Pages Remaining shows {shown:g} but "
                f"total {total:g} − assigned {assigned:g} = {calc:g} "
                f"(the cell is overridden by hand, or its formula is stale).")

    # 4. On Health fork divergence vs main Assignments tab.
    for (project, role), s in sorted(rollup.items()):
        if s["fork_pages"] and abs(s["fork_pages"] - s["main_pages"]) > 0.5:
            add("MEDIUM", "fork-divergence",
                f"'{project}' ({role}): main tab has {s['main_pages']:g} pages "
                f"assigned, 'Assignments On Health' tab has {s['fork_pages']:g}. "
                f"The fork tab feeds no rollup — the two conflict.")

    # 5. Orphan rows with data but no person/project.
    for src, row in db.execute(
            "SELECT source, src_row FROM assignments WHERE orphan = 1"):
        add("LOW", "orphan-row",
            f"{src} row {row} holds week data but no team member/project.")

    # 6. Assignments landing in weeks with no availability entered.
    cap_weeks = {r[0] for r in db.execute(
        "SELECT DISTINCT week FROM capacity WHERE hours > 0")}
    hot_weeks = sorted({r[0] for r in db.execute("""
        SELECT DISTINCT w.week FROM assignment_weeks w
        JOIN assignments a ON a.id = w.assignment_id
        WHERE a.orphan = 0 AND COALESCE(w.hours_effective, 0) > 0
    """)} - cap_weeks)
    for wk in hot_weeks:
        add("MEDIUM", "no-capacity-entered",
            f"Week {wk} has assigned hours but no availability entered on "
            f"the roster.")

    # 7. Pages assigned with no computable hours (no rate, no typed hours).
    #    Rows whose project is on no project sheet (live tracker: the On
    #    Health rows only exist on the ignored legacy sheet) are reported
    #    once, as a scoping problem, not once per week.
    known = {r[0].lower() for r in db.execute("SELECT name FROM projects")}
    unknown = {}
    for person, project, week, pages in db.execute("""
        SELECT a.person, a.project, w.week, w.pages_assigned
        FROM assignments a JOIN assignment_weeks w ON w.assignment_id = a.id
        WHERE a.orphan = 0 AND w.pages_assigned > 0 AND w.hours_effective IS NULL
    """):
        if (project or "").lower() not in known:
            unknown[project] = unknown.get(project, 0) + 1
            continue
        add("LOW", "pages-without-hours",
            f"{person} / {project} wk {week}: {pages:g} pages assigned but no "
            f"hours and no rate to derive them.")
    if unknown:
        names = ", ".join(f"{n} ({c} rows)" for n, c in sorted(unknown.items()))
        add("MEDIUM", "assignments-unknown-project",
            f"Assignment rows reference projects that are on no project sheet "
            f"(Active, Planned or Completed): {names}. Their pages count for "
            f"nobody until the project is listed, or the rows are removed.")

    return findings


# ---------------------------------------------------------------- outputs

HEADER_FILL = PatternFill("solid", fgColor="1F3864")
HEADER_FONT = Font(color="FFFFFF", bold=True)
RED = PatternFill("solid", fgColor="F8CBAD")
YELLOW = PatternFill("solid", fgColor="FFE699")
GREEN = PatternFill("solid", fgColor="C6E0B4")


def style_header(ws, row=1):
    for cell in ws[row]:
        if cell.value is not None:
            cell.fill = HEADER_FILL
            cell.font = HEADER_FONT
            cell.alignment = Alignment(wrap_text=True, vertical="top")
    ws.freeze_panes = ws.cell(row + 1, 2)


def autosize(ws, widths):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w


def write_report(db, projects, findings):
    wb = openpyxl.Workbook()
    ACCENT = "1F6E62"
    wk_hrs = typical_weekly_hours(db)
    fc = forecast(project_demand(db, projects), wk_hrs)

    # --- Summary (cover sheet) -------------------------------------
    ws = wb.active
    ws.title = "Summary"
    ws.sheet_properties.tabColor = ACCENT
    ws.sheet_view.showGridLines = False
    ws["A1"] = "CONTENT MIGRATION — MASTER REPORT"
    ws["A1"].font = Font(bold=True, size=20, color=ACCENT)
    ws["A2"] = (f"Generated {TODAY.isoformat()} from the migrator assignment "
                f"tracker · placeholder data")
    ws["A2"].font = Font(size=11, color="808080")
    ws["A3"] = ('Refresh: double-click "Refresh Dashboard.command" '
                "(or: python3 run_all.py)")
    ws["A3"].font = Font(size=10, italic=True, color="808080")

    eff = person_week_hours_effective(db)
    cap = {(p, w): h for p, w, h in db.execute("SELECT * FROM capacity")}
    over = [p for (p,) in db.execute("SELECT name FROM people")
            if (cap.get((p, CUR_WEEK), 0) or eff.get((p, CUR_WEEK), 0))
            and cap.get((p, CUR_WEEK), 0) - eff.get((p, CUR_WEEK), 0) < 0]
    hours_q = sum(d["hours"] for d in fc)
    kpis = [
        ("Pages remaining", f"{sum(d['pages_remaining'] for d in fc):,.0f}"),
        ("Hours queued (migration + QA)", f"{hours_q:,.0f}"),
        (f"Weeks of work @ {wk_hrs:g} hrs/wk",
         f"{hours_q / wk_hrs:.1f}" if wk_hrs else "—"),
        (f"Over capacity, week of {CUR_WEEK[5:]}", ", ".join(over) or "nobody"),
        ("Data-quality findings",
         f"{len(findings)} "
         f"({sum(1 for f in findings if f['severity'] == 'HIGH')} high)"),
    ]
    r = 5
    for label, val in kpis:
        ws.cell(r, 1, label).font = Font(size=11, color="606870")
        ws.cell(r, 2, val).font = Font(bold=True, size=13)
        r += 1

    r += 1
    ws.cell(r, 1, f"FORECAST — earliest-deadline-first @ {wk_hrs:g} hrs/wk"
            ).font = Font(bold=True, size=12, color=ACCENT)
    r += 1
    for d in fc:
        if not d["estimated"]:
            verdict, fill = "no rates set", YELLOW
        elif d["finish"] is None:
            verdict, fill = "not in 12 mo", RED
        elif d["slip"] is None:
            verdict, fill = "no deadline", YELLOW
        elif d["slip"] <= 0:
            verdict, fill = "on track", GREEN
        else:
            verdict, fill = f"misses by {d['slip']}d", RED
        ws.cell(r, 1, d["name"]).font = Font(size=11)
        ws.cell(r, 2, d["finish"] or "—").font = Font(size=11)
        c = ws.cell(r, 3, verdict)
        c.font = Font(size=11, bold=True)
        c.fill = fill
        r += 1

    r += 1
    ws.cell(r, 1, "TOP DATA-QUALITY FINDINGS").font = Font(
        bold=True, size=12, color=ACCENT)
    r += 1
    for f in [f for f in findings if f["severity"] == "HIGH"][:5]:
        ws.cell(r, 1, "• " + f["detail"]).font = Font(size=10.5)
        ws.cell(r, 1).alignment = Alignment(wrap_text=False)
        r += 1

    # weekly-flow chart (data parked in hidden columns AA:AC)
    ws.cell(1, 27, "Week"); ws.cell(1, 28, "Assigned"); ws.cell(1, 29, "Completed")
    flow = weekly_flow(db)
    for i, (w, a, c) in enumerate(flow, start=2):
        ws.cell(i, 27, w); ws.cell(i, 28, a); ws.cell(i, 29, c)
    for col in ("AA", "AB", "AC"):
        ws.column_dimensions[col].hidden = True
    chart = BarChart()
    chart.type = "col"
    chart.title = "Pages assigned vs completed by week"
    chart.height, chart.width = 7.5, 15
    chart.y_axis.majorGridlines = None
    data = Reference(ws, min_col=28, max_col=29, min_row=1, max_row=1 + len(flow))
    cats = Reference(ws, min_col=27, min_row=2, max_row=1 + len(flow))
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(cats)
    chart.series[0].graphicalProperties.solidFill = "5A5FD0"
    chart.series[1].graphicalProperties.solidFill = "1F8A4C"
    ws.add_chart(chart, "E5")
    autosize(ws, [46, 16, 16])

    # --- Dashboard -------------------------------------------------
    ws = wb.create_sheet("Projects Dashboard")
    ws.sheet_properties.tabColor = "5A5FD0"
    ws.append([
        "Project", "Type", "Complexity", "Total Pages",
        "Mig Pages Assigned", "Mig Pages Completed", "Mig Pages Remaining",
        "Mig Hours Remaining", "QA Pages Assigned", "QA Pages Remaining",
        "Client Deadline", "Days Left", "Priority", "Status", "Flags",
    ])
    rollup = project_rollup(db)
    for pr in projects:
        mig = rollup.get((pr["name"], "Migration"), {})
        qa = rollup.get((pr["name"], "QA"), {})
        total = pr["total_pages"]
        m_assigned = mig.get("main_pages", 0)
        m_done = mig.get("main_done", 0)
        m_remaining = (total - m_assigned) if total is not None else None
        m_hours_left = (m_remaining / pr["mig_rate"]
                        if m_remaining is not None and pr["mig_rate"] else None)
        q_assigned = qa.get("main_pages", 0)
        q_remaining = ((m_remaining if m_remaining is not None else 0) - q_assigned
                       if total is not None else None)
        days_left = None
        if pr["client_deadline"]:
            days_left = (datetime.date.fromisoformat(pr["client_deadline"])
                         - TODAY).days
        flags = []
        shown = pr["mig_pages_remaining_shown"]
        if (shown is not None and m_remaining is not None
                and abs(shown - m_remaining) > 0.5):
            flags.append(f"tracker shows {shown:g} remaining (override)")
        row = [
            pr["name"], pr["page_type"], pr["complexity"], total,
            m_assigned or None, m_done or None, m_remaining,
            round(m_hours_left, 1) if m_hours_left is not None else None,
            q_assigned or None, q_remaining,
            pr["client_deadline"], days_left, pr["priority"], pr["status"],
            "; ".join(flags) or None,
        ]
        ws.append(row)
        if days_left is not None:
            cell = ws.cell(ws.max_row, 12)
            cell.fill = RED if days_left < 0 else YELLOW if days_left <= 14 else GREEN
    style_header(ws)
    autosize(ws, [34, 10, 10, 11, 11, 11, 11, 11, 11, 11, 12, 9, 9, 16, 36])

    # --- Capacity --------------------------------------------------
    ws = wb.create_sheet("Capacity vs Assigned")
    ws.sheet_properties.tabColor = "C98A2B"
    ws.append(["Person"] + [f"{w[5:]} {t}" for w in WEEKS
                            for t in ("avail", "assigned", "delta")])
    eff = person_week_hours_effective(db)
    cap = {(p, w): h for p, w, h in db.execute("SELECT * FROM capacity")}
    people = [r[0] for r in db.execute("SELECT name FROM people")]
    extra = sorted({p for (p, _) in eff} - set(people))
    for person in people + extra:
        row = [person]
        for wk in WEEKS:
            avail = cap.get((person, wk), 0)
            assigned = eff.get((person, wk), 0)
            row += [avail or None, round(assigned, 1) or None,
                    round(avail - assigned, 1) if (avail or assigned) else None]
        ws.append(row)
        for i, wk in enumerate(WEEKS):
            cell = ws.cell(ws.max_row, 4 + i * 3)
            if cell.value is None:
                continue
            cell.fill = (RED if cell.value < 0
                         else YELLOW if cell.value <= 2 else GREEN)
    style_header(ws)
    autosize(ws, [14] + [9] * (len(WEEKS) * 3))

    # --- Flat assignments ------------------------------------------
    ws = wb.create_sheet("Assignments (normalized)")
    ws.sheet_properties.tabColor = "8A939B"
    ws.append(["Source Tab", "Person", "Project", "Role", "Pages/Hr", "Week",
               "Pages Assigned", "Hours (typed)", "Hours (effective)",
               "Pages Completed"])
    for r in db.execute("""
        SELECT a.source, a.person, a.project, a.role, a.rate, w.week,
               w.pages_assigned, w.hours, w.hours_effective, w.pages_completed
        FROM assignments a JOIN assignment_weeks w ON w.assignment_id = a.id
        WHERE a.orphan = 0 ORDER BY a.source, a.person, a.project, w.week
    """):
        ws.append(list(r))
    ws.auto_filter.ref = f"A1:J{ws.max_row}"
    style_header(ws)
    autosize(ws, [22, 12, 30, 11, 9, 11, 12, 11, 12, 12])

    # --- Forecast --------------------------------------------------
    ws = wb.create_sheet("Forecast")
    ws.sheet_properties.tabColor = "A03024"
    wk_hrs = typical_weekly_hours(db)
    fc = forecast(project_demand(db, projects), wk_hrs)
    ws.append([f"Capacity model: {wk_hrs:g} team hrs/week (median of "
               f"populated roster weeks), allocated earliest-deadline-first "
               f"from {FORECAST_START.isoformat()}."])
    ws.cell(1, 1).font = Font(italic=True, color="808080")
    ws.append([])
    ws.append(["Project", "Client Deadline", "Pages Remaining",
               "Migration Hrs", "QA Hrs", "Total Hrs",
               "Projected Finish", "Slip (days)", "Verdict"])
    for d in fc:
        slip = d["slip"]
        verdict = ("no rates set" if not d["estimated"]
                   else "no deadline" if slip is None and not d["deadline"]
                   else "not in 12 mo" if d["finish"] is None
                   else "on track" if slip <= 0
                   else "at risk" if slip <= 14 else "will miss")
        ws.append([d["name"], d["deadline"], d["pages_remaining"],
                   d["mig_hours"], d["qa_hours"], d["hours"],
                   d["finish"], slip, verdict])
        ws.cell(ws.max_row, 9).fill = (
            GREEN if verdict == "on track"
            else YELLOW if verdict in ("at risk", "no deadline", "no rates set")
            else RED)
    style_header(ws, row=3)
    autosize(ws, [34, 14, 14, 12, 10, 10, 15, 11, 13])

    # --- Data quality ----------------------------------------------
    # --- Client Matrix ---------------------------------------------
    mats = [r[0] for r in db.execute(
        "SELECT DISTINCT matrix FROM client_pages")]
    if mats:
        ws = wb.create_sheet("Client Matrix")
        ws.sheet_properties.tabColor = "2E86AB"
        r = 1
        for name in mats:
            total = db.execute("SELECT COUNT(*) FROM client_pages WHERE "
                               "matrix=?", (name,)).fetchone()[0]
            ws.cell(r, 1, name).font = Font(bold=True, size=13, color=ACCENT)
            ws.cell(r, 2, f"{total} pages")
            r += 2
            ws.cell(r, 1, "Stage").font = Font(bold=True)
            ws.cell(r, 2, "Pages").font = Font(bold=True)
            r += 1
            for lab, col in (("Draft delivered", "draft_delivered"),
                             ("Writing review done", "writing_done"),
                             ("Migrated (R1)", "migrated"),
                             ("QA passed (R1)", "qa_done"),
                             ("Delivered to client", "delivered"),
                             ("Client final review", "client_final")):
                n = db.execute(f"SELECT SUM({col}) FROM client_pages WHERE "
                               "matrix=?", (name,)).fetchone()[0] or 0
                ws.cell(r, 1, lab)
                ws.cell(r, 2, n)
                r += 1
            r += 1
        autosize(ws, [34, 12])

    ws = wb.create_sheet("Data Quality")
    ws.sheet_properties.tabColor = "C04B38"
    ws.append(["Severity", "Check", "Detail"])
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    for f in sorted(findings, key=lambda f: order[f["severity"]]):
        ws.append([f["severity"], f["check"], f["detail"]])
        ws.cell(ws.max_row, 1).fill = (
            RED if f["severity"] == "HIGH"
            else YELLOW if f["severity"] == "MEDIUM" else GREEN)
        ws.cell(ws.max_row, 3).alignment = Alignment(wrap_text=True)
    style_header(ws)
    autosize(ws, [10, 26, 110])

    wb.save(REPORT_PATH)


def write_morning_report(db, projects, findings):
    week = CUR_WEEK
    eff = person_week_hours_effective(db)
    cap = {(p, w): h for p, w, h in db.execute("SELECT * FROM capacity")}
    people = [r[0] for r in db.execute("SELECT name FROM people")]

    lines = [
        f"# Morning Report — {TODAY.strftime('%A, %B %-d, %Y')}",
        "",
        f"_Week of {week}. Generated from the master database "
        f"(tracker snapshot 8/17)._",
        "",
        "## Capacity this week",
        "",
        "| Person | Available | Assigned | Room |",
        "|---|---|---|---|",
    ]
    for p in people:
        avail = cap.get((p, week), 0)
        assigned = eff.get((p, week), 0)
        if not avail and not assigned:
            continue
        room = avail - assigned
        tag = " ⚠ over" if room < 0 else ""
        lines.append(f"| {p} | {avail:g} | {assigned:.1f} | {room:.1f}{tag} |")

    lines += ["", "## Projects needing attention", ""]
    rollup = project_rollup(db)
    flagged = 0
    for pr in projects:
        if not pr["total_pages"] or not pr["client_deadline"]:
            continue
        mig = rollup.get((pr["name"], "Migration"), {})
        remaining = pr["total_pages"] - mig.get("main_pages", 0)
        if remaining <= 0:
            continue
        days = (datetime.date.fromisoformat(pr["client_deadline"]) - TODAY).days
        rate = pr["mig_rate"]
        hours_left = remaining / rate if rate else None
        urgency = ("**OVERDUE**" if days < 0
                   else f"due in {days}d" if days <= 21 else f"due in {days}d")
        if days <= 21 or (pr["status"] or "").lower() == "blocked":
            flagged += 1
            extra = f" — status: {pr['status']}" if pr["status"] else ""
            hrs = f", ≈{hours_left:.0f} migration hrs left" if hours_left else ""
            lines.append(f"- **{pr['name']}** — {remaining:g} pages remaining"
                         f"{hrs}, {urgency}{extra}")
    if not flagged:
        lines.append("- Nothing inside the 3-week window. 👍")

    # Forecast pulse.
    wk_hrs = typical_weekly_hours(db)
    fc = forecast(project_demand(db, projects), wk_hrs)
    queue = sum(d["hours"] for d in fc)
    worst = max((d for d in fc if d["slip"] is not None),
                key=lambda d: d["slip"], default=None)
    lines += ["", "## Forecast", "",
              f"The queue holds **{queue:,.0f} hours** of remaining work — "
              f"about **{queue / wk_hrs:.1f} weeks** at the typical "
              f"{wk_hrs:g} team hrs/week."]
    if worst and worst["slip"] > 0:
        lines.append(f"Worst slip at current capacity: **{worst['name']}** "
                     f"misses its {worst['deadline']} deadline by "
                     f"**{worst['slip']} days** (projected {worst['finish']}).")

    # Client matrix pulse.
    for (mname,) in db.execute("SELECT DISTINCT matrix FROM client_pages"):
        tot, mig, qa, dlv = db.execute(
            "SELECT COUNT(*), SUM(migrated), SUM(qa_done), SUM(delivered) "
            "FROM client_pages WHERE matrix=?", (mname,)).fetchone()
        lines += ["", "## Client matrix", "",
                  f"**{mname}**: {tot} pages — {mig or 0} migrated, "
                  f"{qa or 0} QA'd, {dlv or 0} delivered to client."]

    high = [f for f in findings if f["severity"] == "HIGH"]
    lines += ["", "## Data quality", "",
              f"{len(findings)} findings ({len(high)} high). Top items:", ""]
    for f in high[:5]:
        lines.append(f"- {f['detail']}")

    no_cap = sorted({w for w in WEEKS if w > week}
                    - {w for (_, w), h in cap.items() if h})
    if no_cap:
        lines += ["", f"⚠ No availability entered on the roster for "
                      f"{len(no_cap)} upcoming weeks (from {no_cap[0][5:]} on) "
                      f"— scheduling beyond this week is flying blind."]

    path = os.path.join(HERE, f"morning-report-{TODAY.isoformat()}.md")
    with open(path, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    return path


# ---------------------------------------------------------------- main

def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    people, capacity = parse_roster(wb)
    projects = parse_projects(wb)
    rates = {}
    for pr in projects:
        if pr.get("mig_rate"):
            rates[(pr["name"].lower(), "Migration")] = pr["mig_rate"]
        if pr.get("qa_rate"):
            rates[(pr["name"].lower(), "QA")] = pr["qa_rate"]
    a_main, o_main = parse_assignments(wb, "Assignments", "Assignments", rates)
    if "Assignments On Health" in wb.sheetnames:  # optional fork tab
        a_oh, o_oh = parse_assignments(wb, "Assignments On Health",
                                       "Assignments On Health", rates)
    else:
        a_oh, o_oh = [], []
    reported = parse_reported_capacity(wb)

    db = build_db(people, capacity, projects, a_main + a_oh, o_main + o_oh,
                  reported)
    findings = validate(db, projects)

    # Reconciliation guardrail: our recomputed rollups vs the tracker's own
    # "Pages Assigned (so far)" columns. On the seeded tracker they match;
    # the live tracker's SUMIFS still look for the role "Migration" while
    # rows now say "Page Building", so its numbers go stale. A finding, not
    # an abort: the dashboard must keep working while the sheet is wrong.
    rollup = project_rollup(db)
    checked, bad = 0, []
    for pr in projects:
        for role, field in (("Migration", "mig_pages_assigned_shown"),
                            ("QA", "qa_pages_assigned_shown")):
            shown = pr.get(field)
            if shown is None:
                continue
            got = rollup.get((pr["name"], role), {}).get("main_pages", 0)
            checked += 1
            if abs(got - shown) > 0.5:
                bad.append(f"{pr['name']}/{role}: computed {got:g} "
                           f"vs sheet {shown:g}")
    if bad:
        findings.append({"severity": "HIGH", "check": "sheet-rollup-stale",
                         "detail": f"{len(bad)} 'Pages Assigned (so far)' "
                         f"cells on the project sheets disagree with the "
                         f"assignment rows (e.g. {'; '.join(bad[:3])}). The "
                         f"sheet formulas count the role 'Migration' only; "
                         f"rows now use 'Page Building'. The dashboard uses "
                         f"the recomputed numbers."})
        print(f"reconciliation: {len(bad)} of {checked} sheet rollups stale (finding)")
    else:
        print(f"reconciliation OK: {checked} tracker rollups reproduced")
    # persisted so push_snapshot.py can ship them without rebuilding
    # (a rebuild here would clobber master.db before client-matrix ingest)
    json.dump(findings, open(os.path.join(HERE, "findings.json"), "w"))

    # Client content matrices (Phase 1's "matrices feeding the master list").
    import client_matrix
    matrices = client_matrix.ingest(db)
    for s in matrices:
        link = client_matrix.link_to_project(db, s)
        if s["broken_refs"]:
            findings.append({"severity": "HIGH", "check": "matrix-dashboard-rot",
                             "detail": f"Client matrix '{s['name']}': its own "
                             f"DASHBOARD sheet has {s['broken_refs']} #REF! "
                             f"errors — the manual rollup is broken. The "
                             f"master now computes these rollups instead."})
        if s["no_disposition"]:
            findings.append({"severity": "MEDIUM", "check": "pages-no-disposition",
                             "detail": f"Client matrix '{s['name']}': "
                             f"{s['no_disposition']} of {s['total']} pages "
                             f"have no disposition marked (Write New / Revise "
                             f"/ etc.)."})
        if link and link["project"]:
            findings.append({"severity": "LOW", "check": "matrix-project-link",
                             "detail": f"Client matrix '{s['name']}' "
                             f"({s['total']} pages, section(s) "
                             f"{', '.join(s['sections'])}) maps to tracker "
                             f"project '{link['project']}' "
                             f"({link['total_pages']:g} pages total) via "
                             f"reviewer '{link['hint']}'."})
        print(f"client matrix: {s['name']} — {s['total']} pages, "
              f"funnel {[(l, n) for l, n in s['funnel']]}")

    write_report(db, projects, findings)
    morning = write_morning_report(db, projects, findings)
    db.commit()

    print(f"people={len(people)} capacity_cells={len(capacity)} "
          f"projects={len(projects)} assignments={len(a_main)+len(a_oh)} "
          f"orphans={len(o_main)+len(o_oh)}")
    print(f"findings: HIGH={sum(1 for f in findings if f['severity']=='HIGH')} "
          f"MEDIUM={sum(1 for f in findings if f['severity']=='MEDIUM')} "
          f"LOW={sum(1 for f in findings if f['severity']=='LOW')}")
    for f in findings:
        print(f"  [{f['severity']}] {f['check']}: {f['detail']}")
    print(f"wrote {DB_PATH}")
    print(f"wrote {REPORT_PATH}")
    print(f"wrote {morning}")


if __name__ == "__main__":
    sys.exit(main())
