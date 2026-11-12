#!/usr/bin/env python3
"""Client content-matrix ingest — Phase 1's second half.

Crystal's per-client matrix (one row per page, lifecycle columns across
disposition -> audit -> writing -> migration x3 rounds -> QA -> client
review) feeds the same master database as Laura's tracker. Start with one
matrix, prove it, add more: this module globs for *content-matrix*.xlsx
files in the parent folder and ingests every one it finds."""

import datetime
import glob
import json
import re
import os

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))

# Columns are found by their header, never by position. Tabs in the same matrix
# do not line up: 1-Stamats has a "URL to CMS Page" column the others lack, which
# once shifted everything after it by one. Matching ignores case, spacing and
# punctuation, so small wording edits are fine. Each key lists accepted labels,
# with the name to use if it has to tell someone the column is missing.
HEADERS = {
    "url": ("Old/Legacy URL", ("oldlegacyurl", "legacyurl", "oldurl")),
    "assigned_to": ("Assigned To", ("assignedto",)),
    "page_id": ("Page ID", ("pageid",)),
    "title": ("Navigation Title", ("navigationtitle",)),
    "new_url": ("New URL", ("newurl",)),
    "disp_delete": ("Delete", ("delete",)),
    "disp_reuse": ("Reuse", ("reuse",)),
    "disp_write_new": ("Write New", ("writenew",)),
    "disp_revise": ("Revise", ("revise",)),
    "disp_optimize": ("Optimize", ("optimize",)),
    "disp_as_is": ("As Is", ("asis",)),
    "disp_import": ("Import", ("import",)),
    "writer": ("Assigned Writer", ("assignedwriter",)),
    "draft_delivered": ("Draft Delivered", ("draftdelivered",)),
    "reviewer": ("Assigned Reviewer", ("assignedreviewer",)),
    "r1_review": ("Round 1 Review Complete (Date)", ("round1reviewcompletedate",)),
    "r1_updates": ("Round 1 Updates Complete (Date)", ("round1updatescompletedate",)),
    "mig_assigned_to": ("Assigned to (Migration)", ()),  # same words as Assigned To, told apart by its group
    "ready_date": ("Ready for Content Build (Date)", ("readyforcontentbuilddate",)),
    "mig_r1_by": ("Migrator (Initials)(Round 1)", ("migratorinitialsround1", "migratorinitials")),
    "mig_r1_done": ("Completion (Date)", ("completiondate", "completiondateround1", "migrationcompletiondate",
                                          "migrationcompletiondateround1")),
    "qa_r1_by": ("QA (Initials)", ("qainitials", "qainitialsround1")),
    "qa_r1_done": ("Complete (Date)", ("completedate", "completedateround1", "qacompletedate")),
    "mig_r2_by": ("Migrator (Initials) (Round 2)", ("migratorinitialsround2",)),
    "mig_r2_done": ("Migration Completion (Date) (Round 2)", ("migrationcompletiondateround2", "completiondateround2")),
    "qa_r2_by": ("QA Initials (Round 2)", ("qainitialsround2",)),
    "qa_r2_done": ("Complete (Date) (Round 2)", ("completedateround2",)),
    "mig_r3_by": ("Migrator Initials (Round 3)", ("migratorinitialsround3",)),
    "mig_r3_done": ("Completion (Date) (Round 3)", ("completiondateround3", "migrationcompletiondateround3")),
    "qa_r3_by": ("QA Initials (Round 3)", ("qainitialsround3",)),
    "qa_r3_done": ("Complete (Date) (Round 3)", ("completedateround3",)),
    "delivered": ("Deliver to Client (Date)", ("delivertoclientdate",)),
    "client_final": ("Final Review Complete (Date)", ("finalreviewcompletedate",)),
}
# Every number on the dashboard depends on these. Without one, the run stops
# instead of guessing, and the dashboard keeps its last good numbers. The rest
# only fill in details, so a missing one is reported and left blank.
REQUIRED = ("url", "assigned_to", "title", "new_url", "ready_date", "mig_r1_by", "mig_r1_done", "qa_r1_by", "qa_r1_done",
            "mig_r2_by", "mig_r2_done", "qa_r2_by", "qa_r2_done", "mig_r3_by", "mig_r3_done", "qa_r3_by", "qa_r3_done",
            "delivered")
MIN_HEADER_MATCHES = 8


def refuse(reason):
    raise SystemExit(f"Client matrix needs attention: {reason} The dashboard keeps its last good numbers.")


def _norm(v):
    return re.sub(r"[^a-z0-9]", "", str(v or "").lower())


