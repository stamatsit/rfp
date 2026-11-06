#!/usr/bin/env python3
"""Build the Migration Tracker workbook the team types into and the dashboard reads.

The team's model stays exactly as they built it: Projects holds each client's
pages and minutes per job, Assignments gives each person page goals by week with
Hours and Hours Left beside each goal, and Still to assign, pinned at the top of
Assignments, counts down each project's pages as goals are typed. What changes is
that it cannot quietly go wrong:

- Row 1 of Team, Projects and Assignments is a hidden row of fixed keys. The
  dashboard finds columns by key, so a label can change without breaking it.
- The hidden _contract sheet carries the format version and totals the workbook
  calculates itself. The dashboard must arrive at the same totals or refuse.
- Only entry cells are unlocked and every formula is generated, so no row can
  drift away from the others.

Formulas stick to Excel 2007 era functions so the file behaves the same in
desktop Excel, Excel through Teams and the browser, and can be checked by a
second engine (LibreOffice). No macros: they do not run in Excel on the web.

Usage:
  build_tracker_workbook.py --from OLD.xlsx --out NEW.xlsx [--values VALUES.json]
                            [--matrix-link "Project=URL"]

--values holds cached formula results from an earlier recalculation, so a reader
that never recalculates (the pipeline) sees real numbers. The structure password
comes from TRACKER_PASSWORD and is never stored in this repo.
"""
import argparse
import datetime as dt
import json
import os
import shutil
import zipfile

import xlsxwriter
from openpyxl import load_workbook
from xlsxwriter.utility import xl_col_to_name as cn, xl_rowcol_to_cell as rc

FORMAT_NAME = "stamats-migration-tracker"
FORMAT_VERSION = 1

FIRST_WEEK = dt.date(2026, 9, 28)
N_WEEKS = 66
WEEKS = [FIRST_WEEK + dt.timedelta(days=7 * i) for i in range(N_WEEKS)]
PRINT_WEEKS = 14
JOBS = ["As Is Page Building", "Optimize Page Building", "QA", "Publish", "Firefighting"]
JOB_KEYS = ["as_is", "optimize", "qa", "publish", "firefighting"]
JOB_SHORT = ["As Is", "Optimize", "QA", "Publish", "Firefighting"]
PROJECT_STATUSES = ["Active", "Planned", "Completed"]
TEAM_STATUSES = ["Active", "Inactive"]

TEAM_ROWS, PROJECT_ROWS, ASG_ROWS = 40, 30, 250

# Evidence: matrix initials against tracker names and goals, 2026-11-04. Kelly H,
# Jeff and Leslie have no matrix work yet, so theirs stay blank for the team to fill.
KNOWN_INITIALS = {"Brian": "BM", "Debbie": "DS", "Chris J": "CJ", "Katie": "KE", "Amanda": "AG",
                  "Kelly O": "KO", "Kelly OF": "KOF", "Crystal": "CW"}

# ---- look: one accent (Stamats red, from the dashboard), quiet neutrals, and
# color otherwise reserved for status, so anything colorful means something
BRAND = "#C41230"
INK, MUTED, FAINT = "#1F2937", "#6B7280", "#A3A9B3"
LINE, LINE_STRONG = "#E9EBEF", "#CBD0D8"
SOFT, TINT = "#F7F8FA", "#FDF4F5"
GREEN, GREEN_BG = "#047857", "#D8F5E7"
AMBER, AMBER_BG = "#A85B06", "#FDF0C8"
RED, RED_BG = "#B91C1C", "#FDE3E3"
STRIPES = ["#C41230", "#2563EB", "#059669", "#D97706", "#7C3AED"]
FONT = "Arial"
HOME = "'Start Here'!A1"

# ---- layout, zero-indexed. Row 0 of each data tab is the hidden key row.
R_KEYS, R_BAND, R_TITLE, R_SUB, R_LINKS = 0, 1, 2, 3, 4

# Still to assign: one line per Active or Planned project, pinned above the grid so it is
# in view while people try out goals. One spare line; past that, the last line counts the rest.
BOX_HEAD, BOX_FIRST, BOX_N = 5, 6, 6
BOX_GAP = BOX_FIRST + BOX_N
A_DATES, A_WEEK, A_HEAD, A_FIRST = BOX_GAP + 1, BOX_GAP + 2, BOX_GAP + 3, BOX_GAP + 4
A_STRIPE, A_PERSON, A_PROJECT, A_JOB, A_STATUS, A_GAP, A_WK = 0, 1, 2, 3, 4, 5, 6
A_LAST = A_FIRST + ASG_ROWS - 1
A_END = A_WK + 3 * N_WEEKS - 1

T_MONTH, T_HEAD, T_FIRST = 5, 6, 7
T_NAME, T_INIT, T_ROLE, T_STATUS, T_USUAL, T_OFF, T_NOTES, T_GAP, T_WK = 1, 2, 3, 4, 5, 6, 7, 8, 9
T_LAST = T_FIRST + TEAM_ROWS - 1
T_END = T_WK + N_WEEKS - 1

P_GROUP, P_HEAD, P_FIRST = 5, 6, 7
P_NAME, P_STATUS, P_START, P_MIG, P_CLIENT, P_LINK, P_JOB0 = 1, 2, 3, 4, 5, 6, 7
P_NOTES = P_JOB0 + 4 * len(JOBS)
P_LAST = P_FIRST + PROJECT_ROWS - 1

C_MONTH, C_HEAD, C_AVAIL, C_ASSIGNED, C_LEFT, C_FIRST = 5, 6, 7, 8, 9, 10
C_NAME, C_ROLE, C_NOW, C_GAP, C_WK = 1, 2, 3, 4, 5
C_LAST = C_FIRST + TEAM_ROWS - 1
C_END = C_WK + N_WEEKS - 1

# _calc rows line up with Assignments rows; _cap rows line up with Team rows
K_PIDX, K_PRIDX, K_JIDX, K_RATE, K_SUM, K_BAD, K_PERSON, K_PROJECT, K_JOB = 0, 1, 2, 3, 4, 5, 6, 7, 8
CAP_ASG_OFFSET = 50


def goal_col(w):
    return A_WK + 3 * w


def date_or_none(v):
    if isinstance(v, dt.datetime):
        return v.date()
    return v if isinstance(v, dt.date) else None


def num_or_none(v):
    """A number, or None. Stray spaces and leftover text become blanks."""
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def text_or_none(v):
    s = str(v).strip() if v is not None else ""
    return s or None


def as_datetime(d):
    return dt.datetime(d.year, d.month, d.day)


def load_old_tracker(path):
    """Read the old tracker's typed inputs only. Its calculated columns are
    regenerated, because several had drifted between rows."""
    wb = load_workbook(path, data_only=True)
    ws = wb["USE THIS for weekly schedule"]
    week_col = {}
    for c in range(3, ws.max_column + 1):
        d = date_or_none(ws.cell(4, c).value)
        if d and d >= FIRST_WEEK:
            week_col[d] = c
    head = {str(ws.cell(4, c).value).strip().lower(): c for c in range(1, ws.max_column + 1)}
    team = []
    for r in range(5, ws.max_row + 1):
        name = text_or_none(ws.cell(r, 1).value)
        if not name:
            continue
        team.append({"name": name, "initials": KNOWN_INITIALS.get(name),
                     "role": text_or_none(ws.cell(r, 2).value), "status": "Active",
                     "notes": text_or_none(ws.cell(r, head["notes"]).value),
                     "time_off": text_or_none(ws.cell(r, head["planned time off"]).value),
                     "hours": {d: num_or_none(ws.cell(r, c).value) for d, c in week_col.items()
                               if num_or_none(ws.cell(r, c).value) is not None}})

    ws = wb["Projects"]
    projects = []
    pages = {"as_is": 6, "optimize": 10, "publish": 18, "firefighting": 22}
    minutes = {"as_is": 7, "optimize": 11, "qa": 15, "publish": 19, "firefighting": 23}
    for r in range(5, ws.max_row + 1):
        name = text_or_none(ws.cell(r, 1).value)
        if not name:
            continue
        projects.append({"name": name, "status": (text_or_none(ws.cell(r, 5).value) or "planned").capitalize(),
                         "start": date_or_none(ws.cell(r, 2).value), "mig": date_or_none(ws.cell(r, 3).value),
                         "client": date_or_none(ws.cell(r, 4).value), "notes": text_or_none(ws.cell(r, 26).value),
                         "pages": {k: num_or_none(ws.cell(r, c).value) for k, c in pages.items()},
                         "minutes": {k: num_or_none(ws.cell(r, c).value) for k, c in minutes.items()}})

    ws = wb["Assignments"]
    week_col = {date_or_none(ws.cell(4, c).value): c for c in range(5, ws.max_column + 1)
                if date_or_none(ws.cell(4, c).value)}
    rows = []
    for r in range(6, ws.max_row + 1):
        person, project, job = (text_or_none(ws.cell(r, c).value) for c in (1, 2, 3))
        if not (person or project or job):
            continue
        rows.append({"person": person, "project": project, "job": job,
                     "goals": {d: num_or_none(ws.cell(r, c).value) for d, c in week_col.items()
                               if num_or_none(ws.cell(r, c).value) is not None}})
    order = {p["name"]: i for i, p in enumerate(projects)}
    rows.sort(key=lambda a: (order.get(a["project"], len(order)), JOBS.index(a["job"]) if a["job"] in JOBS else len(JOBS)))
    return team, projects, rows


class Book:
    """xlsxwriter plus a format cache and cached formula results."""

    def __init__(self, path, values):
        self.wb = xlsxwriter.Workbook(path)
        self.values = values
        self._formats = {}

    def fmt(self, **props):
        base = {"font_name": FONT, "font_size": 10, "font_color": INK, "valign": "vcenter"}
        base.update(props)
        key = json.dumps(base, sort_keys=True)
        if key not in self._formats:
            self._formats[key] = self.wb.add_format(base)
        return self._formats[key]

    def rule(self, **props):
        return self.wb.add_format(props)

    def formula(self, ws, row, col, text, fmt=None):
        ws.write_formula(row, col, text, fmt, self.values.get(f"{ws.get_name()}!{rc(row, col)}", ""))


