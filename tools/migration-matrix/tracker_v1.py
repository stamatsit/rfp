"""Reader for the Migration Tracker workbook made by build_tracker_workbook.py.

Columns are found by the hidden keys in row 1, never by position or label, so a
renamed header cannot shift the numbers. Only typed values are read; hours and
rates are worked out here, then compared to the totals the workbook calculated
for itself. Anything that does not add up stops the run with a plain message:
cloud_sync reports it as "sync failed" and the dashboard keeps its last good
snapshot. Silently showing wrong numbers is the one outcome this must not allow.
"""
import datetime
import json

FORMAT_NAME = "stamats-migration-tracker"
SUPPORTED_VERSIONS = (1,)
CONTRACT_SHEET = "_contract"

JOB_KEY = {"As Is Page Building": "as_is", "Optimize Page Building": "optimize", "QA": "qa",
           "Publish": "publish", "Firefighting": "firefighting"}
# The pipeline's name for each job's page type (see build_master.PAGE_TYPES)
PAGE_TYPE = {"as_is": "as is", "optimize": "optimize", "qa": "qa", "publish": "publish",
             "firefighting": "firefighting"}
REQUIRED_KEYS = {
    "Team": ("team.name", "team.initials", "team.role", "team.status", "team.usual_hours",
             "team.time_off", "team.notes"),
    "Assignments": ("asg.person", "asg.project", "asg.job"),
    "Projects": ("project.name", "project.status", "project.start", "project.migration_deadline",
                 "project.client_deadline", "project.notes") +
                tuple(f"{k}.{f}" for k in JOB_KEY.values() for f in ("minutes",)) +
                tuple(f"{k}.pages" for k in JOB_KEY.values() if k != "qa"),
}
TOTAL_TOLERANCE = 0.01
HISTORY_WEEKS = 3


def refuse(reason):
    raise SystemExit(f"Migration Tracker needs attention: {reason} The dashboard keeps its last good numbers.")


def is_workbook(wb):
    return CONTRACT_SHEET in wb.sheetnames


def _text(v):
    s = "" if v is None else str(v).strip()
    return s or None