def _label_key(label, group):
    """The key a header belongs to, or None."""
    if label == "assignedto":
        return "mig_assigned_to" if group == "migration" else "assigned_to"
    for key, (_, labels) in HEADERS.items():
        if label in labels or (key == "url" and label.startswith(labels)):
            return key
    return None


def find_columns(ws):
    """(header row, {key: column}, [problems]) from a section tab, or None when
    the tab has no recognizable header row."""
    best = None
    for r in range(1, min(ws.max_row, 6) + 1):
        hits = sum(1 for c in range(1, ws.max_column + 1)
                   if _label_key(_norm(ws.cell(r, c).value), "") is not None)
        if hits >= MIN_HEADER_MATCHES and (best is None or hits > best[1]):
            best = (r, hits)
    if best is None:
        return None
    row = best[0]
    cols, repeated = {}, []
    for c in range(1, ws.max_column + 1):
        group = _norm(ws.cell(row - 1, c).value) if row > 1 else ""
        key = _label_key(_norm(ws.cell(row, c).value), group)
        if key is None:
            continue
        if key in cols:
            repeated.append(key)
        else:
            cols[key] = c
    return row, cols, repeated
# One stage per page, decided from the latest round with any entry. Deliver
# to Client (column BB) is the only completion; QA pass or fail is never
# inferred (Eric, 2026-10-13). A built page sits "in QA" with whoever's
# initials are on that round, or with nobody, until a date closes the round.
STAGES = ["delivered", "in QA", "QA done, not delivered", "building",
          "ready to build", "not started"]
ROUNDS = (("mig_r3_by", "mig_r3_done", "qa_r3_by", "qa_r3_done"),
          ("mig_r2_by", "mig_r2_done", "qa_r2_by", "qa_r2_done"),
          ("mig_r1_by", "mig_r1_done", "qa_r1_by", "qa_r1_done"))


def page_stage(page):
    """(stage, holder initials or None, holder role or None)."""
    if page["delivered"]:
        return "delivered", None, None
    for m_by, m_done, q_by, q_done in ROUNDS:
        if not (page[m_by] or page[m_done] or page[q_by] or page[q_done]):
            continue
        if page[m_done] and not page[q_done]:
            return "in QA", (page[q_by] or "").strip().upper() or None, "QA"
        if page[m_done] and page[q_done]:
            return "QA done, not delivered", None, None
        return "building", (page[m_by] or "").strip().upper() or None, "Migration"
    if page["ready_date"]:
        return "ready to build", None, None
    return "not started", None, None
DISPOSITIONS = ["Write New", "Revise", "Optimize", "Reuse", "As Is",
                "Import", "Delete"]
DISP_COLS = ["disp_write_new", "disp_revise", "disp_optimize", "disp_reuse",
             "disp_as_is", "disp_import", "disp_delete"]
# funnel: a page has "reached" a stage if that cell is filled
FUNNEL = [
    ("Draft delivered", "draft_delivered"),
    ("Writing review done", "r1_updates"),
    ("Migrated (R1)", "mig_r1_done"),
    ("QA passed (R1)", "qa_r1_done"),
    ("Delivered to client", "delivered"),
    ("Client final review", "client_final"),
]


def _iso(v):
    """'2026-09-03 00:00:00' / datetime -> '2026-09-03'. A date typed or pasted as text,
    '11/9/26' or '11/9/2026' (US order, as the team types them), -> '2026-11-09'.
    Anything else, a typo included, -> None."""
    s = str(v or "").strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})$", s)
    if not m:
        return None
    month, day, year = int(m[1]), int(m[2]), int(m[3])
    try:
        return datetime.date(year + 2000 if year < 100 else year, month, day).isoformat()
    except ValueError:
        return None


def _is_page(url, title, new_url):
    vals = [str(v).strip() for v in (url, title, new_url) if v]
    if not vals:
        return False
    return not all(v.replace(".", "").replace(",", "").isdigit() for v in vals)


def _val(ws, r, cols, key):
    c = cols.get(key)
    v = ws.cell(r, c).value if c else None
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def find_matrices():
    # MM_MATRIX_DIR points the glob at a synced OneDrive/SharePoint folder;
    # default stays the project folder (the parent of this script's dir).
    parent = os.environ.get("MM_MATRIX_DIR") or \
        os.path.abspath(os.path.join(HERE, ".."))
    return sorted(p for p in glob.glob(os.path.join(parent, "*.xlsx"))
                  if "content-matrix" in os.path.basename(p).lower()
                  and not os.path.basename(p).startswith("~$")
                  and "-FIXED" not in os.path.basename(p))  # our own output