def input_cell(book, **extra):
    props = {"locked": False, "bottom": 1, "bottom_color": LINE}
    props.update(extra)
    return book.fmt(**props)


def calc_cell(book, **extra):
    props = {"font_color": MUTED, "bottom": 1, "bottom_color": LINE}
    props.update(extra)
    return book.fmt(**props)


def head_cell(book, **extra):
    props = {"bold": True, "font_size": 9, "font_color": MUTED, "bottom": 2, "bottom_color": LINE_STRONG,
             "text_wrap": True, "align": "left", "valign": "bottom"}
    props.update(extra)
    return book.fmt(**props)


CHIP_FORMULA = (f'=HYPERLINK("#{HOME}",IF(ErrCount>0,ErrCount&" to fix",'
                'IF(WarnCount>0,WarnCount&" heads up","All good")))')


def status_chip(book, ws, first, last, row=R_SUB):
    style = book.fmt(bold=True, align="center", font_size=9, font_color=GREEN, bg_color=GREEN_BG)
    if first != last:
        ws.merge_range(row, first, row, last, "", style)
    book.formula(ws, row, first, CHIP_FORMULA, style)
    rng = (row, first, row, last)
    ws.conditional_format(*rng, {"type": "formula", "criteria": "=ErrCount>0",
                                 "format": book.rule(font_color=RED, bg_color=RED_BG)})
    ws.conditional_format(*rng, {"type": "formula", "criteria": "=AND(ErrCount=0,WarnCount>0)",
                                 "format": book.rule(font_color=AMBER, bg_color=AMBER_BG)})


def chrome(book, ws, title, subtitle, chip, last_col):
    """Same top on every tab: brand band, title, one line of plain help, status."""
    ws.hide_gridlines(2)
    ws.hide_row_col_headers()
    ws.set_default_row(20, hide_unused_rows=True)
    ws.set_row(R_KEYS, None, None, {"hidden": True})
    ws.set_row(R_BAND, 4, book.fmt(bg_color=BRAND))
    ws.set_row(R_TITLE, 32)
    ws.set_row(R_SUB, 18)
    ws.set_row(R_LINKS, 8)
    ws.write(R_TITLE, 1, title, book.fmt(bold=True, font_size=20))
    ws.write(R_SUB, 1, subtitle, book.fmt(font_color=MUTED))
    status_chip(book, ws, *chip)
    quiet(ws)
    ws.set_column(last_col + 1, 16383, None, None, {"hidden": True})


def quiet(ws):
    """No green corner triangles: the grids mix formulas and blanks on purpose."""
    everything = "A1:XFD1048576"
    ws.ignore_errors({k: everything for k in ("number_stored_as_text", "formula_differs", "formula_range",
                                              "formula_unlocked", "empty_cell_reference", "list_data_validation",
                                              "two_digit_text_year")})


def link(book, ws, row, col, target, text):
    ws.write_url(row, col, f"internal:{target}", book.fmt(font_color=BRAND, underline=1, bold=True, font_size=9), text)


def month_band(book, ws, row, first_col):
    """One label per month above single-column week grids."""
    style = book.fmt(bold=True, font_size=9, font_color=MUTED, align="left", left=1, left_color=LINE_STRONG)
    i = 0
    while i < N_WEEKS:
        j = i
        while j + 1 < N_WEEKS and WEEKS[j + 1].month == WEEKS[i].month:
            j += 1
        if j > i:
            ws.merge_range(row, first_col + i, row, first_col + j, WEEKS[i].strftime("%b %Y").upper(), style)
        else:
            ws.write(row, first_col + i, WEEKS[i].strftime("%b").upper(), style)
        i = j + 1


def week_headers(book, ws, row, first_col):
    style = head_cell(book, num_format="mmm d", align="center")
    for i, d in enumerate(WEEKS):
        ws.write_datetime(row, first_col + i, as_datetime(d), style)
    last = first_col + N_WEEKS - 1
    head = rc(row, first_col, row_abs=True)
    ws.conditional_format(row, first_col, row, last, {"type": "formula", "criteria": f"={head}=ThisWeek",
                                                      "format": book.rule(bg_color=BRAND, font_color="#FFFFFF", bold=True)})
    ws.conditional_format(row, first_col, row, last, {"type": "formula", "criteria": f"={head}<ThisWeek",
                                                      "format": book.rule(font_color=FAINT)})


