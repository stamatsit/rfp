#!/usr/bin/env python3
"""present.html — multi-client Migration Matrix.
Overview (all active projects: portfolio cards + total team capacity) →
per-client drill-down pages → per-person pages. Archive state lives in
archived.json (toggled from the UI via chat_server)."""

import datetime
import json
import os
import sqlite3
from collections import Counter

import build_master as bm

HERE = os.path.dirname(os.path.abspath(__file__))
ARCHIVE_FILE = os.path.join(HERE, "archived.json")


def wk_lbl(w):
    return w[5:7].lstrip("0") + "/" + w[8:10].lstrip("0")


def load_archived():
    try:
        return set(json.load(open(ARCHIVE_FILE)))
    except Exception:
        return set()


def main():
    db = sqlite3.connect(os.path.join(HERE, "master.db"))
    db.row_factory = sqlite3.Row
    projects = {r["name"]: dict(r) for r in db.execute(
        "SELECT * FROM projects WHERE total_pages > 0")}
    db.row_factory = None
    archived = load_archived()
    rollup = bm.project_rollup(db)
    wk_hrs = bm.typical_weekly_hours(db)
    all_proj_dicts = [dict(zip([c[0] for c in
                                db.execute("SELECT * FROM projects").description], r))
                      for r in db.execute("SELECT * FROM projects")]
    fc = {d["name"]: d for d in bm.forecast(
        bm.project_demand(db, all_proj_dicts), wk_hrs)}
    eff = bm.effective_week_rows(db)
    cap = {(p, w): h for p, w, h in db.execute("SELECT * FROM capacity")}
    people_roles = dict(db.execute("SELECT name, role FROM people"))

    # person-week load + idle pool (for moves)
    week_load = {}
    for r in eff:
        week_load[(r["person"], r["week"])] = \
            week_load.get((r["person"], r["week"]), 0) + r["hours"]
    idle = sorted(((p, round(cap.get((p, bm.CUR_WEEK), 0)
                             - week_load.get((p, bm.CUR_WEEK), 0), 1))
                   for p in people_roles
                   if cap.get((p, bm.CUR_WEEK), 0)
                   - week_load.get((p, bm.CUR_WEEK), 0) > 2),
                  key=lambda t: -t[1])

    # matrices: attach each to its linked project
    import client_matrix as cm
    matrix_by_project = {}
    for (mname,) in db.execute("SELECT DISTINCT matrix FROM client_pages"):
        q = lambda sql, *a: db.execute(sql, a).fetchall()
        mtotal = q("SELECT COUNT(*) FROM client_pages WHERE matrix=?", mname)[0][0]
        funnel = []
        for lab, col in (("Draft delivered", "draft_delivered"),
                         ("Writing review done", "writing_done"),
                         ("Migrated", "migrated"), ("QA passed", "qa_done"),
                         ("Delivered to client", "delivered"),
                         ("Client final review", "client_final")):
            funnel.append([lab, q(f"SELECT SUM({col}) FROM client_pages "
                                  "WHERE matrix=?", mname)[0][0] or 0])
        cycles = sorted(r[0] for r in q(
            "SELECT CAST(julianday(delivered_date)-julianday(draft_date) AS INT) "
            "FROM client_pages WHERE matrix=? AND draft_date AND delivered_date",
            mname))
        rework = q("SELECT SUM(rework) FROM client_pages WHERE matrix=?",
                   mname)[0][0] or 0
        wk_del = Counter()
        for (d,) in q("SELECT delivered_date FROM client_pages WHERE matrix=? "
                      "AND delivered_date", mname):
            dt = datetime.date.fromisoformat(d)
            monday = dt - datetime.timedelta(days=dt.weekday())
            wk_del[monday.isoformat()] += 1
        migr = q("SELECT migrator, COUNT(*), SUM(rework) FROM client_pages "
                 "WHERE matrix=? AND migrator IS NOT NULL GROUP BY migrator "
                 "ORDER BY COUNT(*) DESC", mname)
        mx = {"name": mname, "total": mtotal, "funnel": funnel,
              "delivered": funnel[4][1],
              "migrated": funnel[2][1],
              "cycle_med": cycles[len(cycles) // 2] if cycles else None,
              "cycle_min": cycles[0] if cycles else None,
              "cycle_max": cycles[-1] if cycles else None,
              "rework": rework,
              "rework_pct": round(100 * rework / mtotal) if mtotal else 0,
              "weekly_deliveries": [[wk_lbl(w), n]
                                    for w, n in sorted(wk_del.items())],
              "migrators": [[m, n, rw or 0] for m, n, rw in migr]}
        link = cm.link_to_project(db, {"name": mname})
        if link and link.get("project"):
            matrix_by_project[link["project"]] = mx

    def build_client(name):
        pr = projects[name]
        total = pr["total_pages"]
        mig = rollup.get((name, "Migration"), {})
        mx0 = matrix_by_project.get(name)
        # Crystal's rule: completed pages come from the CLIENT MATRIX, never
        # hand-entered in the tracker. Tracker keeps assignments/hours.
        done = round(mx0["migrated"]) if mx0 else round(mig.get("main_done", 0))
        remaining = max(round(total - mig.get("main_pages", 0)), 0)  # over-assigned => 0
        f = fc.get(name, {})
        days = (datetime.date.fromisoformat(pr["client_deadline"])
                - bm.TODAY).days if pr["client_deadline"] else None
        status_l = (pr["status"] or "").lower()
        if remaining <= 0:
            verdict, tone = "fully assigned", "ok"
        elif status_l.startswith("blocked") or "waiting" in status_l:
            verdict, tone = (pr["status"] or "blocked").lower(), "warn"
        elif days is not None and days < 0:
            verdict, tone = (f"{-days} day{'s' if days != -1 else ''} overdue"
                             + (", not started"
                                if (pr["status"] or "") == "Not Started" else "")), "crit"
        elif f.get("slip") is not None and f["slip"] > 0:
            verdict, tone = (f"misses {pr['client_deadline'][5:].replace('-', '/')} "
                             f"by {f['slip']} days"), "crit"
        elif not f.get("estimated", True):
            verdict, tone = "no rates set", "warn"
        else:
            verdict, tone = "on track", "ok"
        series, grid, crew_now = {w: [0, 0] for w in bm.WEEKS}, {}, {}
        for r in eff:
            if r["project"] != name:
                continue
            if r["week"] in series:
                series[r["week"]][0] += r["pages"]
                series[r["week"]][1] += r["completed"]
            g = grid.setdefault(r["person"], {})
            c = g.setdefault(r["week"], [0, 0, 0])
            c[0] += r["pages"]; c[1] += r["hours"]; c[2] += r["completed"]
            if r["week"] == bm.CUR_WEEK and r["hours"]:
                crew_now[r["person"]] = crew_now.get(r["person"], 0) + r["hours"]
        active_weeks = sorted(w for w, v in series.items() if v[0] or v[1])
        show_weeks = active_weeks or [bm.CUR_WEEK]
        hours_logged = sum(c[1] for g in grid.values() for c in g.values())
        t_done = round(mig.get("main_done", 0))  # tracker-logged completions
        actual_rate = round(t_done / hours_logged, 2) if hours_logged > 2             and t_done else None
        actual_pace = round(t_done / len(active_weeks)) if active_weeks else 0
        required = (round(remaining / max(days / 7, 0.5))
                    if days is not None and days > 0 and remaining > 0 else None)
        crew = [{"name": p, "hours": round(h, 1)}
                for p, h in sorted(crew_now.items(), key=lambda t: -t[1])]
        detail_rows = [{"name": p, "cells": [
            [round(g[w][0]), round(g[w][1], 1), round(g[w][2])]
            if w in g else None for w in show_weeks]}
            for p, g in sorted(grid.items(),
                               key=lambda t: -sum(c[1] for c in t[1].values()))]
        moves = []
        if remaining > 0:
            if required and actual_pace < required:
                gap = required - actual_pace
                moves.append(f"Pace gap: doing {actual_pace}/wk, need "
                             f"{required}/wk, about "
                             f"{gap / max(actual_rate or 2, 1):.0f} more hrs/wk"
                             + (f" ({idle[0][0]} has {idle[0][1]:g}h free)."
                                if idle else "."))
            if not crew:
                hl = f.get("hours", 0)
                if hl and hl <= 20 and idle:
                    moves.append(f"Only ≈{hl:g} hrs of work: {idle[0][0]} "
                                 f"({idle[0][1]:g}h free) could clear it alone.")
                else:
                    moves.append("Nobody is on this project this week: it "
                                 "moves zero pages until someone is assigned.")
            qa_backlog = remaining - rollup.get((name, "QA"), {}).get("main_pages", 0)
            qa_idle = [(p, h) for p, h in idle
                       if "q/a" in (people_roles.get(p) or "").lower()]
            if qa_backlog > 100 and qa_idle:
                moves.append(f"{qa_backlog:,.0f} pages of QA backlog: "
                             + ", ".join(f"{p} ({h:g}h free)"
                                         for p, h in qa_idle[:2])
                             + " could take it this week.")
            over_now = [p for p in crew_now
                        if cap.get((p, bm.CUR_WEEK), 0)
                        and week_load.get((p, bm.CUR_WEEK), 0)
                        > cap.get((p, bm.CUR_WEEK), 0) + 0.1]
            if over_now and idle:
                moves.append(f"{over_now[0]} is over capacity this week: "
                             f"rebalance toward {idle[0][0]} "
                             f"({idle[0][1]:g}h free).")
        return {
            "name": name, "type": pr["page_type"], "total": total,
            "done": done, "remaining": remaining,
            "pct": round(100 * done / total) if total else 0,
            "deadline": pr["client_deadline"], "projected": f.get("finish"),
            "hours_left": round(f.get("hours", 0)), "verdict": verdict,
            "tone": tone, "status": pr["status"], "crew": crew,
            "moves": moves[:3], "archived": name in archived,
            "series": [[wk_lbl(w), series[w][0], series[w][1]]
                       for w in show_weeks],
            "actual_pace": actual_pace, "required_pace": required,
            "days_left": days, "plan_rate": pr["mig_rate"],
            "actual_rate": actual_rate,
            "qa_remaining": round(max(remaining - rollup.get(
                (name, "QA"), {}).get("main_pages", 0), 0)),
            "detail": {"weeks": [wk_lbl(w) for w in show_weeks],
                       "rows": detail_rows},
            "done_source": "client matrix" if mx0 else "tracker",
            "matrix": matrix_by_project.get(name),
            "list": pr.get("list") or "active",
        }

    clients = [build_client(n) for n in projects]
    for c in clients:
        if c["list"] == "completed":
            c["archived"] = True
    clients.sort(key=lambda c: (c["archived"], -(c["tone"] == "crit"),
                                -c["remaining"]))

    # overview capacity: active projects only
    active_names = {c["name"] for c in clients if not c["archived"]}
    ov_load = {}
    for r in eff:
        if r["week"] == bm.CUR_WEEK and r["project"] in active_names:
            ov_load[r["person"]] = ov_load.get(r["person"], 0) + r["hours"]
    ov_avail = sum(cap.get((p, bm.CUR_WEEK), 0) for p in people_roles)
    ov_assigned = round(sum(ov_load.values()), 1)
    over = sorted([p for p in people_roles
                   if (cap.get((p, bm.CUR_WEEK), 0) or ov_load.get(p, 0))
                   and ov_load.get(p, 0) > cap.get((p, bm.CUR_WEEK), 0) + 0.1])

    # team table (unchanged from before)
    totals, breakdown, pweek = {}, {}, {}
    for r in eff:
        t = totals.setdefault(r["person"], [0, 0, 0])
        t[0] += r["hours"]; t[1] += r["pages"]; t[2] += r["completed"]
        b = breakdown.setdefault(r["person"], {})
        pb = b.setdefault(r["project"], [0, 0, 0])
        pb[0] += r["hours"]; pb[1] += r["pages"]; pb[2] += r["completed"]
        wv = pweek.setdefault((r["person"], r["week"]), [0, 0])
        wv[0] += r["hours"]; wv[1] += r["completed"]
    team = []
    for p, (h, a, c) in sorted(totals.items(), key=lambda t: -t[1][2]):
        weeks_p = sorted(w for (pp, w) in pweek
                         if pp == p and any(pweek[(pp, w)]))
        team.append({
            "name": p, "role": people_roles.get(p) or "n/a",
            "hours": round(h, 1), "assigned": round(a), "done": round(c),
            "comp": round(100 * c / a) if a else 0,
            "vel": round(c / h, 2) if h > 2 else None,
            "avail": cap.get((p, bm.CUR_WEEK), 0),
            "wk_hours": round(pweek.get((p, bm.CUR_WEEK), [0, 0])[0], 1),
            "weekly": [[wk_lbl(w), round(pweek[(p, w)][0], 1),
                        round(pweek[(p, w)][1])] for w in weeks_p],
            "projects": [[proj, round(v[0], 1), round(v[1]), round(v[2])]
                         for proj, v in sorted(breakdown.get(p, {}).items(),
                                               key=lambda t: -t[1][0])
                         if v[0] or v[1] or v[2]][:8]})

    changes = []
    cpath = os.path.join(HERE, "last_changes.json")
    if os.path.exists(cpath):
        try:
            changes = json.load(open(cpath))
        except Exception:
            pass

    data = {"changes": changes, "generated": bm.TODAY.isoformat(),
            "week": bm.CUR_WEEK, "week_lbl": wk_lbl(bm.CUR_WEEK),
            "wk_hrs": wk_hrs, "logo": "assets/stamats-logo.svg",
            "clients": clients, "team": team,
            "overview": {"avail": round(ov_avail, 1),
                         "assigned": ov_assigned, "over": over,
                         "active": len(active_names),
                         "archived": len(clients) - len(active_names)}}
    tpl = open(os.path.join(HERE, "present_template.html")).read()
    with open(os.path.join(HERE, "present.html"), "w") as fh:
        fh.write(tpl.replace("__DATA__", json.dumps(data)))
    linked = sum(1 for c in clients if c["matrix"])
    print(f"wrote present.html ({len(clients)} clients, {linked} with "
          f"matrices, {len(archived)} archived)")


if __name__ == "__main__":
    main()