# Crystal's section tabs are numbered: 1-Stamats, 2-Programs, 3-WCC. Other
# tabs can be just as wide (a For-Reuse-Delete dump, a redirects list) and
# must not be mistaken for page lists.
SECTION_TAB = re.compile(r"^\d+\s*-")


def _is_client_owned(assigned_to):
    """Pages the client builds itself (Assigned To names the client, not
    Stamats) never get a Stamats completion date, so they are not the team's
    work and stay out of every count. Blank counts as Stamats."""
    s = (assigned_to or "").strip().lower()
    return bool(s) and "stamats" not in s


def parse_matrix(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    name = os.path.basename(path).replace(".xlsx", "")
    out = {"name": name, "sections": [], "pages": [], "broken_refs": 0,
           "skipped": [], "client_owned": 0, "missing_optional": []}
    numbered = [ws.title for ws in wb.worksheets if SECTION_TAB.match(ws.title.strip())]
    # their own DASHBOARD rollup, if present, and whether it has rotted
    for ws in wb.worksheets:
        if ws.title.upper() == "DASHBOARD":
            out["broken_refs"] = sum(
                1 for row in ws.iter_rows() for c in row
                if isinstance(c.value, str) and "#REF!" in c.value)
            continue
        # Numbered tabs are the sections. Any other tab wide enough to look
        # like a page list is skipped and reported, never counted. A matrix
        # with no numbered tab at all falls back to the width rule.
        if numbered:
            if ws.title not in numbered:
                if ws.max_column >= 60:
                    out["skipped"].append(ws.title)
                continue
        elif ws.max_column < 60:  # not a page-lifecycle sheet
            continue
        found = find_columns(ws)
        if found is None:
            if ws.max_column >= 60:   # looks like a page list, so it can't be ignored
                refuse(f"'{name}', tab '{ws.title}': its column headers can't be found.")
            out["skipped"].append(ws.title)   # a numbered tab that is not a page list
            continue
        header_row, cols, repeated = found
        missing = [k for k in REQUIRED if k not in cols]
        if missing:
            refuse(f"'{name}', tab '{ws.title}': can't find the column "
                   f"'{HEADERS[missing[0]][0]}'. It may have been renamed or removed.")
        twice = [k for k in repeated if k in REQUIRED]
        if twice:
            refuse(f"'{name}', tab '{ws.title}': there are two columns called '{HEADERS[twice[0]][0]}'.")
        out["missing_optional"] += [f"{ws.title}: {HEADERS[k][0]}" for k in HEADERS if k not in cols]
        out["sections"].append(ws.title)
        # A page row has a legacy URL, a title or a new URL (write-new pages
        # have no legacy URL). The counts row under the headers is all numbers
        # and is skipped by content, not by position.
        raw_pages = []
        for r in range(header_row + 1, ws.max_row + 1):
            if not _is_page(_val(ws, r, cols, "url"), _val(ws, r, cols, "title"),
                            _val(ws, r, cols, "new_url")):
                continue
            raw_pages.append({k: _val(ws, r, cols, k) for k in HEADERS})
        # A blank Assigned To inherits the tab's majority owner: on a tab the
        # client works (3-WCC) a blank row is theirs, not a Stamats page.
        owners = [p["assigned_to"].strip() for p in raw_pages if p["assigned_to"]]
        majority = max(set(owners), key=owners.count) if owners else None
        for page in raw_pages:
            if _is_client_owned(page["assigned_to"] or majority):
                out["client_owned"] += 1
                continue
            disp = next((lab for lab, key in zip(DISPOSITIONS, DISP_COLS)
                         if page[key]), None)
            stage, holder, holder_role = page_stage(page)
            out["pages"].append({
                "section": ws.title, "url": page["url"],
                "page_id": page["page_id"], "title": page["title"],
                "disposition": disp, "writer": page["writer"],
                "reviewer": page["reviewer"],
                "migrator": page["mig_r1_by"], "qa": page["qa_r1_by"],
                "stage": stage, "holder": holder, "holder_role": holder_role,
                "draft_date": _iso(page["draft_delivered"]),
                "delivered_date": _iso(page["delivered"]),
                # migration / QA completion dates (Round 1) drive the weekly
                # done-per-person view; initials in migrator / qa say who
                "migrated_date": _iso(page["mig_r1_done"]),
                "qa_date": _iso(page["qa_r1_done"]),
                "rework": bool(page["mig_r2_done"] or page["mig_r3_done"]),
                **{key: bool(page[key]) for _, key in FUNNEL},
            })
    return out


def summarize(m):
    pages = m["pages"]
    total = len(pages)
    disp = {}
    for p in pages:
        disp[p["disposition"] or "(none)"] = disp.get(p["disposition"] or "(none)", 0) + 1
    funnel = [(lab, sum(1 for p in pages if p[key])) for lab, key in FUNNEL]
    stages = {st: sum(1 for p in pages if p["stage"] == st) for st in STAGES}
    return {
        "name": m["name"], "sections": m["sections"], "total": total,
        "dispositions": disp, "funnel": funnel, "stages": stages,
        "qa_unassigned": sum(1 for p in pages if p["stage"] == "in QA" and not p["holder"]),
        "no_disposition": disp.get("(none)", 0),
        "broken_refs": m["broken_refs"],
        "skipped": m["skipped"], "client_owned": m["client_owned"],
        "missing_optional": m["missing_optional"],
    }


def ingest(db):
    """Load every client matrix into the master DB. Returns summaries."""
    db.executescript("""
        DROP TABLE IF EXISTS client_pages;
        CREATE TABLE client_pages (matrix TEXT, section TEXT, url TEXT,
            page_id TEXT, title TEXT, disposition TEXT, writer TEXT,
            reviewer TEXT, migrator TEXT, qa TEXT, stage TEXT,
            draft_delivered INT, writing_done INT, migrated INT,
            qa_done INT, delivered INT, client_final INT,
            draft_date TEXT, delivered_date TEXT, rework INT,
            migrated_date TEXT, qa_date TEXT, holder TEXT, holder_role TEXT);
        DROP TABLE IF EXISTS client_matrix_meta;
        CREATE TABLE client_matrix_meta (matrix TEXT, sections TEXT,
            skipped TEXT, client_owned INT);
    """)
    summaries = []
    for path in find_matrices():
        m = parse_matrix(path)
        db.execute("INSERT INTO client_matrix_meta VALUES (?,?,?,?)",
                   (m["name"], ", ".join(m["sections"]), ", ".join(m["skipped"]),
                    m["client_owned"]))
        for p in m["pages"]:
            db.execute(
                "INSERT INTO client_pages VALUES "
                "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (m["name"], p["section"], p["url"], p["page_id"], p["title"],
                 p["disposition"], p["writer"], p["reviewer"], p["migrator"],
                 p["qa"], p["stage"], p["draft_delivered"], p["r1_updates"],
                 p["mig_r1_done"], p["qa_r1_done"], p["delivered"],
                 p["client_final"], p["draft_date"], p["delivered_date"],
                 p["rework"], p["migrated_date"], p["qa_date"],
                 p["holder"], p["holder_role"]))
        summaries.append(summarize(m))
    db.commit()
    return summaries