def _number(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _iso(v):
    if isinstance(v, datetime.datetime):
        return v.date().isoformat()
    if isinstance(v, datetime.date):
        return v.isoformat()
    return None


def contract(wb):
    ws = wb[CONTRACT_SHEET]
    return {ws.cell(r, 1).value: ws.cell(r, 2).value for r in range(1, ws.max_row + 1) if ws.cell(r, 1).value}


def _keys(wb, sheet):
    if sheet not in wb.sheetnames:
        refuse(f"the {sheet} tab is missing.")
    ws = wb[sheet]
    return ws, {ws.cell(1, c).value: c for c in range(1, ws.max_column + 1) if ws.cell(1, c).value}


def _whole(con, key):
    v = con.get(key)
    if not isinstance(v, (int, float)):
        refuse(f"the workbook's stored result for {key} is missing, so it can't be checked.")
    return int(v)


def _week_keys(keys, prefix):
    out = {}
    for k, c in keys.items():
        if isinstance(k, str) and k.startswith(prefix):
            out[k[len(prefix):]] = c
    return out


def weeks_in_use(wb, today=None):
    """Monday dates the dashboard should chart: from the first week through the
    last one with goals or typed hours, and at least 8 weeks past today, so a
    workbook that runs through 2027 does not stretch every chart."""
    today = today or datetime.date.today()
    _, tk = _keys(wb, "Team")
    ws_t = wb["Team"]
    ws_a, ak = _keys(wb, "Assignments")
    con = contract(wb)
    hours = _week_keys(tk, "hours:")
    goals = _week_keys(ak, "goal:")
    weeks = sorted(set(hours) | set(goals))
    if not weeks:
        return []
    last = (today - datetime.timedelta(days=today.weekday()) + datetime.timedelta(weeks=8)).isoformat()
    for week in reversed(weeks):
        if week <= last:
            break
        c_h, c_g = hours.get(week), goals.get(week)
        if (c_h and any(_number(ws_t.cell(r, c_h).value) is not None
                        for r in range(_whole(con, "team_first_row"), _whole(con, "team_last_row") + 1))) or \
           (c_g and any(_number(ws_a.cell(r, c_g).value) is not None
                        for r in range(_whole(con, "assignment_first_row"), _whole(con, "assignment_last_row") + 1))):
            last = week
            break
    # Pages can be finished before the first planned week (Washtenaw's first
    # were the week of 9/21). Those weeks must stay on the charts, or they drop
    # out and pace gets divided by too few weeks.
    first = datetime.date.fromisoformat(weeks[0])
    history = [(first - datetime.timedelta(weeks=i)).isoformat() for i in range(HISTORY_WEEKS, 0, -1)]
    return history + [w for w in weeks if w <= last]


def matrix_links(wb):
    """[(project, link)] from the Projects tab, so a new client connects by
    pasting its link rather than by a code or settings change."""
    con = contract(wb)
    ws, keys = _keys(wb, "Projects")
    if "project.matrix_link" not in keys:
        refuse("the layout of the Projects tab changed (missing project.matrix_link).")
    out = []
    for r in range(_whole(con, "project_first_row"), _whole(con, "project_last_row") + 1):
        name = _text(ws.cell(r, keys["project.name"]).value)
        link = _text(ws.cell(r, keys["project.matrix_link"]).value)
        if name and link:
            out.append((name, link))
    return out


def read(wb, normalize_role, build_roles):
    """Everything build_db needs: {people, capacity, projects, assigns, orphans,
    initials}, in the same shapes the older tracker parsers return."""
    con = contract(wb)
    if con.get("format") != FORMAT_NAME:
        refuse("this file is not a Migration Tracker.")
    if con.get("version") not in SUPPORTED_VERSIONS:
        refuse(f"it is format version {con.get('version')}, which this dashboard does not know yet.")

    ws_t, tk = _keys(wb, "Team")
    ws_p, pk = _keys(wb, "Projects")
    ws_a, ak = _keys(wb, "Assignments")
    for sheet, keys in (("Team", tk), ("Projects", pk), ("Assignments", ak)):
        missing = [k for k in REQUIRED_KEYS[sheet] if k not in keys]
        if missing:
            refuse(f"the layout of the {sheet} tab changed (missing {', '.join(missing[:3])}).")
    hour_cols, goal_cols = _week_keys(tk, "hours:"), _week_keys(ak, "goal:")
    weeks_expected = _whole(con, "week_count")
    if len(hour_cols) != weeks_expected or len(goal_cols) != weeks_expected:
        refuse(f"week columns are missing: expected {weeks_expected}, found {len(goal_cols)} on Assignments "
               f"and {len(hour_cols)} on Team.")

    errors = _whole(con, "errors")
    if errors:
        refuse(f"it has {errors} item{'s' if errors != 1 else ''} to fix, listed on its Start Here tab.")

    # team
    people, capacity, initials, names = [], [], {}, []
    for r in range(_whole(con, "team_first_row"), _whole(con, "team_last_row") + 1):
        name = _text(ws_t.cell(r, tk["team.name"]).value)
        if not name:
            continue
        names.append(name)
        people.append({"name": name, "role": _text(ws_t.cell(r, tk["team.role"]).value),
                       "notes": _text(ws_t.cell(r, tk["team.notes"]).value),
                       "planned_time_off": _text(ws_t.cell(r, tk["team.time_off"]).value)})
        ini = _text(ws_t.cell(r, tk["team.initials"]).value)
        if ini:
            initials[ini.upper()] = name
        usual = _number(ws_t.cell(r, tk["team.usual_hours"]).value)
        for week, c in sorted(hour_cols.items()):
            typed = _number(ws_t.cell(r, c).value)
            hours = typed if typed is not None else usual
            if hours is not None:
                capacity.append({"person": name, "week": week, "hours": hours})

    # projects
    build_roles.update(t for t in PAGE_TYPE.values() if t != "qa")
    projects, rates = [], {}
    for r in range(_whole(con, "project_first_row"), _whole(con, "project_last_row") + 1):
        name = _text(ws_p.cell(r, pk["project.name"]).value)
        if not name:
            continue
        status = _text(ws_p.cell(r, pk["project.status"]).value)
        s = (status or "").lower()
        row = {"row": r, "name": name, "status": s or None, "priority": None,
               "start_date": _iso(ws_p.cell(r, pk["project.start"]).value),
               "mig_deadline": _iso(ws_p.cell(r, pk["project.migration_deadline"]).value),
               "client_deadline": _iso(ws_p.cell(r, pk["project.client_deadline"]).value),
               "notes": _text(ws_p.cell(r, pk["project.notes"]).value),
               "list": "planned" if s == "planned" else "completed" if s == "completed" else "active"}
        typed_pages = {k: _number(ws_p.cell(r, pk[f"{k}.pages"]).value) for k in JOB_KEY.values() if k != "qa"}
        typed_pages["qa"] = (typed_pages["as_is"] or 0) + (typed_pages["optimize"] or 0) or None
        detail, pages, hours = {}, 0.0, 0.0
        for key, page_type in PAGE_TYPE.items():
            n = typed_pages[key]
            mins = _number(ws_p.cell(r, pk[f"{key}.minutes"]).value)
            rate = 60.0 / mins if mins else None
            rates[(name, key)] = rate
            hrs = n / rate if n and rate else None
            if not (n or mins):
                continue
            detail[page_type] = {"pages": n or 0, "min_per_page": mins, "rate": rate,
                                 "hours": round(hrs, 2) if hrs is not None else None}
            if key != "qa":
                pages += n or 0
                hours += hrs or 0
        qa = detail.get("qa", {})
        row.update({
            "page_type": ", ".join(f"{t.upper()} {d['pages']:g}" for t, d in detail.items()
                                   if t != "qa" and d["pages"]) or None,
            "complexity": None,
            "total_pages": pages if detail else None,
            "mig_hours_needed": hours if detail else None,
            "mig_rate": pages / hours if pages and hours else None,
            "mig_min_per_page": round(60.0 * hours / pages, 1) if pages and hours else None,
            "mig_pages_assigned_shown": None, "mig_pages_remaining_shown": None,
            "qa_pages": qa.get("pages"),
            "qa_min_per_page": qa.get("min_per_page"), "qa_rate": qa.get("rate"),
            "qa_hours_needed": qa.get("hours"),
            "qa_pages_assigned_shown": None, "qa_pages_remaining_shown": None,
            "page_types": json.dumps(detail) if detail else None,
        })
        projects.append(row)

    # assignments
    assigns, orphans, goals_total, hours_total = [], [], 0.0, 0.0
    for r in range(_whole(con, "assignment_first_row"), _whole(con, "assignment_last_row") + 1):
        person = _text(ws_a.cell(r, ak["asg.person"]).value)
        project = _text(ws_a.cell(r, ak["asg.project"]).value)
        job = _text(ws_a.cell(r, ak["asg.job"]).value)
        if not (person or project or job):
            continue  # empty, or cleared: the workbook ignores any goals left on a line with none of the three
        rate = rates.get((project, JOB_KEY.get(job)))
        cells = []
        for week, c in sorted(goal_cols.items()):
            raw = ws_a.cell(r, c).value
            if raw in (None, ""):
                continue
            goal = _number(raw)
            if goal is None:
                refuse(f"{person or 'someone'} on {project or 'a project'} has a page goal that is not a number.")
            hrs = goal / rate if rate else None
            goals_total += goal
            hours_total += hrs or 0
            cells.append({"week": week, "pages_assigned": goal, "hours": hrs, "hours_effective": hrs,
                          "pages_completed": None})
        row = {"source": "Assignments", "src_row": r, "person": person, "project": project,
               "role": normalize_role(job), "role_raw": job, "rate": rate, "weeks": cells}
        (assigns if person and project else orphans).append(row)

    # The workbook's own totals must match what was just read
    checks = (("page goals", goals_total, con.get("goals_total")),
              ("hours", hours_total, con.get("hours_assigned_total")),
              ("assignment rows", len(assigns) + len(orphans), con.get("assignment_rows")),
              ("team members", len(names), con.get("team_count")),
              ("projects", len(projects), con.get("project_count")))
    for label, mine, theirs in checks:
        if not isinstance(theirs, (int, float)) or abs(mine - theirs) > TOTAL_TOLERANCE:
            refuse(f"its {label} do not add up (read {mine:g}, the workbook says {theirs}).")

    return {"people": people, "capacity": capacity, "projects": projects, "assigns": assigns,
            "orphans": orphans, "initials": initials}
