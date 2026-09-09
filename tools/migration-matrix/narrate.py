#!/usr/bin/env python3
"""AI Briefing — turns the master database into an executive narrative.

With Anthropic credentials available (ANTHROPIC_API_KEY, or an `ant auth
login` profile) and the `anthropic` package installed, this regenerates
ai-briefing.md live via the Claude API. Without them it leaves the cached
Claude-written briefing in place — the pipeline never breaks.

This is the concrete shape of Phases 2–3's "AI reports": facts come from
the database (never invented), Claude writes the narrative on top.
"""

import json
import os
import sqlite3
import sys

import build_master as bm

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ai-briefing.md")


def gather_facts(db):
    projects = [dict(zip([c[0] for c in db.execute("SELECT * FROM projects").description], r))
                for r in db.execute("SELECT * FROM projects")]
    wk_hrs = bm.typical_weekly_hours(db)
    fc = bm.forecast(bm.project_demand(db, projects), wk_hrs)
    findings = bm.validate(db, projects)
    eff = bm.person_week_hours_effective(db)
    cap = {(p, w): h for p, w, h in db.execute("SELECT * FROM capacity")}
    people = [r[0] for r in db.execute("SELECT name FROM people")]
    return {
        "as_of": bm.TODAY.isoformat(),
        "current_week": bm.CUR_WEEK,
        "typical_team_hours_per_week": wk_hrs,
        "queue_hours_total": round(sum(d["hours"] for d in fc)),
        "forecast": [{k: d[k] for k in
                      ("name", "deadline", "hours", "finish", "slip",
                       "pages_remaining", "status")} for d in fc],
        "capacity_this_week": [
            {"person": p, "available": cap.get((p, bm.CUR_WEEK), 0),
             "assigned": round(eff.get((p, bm.CUR_WEEK), 0), 1)}
            for p in people
            if cap.get((p, bm.CUR_WEEK), 0) or eff.get((p, bm.CUR_WEEK), 0)],
        "high_findings": [f["detail"] for f in findings
                          if f["severity"] == "HIGH"],
        "weeks_with_no_roster_hours": sorted(
            {w for w in bm.WEEKS if w > bm.CUR_WEEK}
            - {w for (p, w), h in cap.items() if h}),
    }


SYSTEM = """You are the operations chief of staff for a content-migration
team. You receive a JSON fact sheet computed from the team's master
database. Write a morning executive briefing in Markdown: a short bold
headline line, then 4-6 tight paragraphs or bullets covering (1) the
overall workload vs capacity picture, (2) deadline risk with specific
dates and slip numbers, (3) who is over/under capacity and one concrete
reallocation move, (4) the single fastest win available, and (5) what
decision leadership must make this week. Use only numbers present in the
facts — never invent any. Be direct and specific; no filler, no preamble,
under 250 words."""


def generate_live(facts):
    import anthropic
    client = anthropic.Anthropic()
    resp = client.beta.messages.create(
        model="claude-opus-5",
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM,
        messages=[{"role": "user", "content": json.dumps(facts)}],
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError("model declined the request")
    return "".join(b.text for b in resp.content if b.type == "text")


def main():
    db = sqlite3.connect(os.path.join(HERE, "master.db"))
    facts = gather_facts(db)
    if "--print-facts" in sys.argv:
        print(json.dumps(facts, indent=2))
        return
    try:
        import anthropic  # noqa: F401
        have_sdk = True
    except ImportError:
        have_sdk = False
    if have_sdk and (os.environ.get("ANTHROPIC_API_KEY")
                     or os.environ.get("ANTHROPIC_AUTH_TOKEN")
                     or os.path.exists(os.path.expanduser(
                         "~/.config/anthropic"))):
        try:
            text = generate_live(facts)
            with open(OUT, "w") as fh:
                fh.write(text.strip() + "\n\n*Generated live by Claude from "
                         f"master.db, {facts['as_of']}.*\n")
            print(f"wrote {OUT} (live Claude generation)")
            return
        except Exception as e:  # keep the demo unbreakable
            print(f"live generation unavailable ({e}); keeping cached briefing")
    else:
        print("no Anthropic credentials/SDK — keeping cached Claude briefing "
              "(install `anthropic` + `ant auth login` to go live)")
    if not os.path.exists(OUT):
        print("warning: no cached briefing present either")


if __name__ == "__main__":
    main()