def link_to_project(db, summary):
    """The Projects tab says which project a matrix belongs to when it can.
    Otherwise best-effort: the matrix's dominant client word (from its
    Assigned Reviewer column) vs tracker project names — e.g. reviewer
    'Washtenaw' -> project 'Washtenaw Community College'."""
    try:
        named = json.load(open(os.environ["MM_MATRIX_LINKS"])).get(summary["name"])
    except (KeyError, OSError, ValueError):
        named = None
    if named:
        row = db.execute("SELECT total_pages FROM projects WHERE name = ?", (named,)).fetchone()
        if row:
            return {"project": named, "hint": "Projects tab", "total_pages": row[0]}
    row = db.execute("""
        SELECT reviewer, COUNT(*) FROM client_pages
        WHERE matrix=? AND reviewer IS NOT NULL AND reviewer != 'Stamats'
        GROUP BY reviewer ORDER BY COUNT(*) DESC LIMIT 1
    """, (summary["name"],)).fetchone()
    hint = row[0] if row else None
    projects = list(db.execute(
        "SELECT name, total_pages FROM projects WHERE name IS NOT NULL"))
    if hint:
        for pname, total in projects:
            if hint.lower().split()[0] in (pname or "").lower():
                return {"project": pname, "hint": hint, "total_pages": total}
    # fallback: match a filename token against project names
    # (e.g. content-matrix-morehead -> "Morehead Alumni Foundation")
    for token in summary["name"].lower().replace("_", "-").split("-"):
        if len(token) < 5 or token in ("content", "matrix", "client", "sample"):
            continue
        for pname, total in projects:
            if token in (pname or "").lower():
                return {"project": pname, "hint": f"filename '{token}'",
                        "total_pages": total}
    if hint:
        return {"project": None, "hint": hint, "total_pages": None}
    return None