def this_week_index():
    return max(0, min(N_WEEKS - 1, (dt.date.today() - FIRST_WEEK).days // 7))


def protect(ws, password):
    ws.protect(password, {"objects": False, "scenarios": False, "format_columns": True, "format_rows": True,
                          "autofilter": True, "select_locked_cells": True, "select_unlocked_cells": True})


def page_setup(ws, last_row, last_col, repeat_rows=None):
    ws.set_landscape()
    ws.fit_to_pages(1, 0)
    ws.set_margins(left=0.3, right=0.3, top=0.4, bottom=0.4)
    ws.print_area(R_BAND, 0, last_row, last_col)
    if repeat_rows:
        ws.repeat_rows(*repeat_rows)


# ---------------------------------------------------------------- references
def absrange(sheet, r1, c1, r2, c2):
    name = f"'{sheet}'" if " " in sheet else sheet
    return f"{name}!{rc(r1, c1, True, True)}:{rc(r2, c2, True, True)}"


# Cut and paste makes Excel rewire any reference to the moved cell, which silently
# left hours under the wrong week (found in Excel, 11/4). So no reference is a typed
# cell, and no range starts or ends on one: a typed cell is read by its position in
# its whole row, and a range runs between locked cells, which can't be cut.
# Ranges are never built as INDEX(...):INDEX(...): Excel for the web does not
# recalculate those reliably, so a new line showed "Person?" (found 11/6).
HEAD = 1  # every safe_col range starts on its locked header, so item i is at position i + HEAD


def safe_col(sheet, r1, r2, c):
    """Typed rows r1..r2 of column c, from the locked header above to the locked row below."""
    col = cn(c)
    return f"{sheet}!${col}${r1}:${col}${r2 + 2}"


def row_cell(row, col, sheet=None):
    """One typed cell, found by position in its whole row."""
    prefix = f"{sheet}!" if sheet else ""
    return f"INDEX({prefix}${row + 1}:${row + 1},{col + 1})"


A_PERSONS = absrange("_calc", A_FIRST, K_PERSON, A_LAST, K_PERSON)
A_PROJECTS = absrange("_calc", A_FIRST, K_PROJECT, A_LAST, K_PROJECT)
A_JOBS = absrange("_calc", A_FIRST, K_JOB, A_LAST, K_JOB)
A_STATUSES = absrange("Assignments", A_FIRST, A_STATUS, A_LAST, A_STATUS)
K_SUMS = absrange("_calc", A_FIRST, K_SUM, A_LAST, K_SUM)
T_NAMES = safe_col("Team", T_FIRST, T_LAST, T_NAME)
T_INITS = safe_col("Team", T_FIRST, T_LAST, T_INIT)
T_ROLES = safe_col("Team", T_FIRST, T_LAST, T_ROLE)
T_STATUSES = safe_col("Team", T_FIRST, T_LAST, T_STATUS)
# The hours grid, from the locked gap column before the weeks to the locked column after them
T_GRID = absrange("Team", T_FIRST, T_GAP, T_LAST, T_END + 1)
P_NAMES = safe_col("Projects", P_FIRST, P_LAST, P_NAME)
P_STATUSES = safe_col("Projects", P_FIRST, P_LAST, P_STATUS)
P_CLIENTS = safe_col("Projects", P_FIRST, P_LAST, P_CLIENT)
P_LINKS = safe_col("Projects", P_FIRST, P_LAST, P_LINK)
P_ROWS = f"Projects!${P_FIRST + 1}:${P_LAST + 1}"


def p_job(pridx, jidx, field):
    """A project's job column, field 1 pages, 2 minutes, 3 pages per hour, 4 hours."""
    return f"INDEX({P_ROWS},{pridx},{P_JOB0}+({jidx}-1)*4+{field})"


def p_col(c):
    """A Projects column for the project rows, lined up with P_NAMES and P_STATUSES."""
    return safe_col("Projects", P_FIRST, P_LAST, c)
C_GRID = absrange("Capacity", C_FIRST, C_WK, C_LAST, C_END)
C_WEEKS = absrange("Capacity", C_HEAD, C_WK, C_HEAD, C_END)
H_HOURS_FIRST = goal_col(0) + 1

# _lists columns behind Still to assign; _lists row i + 1 is Projects row i
L_ACTIVE, L_PLANNED, L_RANK, L_LEFT0 = 7, 8, 9, 10
L_STATE = L_LEFT0 + len(JOBS)
L_RANKS = absrange("_lists", 1, L_RANK, PROJECT_ROWS, L_RANK)
L_STATES = absrange("_lists", 1, L_STATE, PROJECT_ROWS, L_STATE)
L_LEFTS = absrange("_lists", 1, L_LEFT0, PROJECT_ROWS, L_STATE - 1)


def l_left(j):
    """Pages left to assign for job j (0-based), one per project."""
    return absrange("_lists", 1, L_LEFT0 + j, PROJECT_ROWS, L_LEFT0 + j)


# ---------------------------------------------------------------- hidden sheets
def build_lists(book, ws):
    ws.write_row(0, 0, ["team", "team_n", "projects", "projects_n", "jobs", "project_status", "team_status",
                        "box_active_n", "box_planned_n", "box_rank"] + [f"left:{k}" for k in JOB_KEYS] + ["box_state"])
    for i in range(TEAM_ROWS):
        r = i + 1
        name, status = f"INDEX({T_NAMES},{i + 1 + HEAD})", f"INDEX({T_STATUSES},{i + 1 + HEAD})"
        book.formula(ws, r, 1, f'=IF(AND({name}<>"",{status}="Active"),MAX(B$1:B{r})+1,"")')
        book.formula(ws, r, 0, f'=IFERROR(INDEX({T_NAMES},MATCH({i + 1},$B$2:$B${TEAM_ROWS + 1},0)+{HEAD}),"")')
    for i in range(PROJECT_ROWS):
        r = i + 1
        name, status = f"INDEX({P_NAMES},{i + 1 + HEAD})", f"INDEX({P_STATUSES},{i + 1 + HEAD})"
        book.formula(ws, r, 3, f'=IF(AND({name}<>"",OR({status}="Active",{status}="Planned")),'
                               f'MAX(D$1:D{r})+1,"")')
        book.formula(ws, r, 2, f'=IFERROR(INDEX({P_NAMES},MATCH({i + 1},$D$2:$D${PROJECT_ROWS + 1},0)+{HEAD}),"")')
        # Still to assign. Pages left per job, for projects in the dropdown with pages for that job.
        live = f'AND({name}<>"",OR({status}="Active",{status}="Planned"))'
        for j in range(len(JOBS)):
            pages = p_job(i + 1, j + 1, 1)
            book.formula(ws, r, L_LEFT0 + j,
                         f'=IF(OR(NOT({live}),N({pages})<=0),"",'
                         f'{pages}-SUMIFS({K_SUMS},{A_PROJECTS},{name},{A_JOBS},$E${j + 2}))')
        lefts = f"{cn(L_LEFT0)}{r + 1}:{cn(L_STATE - 1)}{r + 1}"
        # Active projects list first, then Planned, each in Projects tab order
        for c, want in ((L_ACTIVE, "Active"), (L_PLANNED, "Planned")):
            col = cn(c)
            book.formula(ws, r, c, f'=IF(AND(COUNT({lefts})>0,{status}="{want}"),MAX({col}$1:{col}{r})+1,"")')
        a, p = f"{cn(L_ACTIVE)}{r + 1}", f"{cn(L_PLANNED)}{r + 1}"
        all_active = absrange("_lists", 1, L_ACTIVE, PROJECT_ROWS, L_ACTIVE).split("!")[1]
        book.formula(ws, r, L_RANK, f'=IF({a}<>"",{a},IF({p}<>"",MAX({all_active})+{p},""))')
        # 0 still to assign, 1 everything assigned, 2 something over-assigned
        book.formula(ws, r, L_STATE, f'=IF({cn(L_RANK)}{r + 1}="","",IF(COUNTIF({lefts},"<0")>0,2,'
                                     f'IF(COUNTIF({lefts},0)=COUNT({lefts}),1,0)))')
    ws.write_column(1, 4, JOBS)
    ws.write_column(1, 5, PROJECT_STATUSES)
    ws.write_column(1, 6, TEAM_STATUSES)
    wb = book.wb
    wb.define_name("TeamList", f"=_lists!$A$2:INDEX(_lists!$A$2:$A${TEAM_ROWS + 1},MAX(1,MAX(_lists!$B$2:$B${TEAM_ROWS + 1})))")
    wb.define_name("ProjectList", f"=_lists!$C$2:INDEX(_lists!$C$2:$C${PROJECT_ROWS + 1},MAX(1,MAX(_lists!$D$2:$D${PROJECT_ROWS + 1})))")
    wb.define_name("JobList", f"=_lists!$E$2:$E${len(JOBS) + 1}")
    wb.define_name("TeamNames", f"={T_NAMES}")
    wb.define_name("TeamInitials", f"={T_INITS}")
    wb.define_name("ProjectNames", f"={P_NAMES}")
    wb.define_name("AsgPeople", f"={A_PERSONS}")
    wb.define_name("ProjectStatusList", f"=_lists!$F$2:$F${len(PROJECT_STATUSES) + 1}")
    wb.define_name("TeamStatusList", f"=_lists!$G$2:$G${len(TEAM_STATUSES) + 1}")


def build_calc(book, ws):
    ws.write(0, 0, "this_week")
    ws.write(1, 0, "this_week_idx")
    date_fmt = book.fmt(num_format="yyyy-mm-dd")
    first = (FIRST_WEEK - dt.date(1899, 12, 30)).days
    book.formula(ws, 0, 1, "=TODAY()-WEEKDAY(TODAY(),3)", date_fmt)
    book.formula(ws, 1, 1, f'=IF(AND(B1>={first},B1<={first + 7 * (N_WEEKS - 1)}),(B1-{first})/7+1,"")')
    book.wb.define_name("ThisWeek", "=_calc!$B$1")
    book.wb.define_name("ThisWeekIdx", "=_calc!$B$2")
    # Goal rows run from the locked gap column to the locked column after the last week
    keys = absrange("Assignments", R_KEYS, A_GAP, R_KEYS, A_END + 1)
    for r in range(A_FIRST, A_LAST + 1):
        person, project, job = (rc(r, c, False, True) for c in (K_PERSON, K_PROJECT, K_JOB))
        for c, typed in ((K_PERSON, A_PERSON), (K_PROJECT, A_PROJECT), (K_JOB, A_JOB)):
            cell = row_cell(r, typed, "Assignments")
            book.formula(ws, r, c, f'=IF({cell}="","",{cell})')
        cells = absrange("Assignments", r, A_GAP, r, A_END + 1)
        pridx, jidx = rc(r, K_PRIDX, False, True), rc(r, K_JIDX, False, True)
        book.formula(ws, r, K_PIDX, f'=IF({person}="","",IFERROR(MATCH({person},{T_NAMES},0)-{HEAD},""))')
        book.formula(ws, r, K_PRIDX, f'=IF({project}="","",IFERROR(MATCH({project},{P_NAMES},0)-{HEAD},""))')
        book.formula(ws, r, K_JIDX, f'=IF({job}="","",IFERROR(MATCH({job},JobList,0),""))')
        book.formula(ws, r, K_RATE, f'=IF(OR({pridx}="",{jidx}=""),"",{p_job(pridx, jidx, 3)})')
        # A line with no person, project or job has been cleared, so goals left in it count for nothing.
        # Rows can't be deleted on a locked tab, and clearing those three cells is the way to remove a line.
        cleared = f'AND({person}="",{project}="",{job}="")'
        book.formula(ws, r, K_SUM, f'=IF({cleared},0,SUMIF({keys},"goal:*",{cells}))')
        book.formula(ws, r, K_BAD, f'=IF({cleared},0,SUMPRODUCT(--(LEFT({keys},5)="goal:"),--({cells}<>""),'
                                   f'1-ISNUMBER({cells})+ISNUMBER({cells})*({cells}<0)))')


def build_cap(book, ws):
    for i in range(TEAM_ROWS):
        r = T_FIRST + i
        usual = row_cell(r, T_USUAL, "Team")
        name = row_cell(r, T_NAME, "Team")
        for w in range(N_WEEKS):
            cell = row_cell(r, T_WK + w, "Team")
            book.formula(ws, r, w, f'=IF(ISNUMBER({cell}),{cell},IF(ISNUMBER({usual}),{usual},""))')
            hours = absrange("Assignments", A_FIRST, goal_col(w) + 1, A_LAST, goal_col(w) + 1)
            book.formula(ws, r + CAP_ASG_OFFSET, w, f'=IF({name}="",0,SUMIFS({hours},{A_PERSONS},{name}))')


def build_contract(book, ws, team_keys, project_keys, asg_keys):
    rows = [
        ("format", FORMAT_NAME), ("version", FORMAT_VERSION),
        ("goals_total", f"=SUM({K_SUMS})"),
        ("hours_assigned_total", f"=SUM({absrange('_cap', T_FIRST + CAP_ASG_OFFSET, 0, T_LAST + CAP_ASG_OFFSET, N_WEEKS - 1)})"),
        ("assignment_rows", f'=COUNTIF({A_STATUSES},"?*")'),
        ("team_count", f'=COUNTIF({T_NAMES},"?*")-{HEAD}'),
        ("project_count", f'=COUNTIF({P_NAMES},"?*")-{HEAD}'),
        ("errors", "=ErrCount"), ("warnings", "=WarnCount"),
        ("week_count", N_WEEKS), ("first_week", FIRST_WEEK.isoformat()),
        ("team_key_count", len(team_keys)), ("project_key_count", len(project_keys)),
        ("assignment_key_count", len(asg_keys)),
        # ROW() of a real cell, so these stay right if Excel ever shifts the rows
        ("team_first_row", f"=ROW(Team!{rc(T_HEAD, T_NAME, True, True)})+1"),
        ("team_last_row", f"=ROW(Team!{rc(T_HEAD, T_NAME, True, True)})+{TEAM_ROWS}"),
        ("project_first_row", f"=ROW(Projects!{rc(P_HEAD, P_NAME, True, True)})+1"),
        ("project_last_row", f"=ROW(Projects!{rc(P_HEAD, P_NAME, True, True)})+{PROJECT_ROWS}"),
        ("assignment_first_row", f"=ROW(Assignments!{rc(A_HEAD, A_PERSON, True, True)})+1"),
        ("assignment_last_row", f"=ROW(Assignments!{rc(A_HEAD, A_PERSON, True, True)})+{ASG_ROWS}"),
    ]
    for i, (k, v) in enumerate(rows):
        ws.write(i, 0, k)
        if isinstance(v, str) and v.startswith("="):
            book.formula(ws, i, 1, v)
        else:
            ws.write(i, 1, v)


# ---------------------------------------------------------------- team
def build_team(book, ws, team, password):
    chrome(book, ws, "Team", "New person? Use the first open row.", (T_STATUS, T_USUAL), T_END)
    ws.set_row(R_LINKS, 16)
    ws.write(R_LINKS, T_NAME, "Blank weekly hours use Usual hours. 0 means off.", book.fmt(font_size=9, font_color=FAINT))
    keys = {T_NAME: "team.name", T_INIT: "team.initials", T_ROLE: "team.role", T_STATUS: "team.status",
            T_USUAL: "team.usual_hours", T_OFF: "team.time_off", T_NOTES: "team.notes"}
    keys.update({T_WK + i: f"hours:{d.isoformat()}" for i, d in enumerate(WEEKS)})
    for c, k in keys.items():
        ws.write(R_KEYS, c, k)
    ws.set_column(0, 0, 1.6)
    for c, width in ((T_NAME, 18), (T_INIT, 8), (T_ROLE, 24), (T_STATUS, 10), (T_USUAL, 8), (T_OFF, 20),
                     (T_NOTES, 26), (T_GAP, 1.6)):
        ws.set_column(c, c, width)
    ws.set_column(T_WK, T_END, 6.4)
    ws.set_row(T_HEAD, 30)
    month_band(book, ws, T_MONTH, T_WK)
    for c, label in ((T_NAME, "Name"), (T_INIT, "Initials"), (T_ROLE, "Role"), (T_STATUS, "Status"), (T_USUAL, "Usual hours"),
                     (T_OFF, "Planned time off"), (T_NOTES, "Notes")):
        ws.write(T_HEAD, c, label, head_cell(book))
    week_headers(book, ws, T_HEAD, T_WK)

    text, center = input_cell(book), input_cell(book, align="center")
    bold = input_cell(book, bold=True)
    number = input_cell(book, align="center")
    for i in range(TEAM_ROWS):
        r = T_FIRST + i
        p = team[i] if i < len(team) else {}
        ws.write(r, T_NAME, p.get("name") or "", bold)
        ws.write(r, T_INIT, p.get("initials") or "", center)
        ws.write(r, T_ROLE, p.get("role") or "", text)
        ws.write(r, T_STATUS, p.get("status") or "", text)
        ws.write_blank(r, T_USUAL, None, number)
        ws.write(r, T_OFF, p.get("time_off") or "", text)
        ws.write(r, T_NOTES, p.get("notes") or "", text)
        for w, d in enumerate(WEEKS):
            v = (p.get("hours") or {}).get(d)
            if v is None:
                ws.write_blank(r, T_WK + w, None, number)
            else:
                ws.write_number(r, T_WK + w, v, number)

    ws.data_validation(T_FIRST, T_NAME, T_LAST, T_NAME, {
        "validate": "custom", "value": f"=COUNTIF(TeamNames,{rc(T_FIRST, T_NAME, False, True)})=1",
        "error_title": "Already on the team", "error_message": "That name is already in the list. Each person gets one row."})
    cell = rc(T_FIRST, T_INIT, False, True)
    ws.data_validation(T_FIRST, T_INIT, T_LAST, T_INIT, {
        "validate": "custom", "value": f"=AND(COUNTIF(TeamInitials,{cell})=1,EXACT({cell},UPPER({cell})),LEN({cell})<=4)",
        "input_title": "Initials", "input_message": "Exactly what this person types in the client matrices, in capitals.",
        "error_title": "Check the initials", "error_message": "Initials are capitals, 4 letters at most, and each person's must be different."})
    ws.data_validation(T_FIRST, T_STATUS, T_LAST, T_STATUS, {
        "validate": "list", "source": "=TeamStatusList",
        "input_title": "Status", "input_message": "Someone who left: pick Inactive. Their history stays and they leave the dropdown.",
        "error_title": "Pick from the list", "error_message": "Status is Active or Inactive."})
    hours_rule = {"validate": "decimal", "criteria": "between", "minimum": 0, "maximum": 80,
                  "error_title": "Hours", "error_message": "Hours are a number from 0 to 80. Leave it blank to use Usual hours."}
    ws.data_validation(T_FIRST, T_USUAL, T_LAST, T_USUAL, hours_rule)
    ws.data_validation(T_FIRST, T_WK, T_LAST, T_END, hours_rule)

    first = rc(T_FIRST, T_NAME, False, True)
    ws.conditional_format(T_FIRST, T_NAME, T_LAST, T_USUAL, {
        "type": "formula", "criteria": f'=AND({first}="",ROW()={T_FIRST + 1 - HEAD}+COUNTIF(TeamNames,"?*"))', "format": book.rule(bg_color=TINT)})
    ws.conditional_format(T_FIRST, T_INIT, T_LAST, T_INIT, {
        "type": "formula", "criteria": f'=AND({first}<>"",{cell}="",{rc(T_FIRST, T_STATUS, False, True)}="Active")',
        "format": book.rule(bg_color=AMBER_BG)})
    head = rc(T_HEAD, T_WK, True, False)
    ws.conditional_format(T_FIRST, T_WK, T_LAST, T_END, {"type": "formula", "criteria": f"={head}<ThisWeek",
                                                         "format": book.rule(font_color=FAINT)})
    ws.conditional_format(T_FIRST, T_WK, T_LAST, T_END, {"type": "formula", "criteria": f"={head}=ThisWeek",
                                                         "format": book.rule(bg_color=TINT)})
    ws.freeze_panes(T_FIRST, T_OFF, T_FIRST, T_WK + max(0, this_week_index() - 1))
    ws.set_selection(T_FIRST + len(team), T_NAME, T_FIRST + len(team), T_NAME)
    ws.set_tab_color(BRAND)
    page_setup(ws, T_FIRST + len(team) + 2, T_WK + PRINT_WEEKS - 1)
    protect(ws, password)
    return keys


# ---------------------------------------------------------------- projects
def build_projects(book, ws, projects, links, password):
    chrome(book, ws, "Projects", "One row per client.", (P_STATUS, P_STATUS), P_NOTES)
    keys = {P_NAME: "project.name", P_STATUS: "project.status", P_START: "project.start", P_MIG: "project.migration_deadline",
            P_CLIENT: "project.client_deadline", P_LINK: "project.matrix_link", P_NOTES: "project.notes"}
    for j, jk in enumerate(JOB_KEYS):
        base = P_JOB0 + 4 * j
        keys.update({base: f"{jk}.pages", base + 1: f"{jk}.minutes", base + 2: f"{jk}.pages_per_hour", base + 3: f"{jk}.hours"})
    for c, k in keys.items():
        ws.write(R_KEYS, c, k)
    ws.set_column(0, 0, 1.6)
    # Real Excel needs more room than LibreOffice: narrower date columns showed ##########
    for c, width in ((P_NAME, 36), (P_STATUS, 12), (P_START, 13.5), (P_MIG, 13.5), (P_CLIENT, 13.5), (P_LINK, 14), (P_NOTES, 36)):
        ws.set_column(c, c, width)
    ws.set_column(P_JOB0, P_NOTES - 1, 7.6)
    ws.set_row(P_HEAD, 30)
    for j, short in enumerate(JOB_SHORT):
        base = P_JOB0 + 4 * j
        ws.merge_range(P_GROUP, base, P_GROUP, base + 3, "QA (AS IS + OPTIMIZE)" if JOB_KEYS[j] == "qa" else short.upper(),
                       book.fmt(bold=True, font_size=9, font_color=INK, bottom=2, bottom_color=STRIPES[j], align="center",
                                left=1, left_color=LINE_STRONG))
        for off, label in enumerate(["Pages", "Minutes per page", "Pages per hour", "Hours needed"]):
            ws.write(P_HEAD, base + off, label, head_cell(book, align="center"))
    for c, label in ((P_NAME, "Project"), (P_STATUS, "Status"), (P_START, "Start"), (P_MIG, "Migration deadline"),
                     (P_CLIENT, "Client deadline"), (P_LINK, "Matrix link"), (P_NOTES, "Notes")):
        ws.write(P_HEAD, c, label, head_cell(book))

    text, bold = input_cell(book), input_cell(book, bold=True)
    date_in = input_cell(book, num_format="mmm d, yyyy", align="left")
    num_in = input_cell(book, align="center")  # General: "#,##0.##" shows 30 as "30."
    pages_in = input_cell(book, align="center", num_format="#,##0")
    calc_pages = calc_cell(book, align="center", num_format='#,##0;-#,##0;""')
    calc_rate = calc_cell(book, align="center", num_format="0.0#")
    calc_hours = calc_cell(book, align="center", num_format="#,##0.0")
    for i in range(PROJECT_ROWS):
        r = P_FIRST + i
        p = projects[i] if i < len(projects) else {}
        ws.write(r, P_NAME, p.get("name") or "", bold)
        ws.write(r, P_STATUS, p.get("status") or "", text)
        for c, k in ((P_START, "start"), (P_MIG, "mig"), (P_CLIENT, "client")):
            d = p.get(k)
            if d:
                ws.write_datetime(r, c, as_datetime(d), date_in)
            else:
                ws.write_blank(r, c, None, date_in)
        if links.get(p.get("name")):
            ws.write_string(r, P_LINK, links[p["name"]], text)
        else:
            ws.write_blank(r, P_LINK, None, text)
        ws.write(r, P_NOTES, p.get("notes") or "", text)
        for j, jk in enumerate(JOB_KEYS):
            base = P_JOB0 + 4 * j
            pages_c, min_c, rate_c = row_cell(r, base), row_cell(r, base + 1), rc(r, base + 2)
            if jk == "qa":
                book.formula(ws, r, base, f"=N({row_cell(r, P_JOB0)})+N({row_cell(r, P_JOB0 + 4)})", calc_pages)
            else:
                v = (p.get("pages") or {}).get(jk)
                if v is None:
                    ws.write_blank(r, base, None, pages_in)
                else:
                    ws.write_number(r, base, v, pages_in)
            m = (p.get("minutes") or {}).get(jk)
            if m is None:
                ws.write_blank(r, base + 1, None, num_in)
            else:
                ws.write_number(r, base + 1, m, num_in)
            book.formula(ws, r, base + 2, f'=IF(N({min_c})>0,60/{min_c},"")', calc_rate)
            book.formula(ws, r, base + 3, f'=IF(AND(N({pages_c})>0,ISNUMBER({rate_c})),{pages_c}/{rate_c},"")', calc_hours)

    ws.data_validation(P_FIRST, P_NAME, P_LAST, P_NAME, {
        "validate": "custom", "value": f"=COUNTIF(ProjectNames,{rc(P_FIRST, P_NAME, False, True)})=1",
        "error_title": "Already listed", "error_message": "That project is already in the list. Each project gets one row."})
    ws.data_validation(P_FIRST, P_STATUS, P_LAST, P_STATUS, {
        "validate": "list", "source": "=ProjectStatusList",
        "input_title": "Status", "input_message": "Completed projects leave the Assignments dropdown. Their history stays.",
        "error_title": "Pick from the list", "error_message": "Status is Active, Planned or Completed."})
    ws.data_validation(P_FIRST, P_START, P_LAST, P_CLIENT, {
        "validate": "date", "criteria": ">=", "value": dt.date(2020, 1, 1),
        "error_title": "Date", "error_message": "Enter a date, like 11/30/2026."})
    cell = rc(P_FIRST, P_LINK, False, True)
    ws.data_validation(P_FIRST, P_LINK, P_LAST, P_LINK, {
        "validate": "custom", "value": f'=AND(LEFT({cell},8)="https://",ISNUMBER(SEARCH(".sharepoint.com/",{cell})))',
        "input_title": "Matrix link", "input_message": "The client matrix's Anyone with the link share link. The dashboard reads finished pages from it.",
        "error_title": "Link", "error_message": "Paste the full SharePoint share link for this client's matrix."})
    for j, jk in enumerate(JOB_KEYS):
        base = P_JOB0 + 4 * j
        if jk != "qa":
            ws.data_validation(P_FIRST, base, P_LAST, base, {
                "validate": "integer", "criteria": ">=", "value": 0,
                "error_title": "Pages", "error_message": "Pages are a whole number, 0 or more."})
        ws.data_validation(P_FIRST, base + 1, P_LAST, base + 1, {
            "validate": "decimal", "criteria": "between", "minimum": 0.01, "maximum": 600,
            "error_title": "Minutes per page", "error_message": "Minutes per page are a number above 0."})
    first = rc(P_FIRST, P_NAME, False, True)
    ws.conditional_format(P_FIRST, P_NAME, P_LAST, P_STATUS, {
        "type": "formula", "criteria": f'=AND({first}="",ROW()={P_FIRST + 1 - HEAD}+COUNTIF(ProjectNames,"?*"))', "format": book.rule(bg_color=TINT)})
    st = rc(P_FIRST, P_STATUS, False, True)
    ws.conditional_format(P_FIRST, P_LINK, P_LAST, P_LINK, {
        "type": "formula", "criteria": f'=AND({st}="Active",{cell}="")', "format": book.rule(bg_color=AMBER_BG)})
    ws.freeze_panes(P_FIRST, P_START)
    ws.set_selection(P_FIRST + len(projects), P_NAME, P_FIRST + len(projects), P_NAME)
    ws.set_tab_color(BRAND)
    page_setup(ws, P_FIRST + len(projects) + 2, P_NOTES)
    protect(ws, password)
    return keys


# ---------------------------------------------------------------- assignments
def still_to_assign(book, ws):
    """Pages left of each job's total, one line per project, in view while goals are tried out."""
    first, last = BOX_FIRST, BOX_FIRST + BOX_N - 1
    ws.set_row(BOX_HEAD, 22)
    for r in range(first, last + 1):
        ws.set_row(r, 18)
    ws.set_row(BOX_GAP, 10)
    under = {"bottom": 1, "bottom_color": LINE_STRONG, "valign": "bottom"}
    ws.write_blank(BOX_HEAD, A_STRIPE, None, book.fmt(**under))
    ws.merge_range(BOX_HEAD, A_PERSON, BOX_HEAD, A_PROJECT, "STILL TO ASSIGN",
                   book.fmt(bold=True, font_size=9, font_color=MUTED, indent=1, **under))
    ws.merge_range(BOX_HEAD, A_JOB, BOX_HEAD, A_STATUS, "pages left of each job's total",
                   book.fmt(font_size=8, font_color=FAINT, **under))

    invisible = book.fmt(num_format=";;;")
    name_fmt = book.fmt(bold=True, indent=1)
    text_fmt = book.fmt(font_size=9)
    count = f"MAX({L_RANKS})"
    for k in range(1, BOX_N + 1):
        r = first + k - 1
        s, g = rc(r, A_STRIPE), rc(r, A_GAP)
        hit = f'IFERROR(MATCH({k},{L_RANKS},0),"")'
        overflow = k == BOX_N
        # The stripe holds the project's number, colored like its rows below; the gap holds its state
        book.formula(ws, r, A_STRIPE, f'=IF({count}>{BOX_N},"",{hit})' if overflow else f"={hit}", invisible)
        book.formula(ws, r, A_GAP, f'=IF({s}="","",INDEX({L_STATES},{s}))', invisible)
        name = f'IF({s}="","",INDEX({P_NAMES},{s}+{HEAD}))'
        if overflow:
            name = f'IF({count}>{BOX_N},"+"&({count}-{BOX_N - 1})&" more projects not shown",{name})'
        ws.merge_range(r, A_PERSON, r, A_PROJECT, "", name_fmt)
        book.formula(ws, r, A_PERSON, f"={name}", name_fmt)
        parts = []
        for j, short in enumerate(JOB_SHORT):
            left, pages = f"INDEX({l_left(j)},{s})", p_job(s, j + 1, 1)
            parts.append(f'IF(ISNUMBER({left})," · {short} "&IF({left}=0,"✓",IF({left}<0,TEXT(-{left},"#,##0")&" over",'
                         f'TEXT({left},"#,##0")&" of "&TEXT({pages},"#,##0"))),"")')
        ws.merge_range(r, A_JOB, r, A_STATUS, "", text_fmt)
        # MID drops the separator in front of the first job
        book.formula(ws, r, A_JOB, f'=IF({s}="","",IF({g}=1,"All assigned ✓",MID({"&".join(parts)},4,999)))', text_fmt)

    gs, ss, ns = (rc(first, c, False, True) for c in (A_GAP, A_STRIPE, A_PERSON))
    ws.conditional_format(first, A_JOB, last, A_STATUS, {"type": "formula", "criteria": f"={gs}=1",
                                                         "format": book.rule(font_color=GREEN, bold=True)})
    ws.conditional_format(first, A_JOB, last, A_STATUS, {"type": "formula", "criteria": f"={gs}=2",
                                                         "format": book.rule(font_color=AMBER, bg_color=AMBER_BG, bold=True)})
    ws.conditional_format(first, A_PERSON, last, A_PROJECT, {"type": "formula", "criteria": f'=AND({ss}="",{ns}<>"")',
                                                             "format": book.rule(font_color=MUTED, bold=False)})
    for i, color in enumerate(STRIPES):
        ws.conditional_format(first, A_STRIPE, last, A_STRIPE, {
            "type": "formula", "criteria": f"=AND(ISNUMBER({ss}),MOD({ss}-1,{len(STRIPES)})={i})", "format": book.rule(bg_color=color)})


def build_assignments(book, ws, rows, password):
    chrome(book, ws, "Assignments", "Pick a person, project and job, then type goals. To remove a line, clear those three.",
           (A_STATUS, A_STATUS), A_END)
    ws.set_row(A_DATES, None, None, {"hidden": True})
    keys = {A_PERSON: "asg.person", A_PROJECT: "asg.project", A_JOB: "asg.job"}
    keys.update({goal_col(i): f"goal:{d.isoformat()}" for i, d in enumerate(WEEKS)})
    for c, k in keys.items():
        ws.write(R_KEYS, c, k)
    # Job is wide so each project's line in Still to assign fits above it
    for c, width in ((A_STRIPE, 1.1), (A_PERSON, 13), (A_PROJECT, 28), (A_JOB, 30), (A_STATUS, 10), (A_GAP, 1.1)):
        ws.set_column(c, c, width)
    for w in range(N_WEEKS):
        ws.set_column(goal_col(w), goal_col(w), 5.8)
        ws.set_column(goal_col(w) + 1, goal_col(w) + 2, 4.9)

    jump = book.fmt(font_color=BRAND, underline=1, font_size=9, align="right", valign="bottom")
    ws.merge_range(R_TITLE, A_JOB, R_TITLE, A_STATUS, "", jump)
    book.formula(ws, R_TITLE, A_JOB,
                 f'=IF(ThisWeekIdx="","",HYPERLINK("#Assignments!"&ADDRESS({A_FIRST + 1},{A_WK + 1}+3*(ThisWeekIdx-1)),"Go to this week"))',
                 jump)
    still_to_assign(book, ws)

    ws.set_row(A_WEEK, 20)
    ws.set_row(A_HEAD, 30)
    date_hidden = book.fmt(num_format="yyyy-mm-dd")
    label = book.fmt(bold=True, font_size=10, align="center", num_format="mmm d", left=1, left_color=LINE)
    goal_head = head_cell(book, align="center", left=1, left_color=LINE)
    sub_head = head_cell(book, align="center", font_color=FAINT, bold=False, font_size=8)
    for w, d in enumerate(WEEKS):
        g = goal_col(w)
        for c in range(g, g + 3):
            ws.write_datetime(A_DATES, c, as_datetime(d), date_hidden)
        ws.merge_range(A_WEEK, g, A_WEEK, g + 2, as_datetime(d), label)
        ws.write(A_HEAD, g, "Goal", goal_head)
        ws.write(A_HEAD, g + 1, "Hrs", sub_head)
        ws.write(A_HEAD, g + 2, "Left", sub_head)
    ws.write(A_HEAD, A_PERSON, "Person", head_cell(book, indent=1))
    for c, text in ((A_PROJECT, "Project"), (A_JOB, "Job")):
        ws.write(A_HEAD, c, text, head_cell(book))
    ws.write_blank(A_HEAD, A_STATUS, None, head_cell(book))  # the check only speaks up when something is wrong

    text = input_cell(book)
    strong = input_cell(book, bold=True, indent=1)
    goal_fmt = input_cell(book, align="center", num_format="#,##0", bold=True, left=1, left_color=LINE)
    status_fmt = book.fmt(align="center", font_size=8, bold=True, font_color="#FFFFFF", bottom=1, bottom_color=LINE)
    small = calc_cell(book, align="center", font_size=9, num_format="0.0")
    invisible = book.fmt(num_format=";;;")
    for i in range(ASG_ROWS):
        r = A_FIRST + i
        a = rows[i] if i < len(rows) else {}
        ws.write(r, A_PERSON, a.get("person") or "", strong)
        ws.write(r, A_PROJECT, a.get("project") or "", text)
        ws.write(r, A_JOB, a.get("job") or "", text)
        # Invisible local copies, so color rules never point at another sheet:
        # the stripe holds the project's number, the gap holds the person's.
        book.formula(ws, r, A_STRIPE, f"=_calc!{rc(r, K_PRIDX, False, True)}", invisible)
        book.formula(ws, r, A_GAP, f"=_calc!{rc(r, K_PIDX, False, True)}", invisible)
        rate = f"_calc!{rc(r, K_RATE, False, True)}"
        for w, d in enumerate(WEEKS):
            g = goal_col(w)
            v = (a.get("goals") or {}).get(d)
            if v is None:
                ws.write_blank(r, g, None, goal_fmt)
            else:
                ws.write_number(r, g, v, goal_fmt)
            gc = row_cell(r, g)
            book.formula(ws, r, g + 1, f'=IF(AND(ISNUMBER({gc}),ISNUMBER({rate})),{gc}/{rate},"")', small)
            pidx = rc(r, A_GAP, False, True)
            # Hours and Left only speak up beside a goal, which keeps the grid quiet
            book.formula(ws, r, g + 2, f'=IF(OR({pidx}="",NOT(ISNUMBER({gc}))),"",INDEX({C_GRID},{pidx},{w + 1}))', small)
        P, Pr, J = (f"_calc!{rc(r, c, False, True)}" for c in (K_PERSON, K_PROJECT, K_JOB))
        pidx_k, pridx, jidx, total, bad = (f"_calc!{rc(r, c, False, True)}" for c in (K_PIDX, K_PRIDX, K_JIDX, K_SUM, K_BAD))
        book.formula(ws, r, A_STATUS,
                     f'=IF(AND({P}="",{Pr}="",{J}="",{total}=0,{bad}=0),"",'
                     f'IF(OR({P}="",{Pr}="",{J}=""),"Incomplete",'
                     f'IF({pidx_k}="","Person?",IF({pridx}="","Project?",IF({jidx}="","Job?",'
                     f'IF(COUNTIFS({A_PERSONS},{P},{A_PROJECTS},{Pr},{A_JOBS},{J})>1,"Duplicate",'
                     f'IF({bad}>0,"Bad goal",IF(AND({total}>0,NOT(ISNUMBER({rate}))),"No rate","OK"))))))))',
                     status_fmt)

    ws.data_validation(A_FIRST, A_PERSON, A_LAST, A_PERSON, {
        "validate": "list", "source": "=TeamList",
        "input_title": "Person", "input_message": "Pick from the list. Not there? Add them on the Team tab first.",
        "error_title": "Not on the team", "error_message": "Pick a name from the list. New people go on the Team tab first."})
    ws.data_validation(A_FIRST, A_PROJECT, A_LAST, A_PROJECT, {
        "validate": "list", "source": "=ProjectList",
        "input_title": "Project", "input_message": "Active and planned projects. Not there? Add it on the Projects tab first.",
        "error_title": "Not on the list", "error_message": "Pick a project from the list. New ones go on the Projects tab first."})
    ws.data_validation(A_FIRST, A_JOB, A_LAST, A_JOB, {
        "validate": "list", "source": "=JobList",
        "error_title": "Pick from the list", "error_message": "Pick one of the five jobs in the list."})
    goal_rule = {"validate": "integer", "criteria": ">=", "value": 0, "error_title": "Page goal",
                 "error_message": "Page goals are whole numbers. Leave the cell empty if there is no goal this week."}
    for w in range(N_WEEKS):
        ws.data_validation(A_FIRST, goal_col(w), A_LAST, goal_col(w), goal_rule)

    def cols(offset):
        return " ".join(f"{rc(A_FIRST, goal_col(w) + offset)}:{rc(A_LAST, goal_col(w) + offset)}" for w in range(N_WEEKS))

    grid = (A_FIRST, A_WK, A_LAST, A_END)
    day = rc(A_DATES, A_WK, True, False)
    gc, hc, lc = rc(A_FIRST, goal_col(0)), rc(A_FIRST, goal_col(0) + 1), rc(A_FIRST, goal_col(0) + 2)
    # Whole numbers lose their .0
    ws.conditional_format(A_FIRST, goal_col(0) + 1, A_LAST, goal_col(0) + 1, {
        "type": "formula", "multi_range": cols(1) + " " + cols(2),
        "criteria": f"=AND(ISNUMBER({hc}),{hc}=ROUND({hc},0))", "format": book.rule(num_format="0")})
    # Goals left on a cleared line count for nothing, so they look it. A blank Check means cleared or empty.
    ws.conditional_format(*grid, {"type": "formula", "stop_if_true": True,
                                  "criteria": f'={rc(A_FIRST, A_STATUS, False, True)}=""',
                                  "format": book.rule(font_color=FAINT, bold=False)})
    # Past weeks go quiet first, so old overages never shout
    ws.conditional_format(*grid, {"type": "formula", "stop_if_true": True, "criteria": f"={day}<ThisWeek",
                                  "format": book.rule(font_color=FAINT, bold=False)})
    # A goal turns red when it pushes the person over their hours that week
    ws.conditional_format(A_FIRST, goal_col(0), A_LAST, goal_col(0), {
        "type": "formula", "multi_range": cols(0), "criteria": f"=AND(ISNUMBER({gc}),ISNUMBER({lc}),{lc}<0)",
        "format": book.rule(bg_color=RED_BG, font_color=RED)})
    ws.conditional_format(A_FIRST, goal_col(0) + 2, A_LAST, goal_col(0) + 2, {
        "type": "formula", "multi_range": cols(2), "criteria": f"=AND(ISNUMBER({lc}),{lc}<0)",
        "format": book.rule(bg_color=RED_BG, font_color=RED, bold=True)})
    ws.conditional_format(A_FIRST, goal_col(0) + 2, A_LAST, goal_col(0) + 2, {
        "type": "formula", "multi_range": cols(2), "criteria": f'={lc}="?"',
        "format": book.rule(font_color=AMBER, bold=True)})
    ws.conditional_format(*grid, {"type": "formula", "criteria": f"={day}=ThisWeek", "format": book.rule(bg_color=TINT)})

    wb_header = rc(A_WEEK, A_WK, True, False)
    ws.conditional_format(A_WEEK, A_WK, A_WEEK, A_END, {"type": "formula", "criteria": f"={wb_header}=ThisWeek",
                                                        "format": book.rule(bg_color=BRAND, font_color="#FFFFFF")})
    ws.conditional_format(A_WEEK, A_WK, A_WEEK, A_END, {"type": "formula", "criteria": f"=AND(ISNUMBER({wb_header}),{wb_header}<ThisWeek)",
                                                        "format": book.rule(font_color=FAINT)})

    st = rc(A_FIRST, A_STATUS, False, True)
    col = (A_FIRST, A_STATUS, A_LAST, A_STATUS)
    ws.conditional_format(*col, {"type": "formula", "stop_if_true": True, "criteria": f'={st}="OK"',
                                 "format": book.rule(font_color="#FFFFFF", bg_color="#FFFFFF")})
    ws.conditional_format(*col, {"type": "formula", "stop_if_true": True, "criteria": f'={st}="No rate"',
                                 "format": book.rule(bg_color=AMBER_BG, font_color=AMBER)})
    ws.conditional_format(*col, {"type": "formula", "criteria": f'={st}<>""', "format": book.rule(bg_color=RED, font_color="#FFFFFF")})
    pr_idx = rc(A_FIRST, A_STRIPE, False, True)
    for i, color in enumerate(STRIPES):
        ws.conditional_format(A_FIRST, A_STRIPE, A_LAST, A_STRIPE, {
            "type": "formula", "criteria": f"=AND(ISNUMBER({pr_idx}),MOD({pr_idx}-1,{len(STRIPES)})={i})", "format": book.rule(bg_color=color)})
    ws.conditional_format(A_FIRST, A_PERSON, A_LAST, A_JOB, {
        "type": "formula", "criteria": f'=AND({rc(A_FIRST, A_PERSON, False, True)}="",ROW()={A_FIRST + 1}+COUNTIF(AsgPeople,"?*"))',
        "format": book.rule(bg_color=TINT)})

    ws.autofilter(A_HEAD, A_PERSON, A_LAST, A_JOB)  # stops at Job: the Check column has nothing worth filtering
    ws.freeze_panes(A_FIRST, A_WK, A_FIRST, goal_col(max(0, this_week_index() - 1)))
    ws.set_selection(A_FIRST + len(rows), A_PERSON, A_FIRST + len(rows), A_PERSON)
    ws.set_tab_color(BRAND)
    page_setup(ws, A_FIRST + len(rows) + 2, goal_col(PRINT_WEEKS - 1) + 2)
    protect(ws, password)
    return keys


# ---------------------------------------------------------------- capacity
def build_capacity(book, ws, team_n, password):
    chrome(book, ws, "Capacity", "Red is over. ? means goals but no hours entered.", (C_NOW, C_NOW), C_END)
    ws.set_column(0, 0, 1.6)
    for c, width in ((C_NAME, 20), (C_ROLE, 22), (C_NOW, 11), (C_GAP, 1.6)):
        ws.set_column(c, c, width)
    ws.set_column(C_WK, C_END, 6)
    month_band(book, ws, C_MONTH, C_WK)
    ws.set_row(C_HEAD, 30)
    ws.write(C_HEAD, C_NAME, "Person", head_cell(book))
    ws.write(C_HEAD, C_ROLE, "Role", head_cell(book))
    ws.write(C_HEAD, C_NOW, "Left this week", head_cell(book, align="center"))
    week_headers(book, ws, C_HEAD, C_WK)

    lab = book.fmt(bold=True, font_size=9, font_color=MUTED, bg_color=SOFT)
    val = book.fmt(align="center", font_size=9, font_color=MUTED, bg_color=SOFT, num_format="General;-General;;@")
    val_b = book.fmt(align="center", font_size=9, bold=True, bg_color=SOFT, bottom=2, bottom_color=LINE_STRONG)
    lab_b = book.fmt(bold=True, font_size=9, bg_color=SOFT, bottom=2, bottom_color=LINE_STRONG)
    for row, label in ((C_AVAIL, "Team hours available"), (C_ASSIGNED, "Team hours assigned"), (C_LEFT, "Team hours left")):
        strong = row == C_LEFT
        ws.write(row, C_NAME, label, lab_b if strong else lab)
        ws.write_blank(row, C_ROLE, None, lab_b if strong else lab)
        row_rng = f"{rc(row, C_WK, False, True)}:{rc(row, C_END, False, True)}"
        book.formula(ws, row, C_NOW, f'=IF(ThisWeekIdx="","",INDEX({row_rng},ThisWeekIdx))', val_b if strong else val)
        for w in range(N_WEEKS):
            if row == C_LEFT:
                avail, asg = rc(C_AVAIL, C_WK + w), rc(C_ASSIGNED, C_WK + w)
                f = f'=IF({avail}=0,IF({asg}=0,"","?"),ROUND({avail}-{asg},1))'
            else:
                first = T_FIRST + (0 if row == C_AVAIL else CAP_ASG_OFFSET)
                f = f"=ROUND(SUM(_cap!{rc(first, w, True, True)}:{rc(first + TEAM_ROWS - 1, w, True, True)}),1)"
            book.formula(ws, row, C_WK + w, f, val_b if strong else val)

    name_fmt = book.fmt(bold=True, bottom=1, bottom_color=LINE)
    role_fmt = book.fmt(font_color=MUTED, font_size=9, bottom=1, bottom_color=LINE)
    cell_fmt = book.fmt(align="center", font_size=9, bottom=1, bottom_color=LINE)
    now_fmt = book.fmt(align="center", bold=True, bottom=1, bottom_color=LINE)
    for i in range(TEAM_ROWS):
        r = C_FIRST + i
        t = T_FIRST + i
        name = f"INDEX({T_NAMES},{i + 1 + HEAD})"
        book.formula(ws, r, C_NAME, f'=IF({name}="","",{name})', name_fmt)
        role = f"INDEX({T_ROLES},{i + 1 + HEAD})"
        book.formula(ws, r, C_ROLE, f'=IF({role}="","",{role})', role_fmt)
        row_rng = f"{rc(r, C_WK, False, True)}:{rc(r, C_END, False, True)}"
        book.formula(ws, r, C_NOW, f'=IF(ThisWeekIdx="","",INDEX({row_rng},ThisWeekIdx))', now_fmt)
        for w in range(N_WEEKS):
            avail, asg = f"_cap!{rc(t, w)}", f"_cap!{rc(t + CAP_ASG_OFFSET, w)}"
            book.formula(ws, r, C_WK + w, f'=IF({name}="","",IF({avail}="",IF({asg}=0,"","?"),ROUND({avail}-{asg},1)))', cell_fmt)

    team_left = rc(C_LEFT, C_WK)
    ws.conditional_format(C_LEFT, C_WK, C_LEFT, C_END, {"type": "formula", "criteria": f"=AND(ISNUMBER({team_left}),{team_left}<0)",
                                                        "format": book.rule(font_color=RED)})
    grid = (C_FIRST, C_WK, C_LAST, C_END)
    tl = rc(C_FIRST, C_WK)
    head = rc(C_HEAD, C_WK, True, False)
    ws.conditional_format(*grid, {"type": "formula", "stop_if_true": True, "criteria": f"={head}<ThisWeek",
                                  "format": book.rule(font_color=FAINT)})
    for rng, cell in ((grid, tl), ((C_FIRST, C_NOW, C_LAST, C_NOW), rc(C_FIRST, C_NOW))):
        ws.conditional_format(*rng, {"type": "formula", "criteria": f'={cell}="?"',
                                     "format": book.rule(font_color=AMBER, bold=True)})
        ws.conditional_format(*rng, {"type": "formula", "criteria": f"=AND(ISNUMBER({cell}),{cell}<0)",
                                     "format": book.rule(bg_color=RED_BG, font_color=RED, bold=True)})
    ws.freeze_panes(C_FIRST, C_GAP + 1, C_FIRST, C_WK + max(0, this_week_index() - 1))
    page_setup(ws, C_FIRST + team_n + 1, C_WK + PRINT_WEEKS - 1)
    protect(ws, password)


# ---------------------------------------------------------------- start here (status, checks, how to)
def check_rows():
    future = f"({C_WEEKS}>=ThisWeek)"
    bad = ["Incomplete", "Person~?", "Project~?", "Job~?", "Duplicate", "Bad goal"]
    bad_sum = "+".join(f'COUNTIF({A_STATUSES},"{s}")' for s in bad)
    # A blank status on a row can't be a problem; see the Check column on Assignments
    return [
        ("Fix", "A name is on the Team tab twice", f'=SUMPRODUCT(({T_NAMES}<>"")*(COUNTIF({T_NAMES},{T_NAMES})>1))',
         "Each person gets one row. Clear the extra one.", "Team!A1"),
        ("Fix", "Two people have the same initials", f'=SUMPRODUCT(({T_INITS}<>"")*(COUNTIF({T_INITS},{T_INITS})>1))',
         "Initials must point to one person, or finished pages land on the wrong name.", "Team!A1"),
        ("Fix", "A project is on the Projects tab twice", f'=SUMPRODUCT(({P_NAMES}<>"")*(COUNTIF({P_NAMES},{P_NAMES})>1))',
         "Each project gets one row. Clear the extra one.", "Projects!A1"),
        ("Fix", "Assignment rows with a problem", f"={bad_sum}",
         "Look for red in the Check column on Assignments. It names the problem on that row.", "Assignments!A1"),
        ("Fix", "The layout was changed",
         f'=ABS(COUNTIF(Assignments!$1:$1,"goal:*")-{N_WEEKS})+ABS(COUNTIF(Team!$1:$1,"hours:*")-{N_WEEKS})'
         f'+ABS(COUNTIF(Projects!$1:$1,"project.*")-7)',
         "Ask Eric before typing more. The dashboard will keep its last good numbers until this is fixed.", ""),
        ("Heads up", "Active people with no initials", f'=COUNTIFS({T_NAMES},"?*",{T_STATUSES},"Active",{T_INITS},"")',
         "Add them (tinted on Team), or their finished pages can't be credited to them.", "Team!A1"),
        ("Heads up", "Hours that are not numbers", f"=COUNTA({T_GRID})-COUNT({T_GRID})",
         "Something like TBD landed in the hours grid. Use a number or leave it blank.", "Team!A1"),
        ("Heads up", "People over their hours", f"=SUMPRODUCT({future}*({C_GRID}<0))",
         "Red on the Capacity tab. Move pages or add hours.", "Capacity!A1"),
        ("Heads up", "Goals with no hours entered", f'=SUMPRODUCT({future}*({C_GRID}="?"))',
         "Shown as ? on the Capacity tab. Enter their hours on the Team tab.", "Capacity!A1"),
        ("Heads up", "Assignment rows with no pace set", f'=COUNTIF({A_STATUSES},"No rate")',
         "That project has no minutes per page for that job, so hours can't be figured.", "Projects!A1"),
        ("Heads up", "More pages assigned than a project has", f'=COUNTIF({L_LEFTS},"<0")',
         "Shown as over in Still to assign, at the top of Assignments. Check the goals or the project's page total.",
         "Assignments!A1"),
        ("Heads up", "Active projects with no matrix link", f'=COUNTIFS({P_NAMES},"?*",{P_STATUSES},"Active",{P_LINKS},"")',
         "Until it has one, the dashboard shows 0 finished pages for that project.", "Projects!A1"),
        ("Heads up", "Active projects missing minutes per page",
         "=" + "+".join(
             f"SUMPRODUCT(--({P_STATUSES}=\"Active\"),"
             f"--ISNUMBER({p_col(P_JOB0 + 4 * j)}),"
             f"--({p_col(P_JOB0 + 4 * j)}>0),"
             f"--({p_col(P_JOB0 + 4 * j + 1)}=\"\"))"
             for j in range(len(JOBS))),
         "Add minutes per page so hours can be planned.", "Projects!A1"),
        ("Heads up", "Active projects past their client deadline",
         f'=SUMPRODUCT(({P_STATUSES}="Active")*ISNUMBER({P_CLIENTS})*({P_CLIENTS}<TODAY()))',
         "Update the deadline, or mark the project Completed.", "Projects!A1"),
        ("Heads up", "Assignment rows or weeks running out",
         f'=IF(COUNTIF({A_STATUSES},"?*")>{ASG_ROWS - 20},1,0)+IF(ThisWeek>Capacity!{rc(C_HEAD, C_END - 8, True, True)},1,0)',
         "Ask Eric to extend the workbook. Only a few rows or weeks are left.", ""),
    ]


def build_checks(book, ws):
    """Every check lives here, out of sight. Start Here lists only the ones with something to say."""
    ws.write_row(0, 0, ["severity", "check", "count", "result", "what to do", "target", "n"])
    checks = check_rows()
    for i, (sev, name, formula, todo, target) in enumerate(checks):
        r = i + 1
        ws.write(r, 0, sev)
        ws.write(r, 1, name)
        book.formula(ws, r, 2, formula)
        book.formula(ws, r, 3, f'=IF(C{r + 1}=0,"OK","{sev}")')
        ws.write(r, 4, todo)
        ws.write(r, 5, target)
        book.formula(ws, r, 6, f'=IF(D{r + 1}="OK","",MAX(G$1:G{r})+1)')
    last = len(checks) + 1
    book.wb.define_name("ErrCount", f'=COUNTIF(_checks!$D$2:$D${last},"Fix")')
    book.wb.define_name("WarnCount", f'=COUNTIF(_checks!$D$2:$D${last},"Heads up")')
    return len(checks)


def build_start(book, ws, n_checks, password):
    ws.hide_gridlines(2)
    ws.hide_row_col_headers()
    ws.set_default_row(20, hide_unused_rows=True)
    quiet(ws)
    ws.set_column(0, 0, 2)
    ws.set_column(1, 12, 11.5)
    ws.set_column(13, 16383, None, None, {"hidden": True})
    ws.set_row(R_KEYS, None, None, {"hidden": True})
    ws.set_row(R_BAND, 4, book.fmt(bg_color=BRAND))
    ws.set_row(R_TITLE, 42)
    ws.set_row(R_SUB, 18)
    ws.set_row(R_LINKS, 18)
    ws.write(R_TITLE, 1, "Migration Tracker", book.fmt(bold=True, font_size=24))
    ws.write(R_SUB, 1, "Who is doing what, week by week. This file feeds the Web Page Builds dashboard.", book.fmt(font_color=MUTED))
    status_chip(book, ws, 11, 12)

    section = book.fmt(bold=True, font_size=9, font_color=FAINT, bottom=1, bottom_color=LINE)

    def heading(row, text):
        for c in range(1, 13):
            ws.write_blank(row, c, None, section)
        ws.write(row, 1, text, section)

    # the three tabs people type in, in the order they use them
    r = 5
    gutter = {"right": 5, "right_color": "#FFFFFF"}
    title = book.fmt(bold=True, font_size=12, bg_color=SOFT, indent=1, valign="bottom", **gutter)
    body = book.fmt(font_color=MUTED, bg_color=SOFT, indent=1, text_wrap=True, valign="top", **gutter)
    cards = [
        ("1  Projects", "Projects!A1", "Pages and minutes per page for each client. New project: use the first open row."),
        ("2  Assignments", "Assignments!A1", "Page goals for each person, by week. Still to assign, at the top, counts down as "
                                             "you type. To remove a line, clear its person, project and job."),
        ("3  Team", "Team!A1", "People and their hours. New person: use the first open row, and they join the dropdown."),
    ]
    ws.set_row(r, 28)
    ws.set_row(r + 1, 50)
    ws.set_row(r + 2, 24)
    for i, (t, target, b) in enumerate(cards):
        c = 1 + i * 4
        c2 = c + 3
        ws.merge_range(r, c, r, c2, t, title)
        ws.merge_range(r + 1, c, r + 1, c2, b, body)
        ws.merge_range(r + 2, c, r + 2, c2, "", book.fmt(bg_color=SOFT, **gutter))
        ws.write_url(r + 2, c, f"internal:{target}",
                     book.fmt(font_color=BRAND, underline=1, font_size=9, bg_color=SOFT, indent=1, valign="top", **gutter),
                     f"Open {target.split('!')[0]}")
    ws.set_row(r + 3, 8)
    ws.write(r + 4, 1, "Need a new column or tab? Ask Eric first, because the dashboard has to learn it too.", book.fmt(font_color=MUTED, font_size=9))
    ws.set_row(r + 5, 22)

    # only what needs attention
    r = 11
    heading(r, "NEEDS ATTENTION")
    ws.set_row(r + 1, 8)
    first = r + 2
    ws.set_row(first, 26)
    fine = book.fmt(bold=True, font_color=GREEN, font_size=11)
    book.formula(ws, first, 1, '=IF(ErrCount>0,"Fix these first. The dashboard can\'t update until they are done.",'
                               'IF(WarnCount>0,"Worth a look. None of these stop the dashboard.",'
                               '"✓ Nothing. Everything looks good."))', fine)
    ws.conditional_format(first, 1, first, 1, {"type": "formula", "criteria": "=ErrCount>0", "format": book.rule(font_color=RED)})
    ws.conditional_format(first, 1, first, 1, {"type": "formula", "criteria": "=AND(ErrCount=0,WarnCount>0)",
                                               "format": book.rule(font_color=INK)})
    cn_d, cn_g = f"_checks!$D$2:$D${n_checks + 1}", f"_checks!$G$2:$G${n_checks + 1}"
    rng = lambda col: f"_checks!${col}$2:${col}${n_checks + 1}"
    # White edges keep neighboring chips apart
    chip = book.fmt(align="center", bold=True, font_size=9, top=5, bottom=5, top_color="#FFFFFF", bottom_color="#FFFFFF")
    text = book.fmt(font_size=10, valign="vcenter", indent=1)
    wrap = book.fmt(font_color=MUTED, font_size=9, text_wrap=True, valign="vcenter")
    go = book.fmt(font_color=BRAND, underline=1, font_size=9, align="center")
    for k in range(1, n_checks + 1):
        row = first + k
        ws.set_row(row, 26)
        hit = f"MATCH({k},{cn_g},0)"
        book.formula(ws, row, 1, f'=IFERROR(INDEX({rng("D")},{hit}),"")', chip)
        ws.merge_range(row, 2, row, 5, "", text)
        book.formula(ws, row, 2, f'=IFERROR(INDEX({rng("B")},{hit})&" ("&INDEX({rng("C")},{hit})&")","")', text)
        ws.merge_range(row, 6, row, 11, "", wrap)
        book.formula(ws, row, 6, f'=IFERROR(INDEX({rng("E")},{hit}),"")', wrap)
        book.formula(ws, row, 12, f'=IFERROR(IF(INDEX({rng("F")},{hit})="","",HYPERLINK("#"&INDEX({rng("F")},{hit}),"Open")),"")', go)
    res = rc(first + 1, 1, False, True)
    ws.conditional_format(first + 1, 1, first + n_checks, 1, {"type": "formula", "criteria": f'={res}="Fix"',
                                                              "format": book.rule(bg_color=RED, font_color="#FFFFFF")})
    ws.conditional_format(first + 1, 1, first + n_checks, 1, {"type": "formula", "criteria": f'={res}="Heads up"',
                                                              "format": book.rule(bg_color=AMBER_BG, font_color=AMBER)})
    page_setup(ws, first + n_checks, 12)
    protect(ws, password)


def lock_structure(path, password):
    """xlsxwriter cannot lock tabs, so add the workbook protection element itself."""
    attrs = 'lockStructure="1"'
    if password:
        h = 0
        for ch in reversed(password):
            h = ((h >> 14) & 1) | ((h << 1) & 0x7FFF)
            h ^= ord(ch)
        h = ((h >> 14) & 1) | ((h << 1) & 0x7FFF)
        h ^= len(password) ^ 0xCE4B
        attrs = f'workbookPassword="{h:04X}" ' + attrs
    tmp = path + ".tmp"
    with zipfile.ZipFile(path) as src, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if item.filename == "xl/workbook.xml":
                text = data.decode("utf-8")
                marker = "<bookViews>"
                assert marker in text
                data = text.replace(marker, f"<workbookProtection {attrs}/>{marker}", 1).encode("utf-8")
            dst.writestr(item, data)
    shutil.move(tmp, path)


def build(old_path, out_path, values, links, password):
    team, projects, rows = load_old_tracker(old_path)
    book = Book(out_path, values)
    wb = book.wb
    wb.set_properties({"title": "Migration Tracker", "author": "Stamats", "company": "Stamats",
                       "comments": f"{FORMAT_NAME} v{FORMAT_VERSION}. Layout is read by ai.stamats.com/migration."})
    wb.set_calc_mode("auto")
    start = wb.add_worksheet("Start Here")
    pr = wb.add_worksheet("Projects")
    asg = wb.add_worksheet("Assignments")
    tm = wb.add_worksheet("Team")
    cap_view = wb.add_worksheet("Capacity")
    calc = wb.add_worksheet("_calc")
    cap = wb.add_worksheet("_cap")
    lists = wb.add_worksheet("_lists")
    checks = wb.add_worksheet("_checks")
    contract = wb.add_worksheet("_contract")

    build_lists(book, lists)
    n_checks = build_checks(book, checks)
    build_start(book, start, n_checks, password)
    team_keys = build_team(book, tm, team, password)
    project_keys = build_projects(book, pr, projects, links, password)
    asg_keys = build_assignments(book, asg, rows, password)
    build_calc(book, calc)
    build_cap(book, cap)
    build_capacity(book, cap_view, len(team), password)
    build_contract(book, contract, team_keys, project_keys, asg_keys)

    for ws in (calc, cap, lists, checks, contract):
        ws.protect(password)
        ws.very_hidden()
    start.activate()
    wb.close()
    lock_structure(out_path, password)
    return team, projects, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="old", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--values")
    ap.add_argument("--matrix-link", action="append", default=[], help="Project=URL. Never logged.")
    a = ap.parse_args()
    values = json.load(open(a.values)) if a.values else {}
    links = dict(x.split("=", 1) for x in a.matrix_link)
    team, projects, rows = build(a.old, a.out, values, links, os.environ.get("TRACKER_PASSWORD", ""))
    print(f"built {a.out}: {len(team)} people, {len(projects)} projects, {len(rows)} assignment rows, "
          f"{N_WEEKS} weeks, cached values: {len(values)}")


if __name__ == "__main__":
    main()
