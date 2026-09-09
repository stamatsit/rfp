#!/usr/bin/env python3
"""Local AI chat backend for present.html — port 8477.

The OpenAI key is read from ~/.migration-matrix-openai-key (one line) or
the OPENAI_API_KEY env var. It never touches the HTML or this folder, so
sharing the dashboard files can never leak it.

Every answer is grounded: the system prompt carries a fact sheet computed
fresh from master.db (same facts engine as the AI briefing), and the model
is instructed to answer only from it.
"""

import json
import os
import sqlite3
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

import build_master as bm
import narrate

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8477
KEY_FILE = os.path.expanduser("~/.migration-matrix-openai-key")
MODELS = ["gpt-4.1-mini", "gpt-4o-mini", "gpt-5-mini", "gpt-4o"]

SYSTEM = """You are the Migration Matrix assistant for Stamats' content
migration team. Answer questions about projects, people, capacity,
deadlines, and forecasts USING ONLY the fact sheet below — every number
you state must appear in or be directly computed from it. If the facts
don't cover a question, say so plainly and suggest where to look (the
dashboard, the tracker, or Crystal). Be concise: 1-3 short sentences or a
tight list. Plain text only, no markdown headers.

FACT SHEET (computed fresh from the master database):
"""


def get_key():
    k = os.environ.get("OPENAI_API_KEY", "").strip()
    if k:
        return k
    if os.path.exists(KEY_FILE):
        return open(KEY_FILE).read().strip()
    return None


def facts_blob():
    db = sqlite3.connect(os.path.join(HERE, "master.db"))
    facts = narrate.gather_facts(db)
    # enrich: per-project crew this week + client matrix
    crew = {}
    for r in bm.effective_week_rows(db):
        if r["week"] == bm.CUR_WEEK and r["hours"]:
            crew.setdefault(r["project"], []).append(
                f"{r['person']} {r['hours']:.1f}h")
    facts["crew_this_week"] = crew
    # per-person performance (all weeks, all projects)
    people_roles = dict(db.execute("SELECT name, role FROM people"))
    totals = {}
    for r in bm.effective_week_rows(db):
        t = totals.setdefault(r["person"], [0, 0, 0])
        t[0] += r["hours"]; t[1] += r["pages"]; t[2] += r["completed"]
    facts["team_performance"] = [
        {"person": p, "role": people_roles.get(p),
         "hours": round(h, 1), "pages_assigned": round(a),
         "pages_done": round(c),
         "done_pct_of_assigned": round(100 * c / a) if a else 0,
         "pages_per_hour": round(c / h, 2) if h > 2 else None}
        for p, (h, a, c) in sorted(totals.items(), key=lambda t: -t[1][2])]
    # per-person per-project breakdown (hours + pages done)
    pp = {}
    for r in bm.effective_week_rows(db):
        if not (r["hours"] or r["completed"]):
            continue
        k = (r["person"], r["project"])
        t = pp.setdefault(k, [0, 0])
        t[0] += r["hours"]; t[1] += r["completed"]
    facts["person_by_project"] = [
        {"person": p, "project": proj, "hours": round(h, 1),
         "pages_done": round(c)}
        for (p, proj), (h, c) in sorted(pp.items(), key=lambda t: -t[1][1])]
    # project velocity: plan vs actual
    proj = {}
    for r in bm.effective_week_rows(db):
        t = proj.setdefault(r["project"], [0, 0])
        t[0] += r["hours"]; t[1] += r["completed"]
    facts["project_velocity"] = [
        {"project": name, "plan_pages_per_hour": rate,
         "actual_pages_per_hour": round(proj[name][1] / proj[name][0], 2)}
        for name, rate in db.execute(
            "SELECT name, mig_rate FROM projects WHERE mig_rate IS NOT NULL")
        if name in proj and proj[name][0] > 5]
    # client matrix quality stats
    cyc = [r[0] for r in db.execute(
        "SELECT CAST(julianday(delivered_date)-julianday(draft_date) AS INT) "
        "FROM client_pages WHERE draft_date AND delivered_date ORDER BY 1")]
    rw = db.execute("SELECT SUM(rework), COUNT(*) FROM client_pages").fetchone()
    if cyc:
        facts["matrix_quality"] = {
            "median_cycle_days_draft_to_delivered": cyc[len(cyc) // 2],
            "cycle_range_days": [cyc[0], cyc[-1]],
            "pages_needing_rework_round2plus": rw[0] or 0,
            "rework_pct": round(100 * (rw[0] or 0) / rw[1]) if rw[1] else 0}
    facts["client_matrices"] = [
        {"name": m, "pages": t, "migrated": mg or 0, "qa": qa or 0,
         "delivered": dv or 0}
        for m, t, mg, qa, dv in db.execute(
            "SELECT matrix, COUNT(*), SUM(migrated), SUM(qa_done), "
            "SUM(delivered) FROM client_pages GROUP BY matrix")]
    return json.dumps(facts)


def ask_openai(key, messages, ctx=""):
    system = SYSTEM + facts_blob()
    if ctx and ctx != "overview":
        system += (f"\n\nCURRENT VIEW: the user is looking at the "
                   f"'{ctx}' dashboard. Scope answers to it by default; "
                   f"only go broader when the question clearly asks.")
    payload_msgs = [{"role": "system", "content": system}]
    payload_msgs += messages
    last_err = None
    for model in MODELS:
        payload = {"model": model, "messages": payload_msgs,
                   "max_completion_tokens": 1500}
        if model.startswith("gpt-5"):  # reasoning models: answer, don't muse
            payload["reasoning_effort"] = "minimal"
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions", data=body,
            headers={"Content-Type": "application/json",
                     "Authorization": f"Bearer {key}"})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                out = json.load(resp)
            reply = (out["choices"][0]["message"]["content"] or "").strip()
            if not reply:  # reasoning burned the budget — try next model
                last_err = f"{model}: empty reply"
                continue
            return reply
        except urllib.error.HTTPError as e:
            detail = e.read().decode()[:300]
            if e.code in (404, 400) and ("model" in detail or e.code == 404):
                last_err = f"{model}: {e.code}"
                continue  # try next model
            if e.code == 401:
                raise RuntimeError("The API key was rejected (401). Check "
                                   "~/.migration-matrix-openai-key.")
            raise RuntimeError(f"OpenAI error {e.code}: {detail}")
    raise RuntimeError(f"No available model worked ({last_err}).")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(200, {})

    def do_GET(self):
        if self.path.startswith("/open"):
            # open a SOURCE spreadsheet in Excel — whitelisted files only
            import subprocess
            from urllib.parse import parse_qs, urlparse
            which = parse_qs(urlparse(self.path).query).get("f", [""])[0]
            if which == "tracker":
                target = os.path.abspath(bm.SRC)
            elif which == "matrix":
                import client_matrix as _cm
                paths = _cm.find_matrices()
                want = parse_qs(urlparse(self.path).query).get("m", [""])[0]
                target = None
                for p in paths:
                    if want and want in os.path.basename(p):
                        target = p
                        break
                if target is None:
                    target = paths[0] if paths else None
            else:
                return self._send(400, {"error": "unknown file"})
            if not target or not os.path.exists(target):
                return self._send(404, {"error": "file not found"})
            subprocess.run(["open", target])
            return self._send(200, {"ok": True,
                                    "opened": os.path.basename(target)})
        self._send(200, {"ok": True, "key": bool(get_key())})

    def do_POST(self):
        if self.path == "/archive":
            # toggle a project's archived state, then the UI re-refreshes
            n = int(self.headers.get("Content-Length", 0))
            try:
                req = json.loads(self.rfile.read(n))
                name = str(req.get("project", ""))
                db = sqlite3.connect(os.path.join(HERE, "master.db"))
                known = {r[0] for r in db.execute(
                    "SELECT name FROM projects WHERE name IS NOT NULL")}
                db.close()
                if name not in known:
                    return self._send(400, {"error": "unknown project"})
                path = os.path.join(HERE, "archived.json")
                try:
                    arch = set(json.load(open(path)))
                except Exception:
                    arch = set()
                if req.get("archived"):
                    arch.add(name)
                else:
                    arch.discard(name)
                with open(path, "w") as fh:
                    json.dump(sorted(arch), fh)
                return self._send(200, {"ok": True, "archived": name in arch})
            except Exception as e:
                return self._send(200, {"error": str(e)})
        if self.path == "/refresh":
            import subprocess
            import sys as _sys
            import time as _time
            t0 = _time.time()
            r = subprocess.run([_sys.executable,
                                os.path.join(HERE, "run_all.py")],
                               cwd=HERE, capture_output=True, text=True,
                               timeout=120)
            if r.returncode != 0:
                return self._send(200, {"error":
                    (r.stderr or "build failed").strip()[-200:]})
            return self._send(200, {"ok": True,
                                    "seconds": round(_time.time() - t0, 1)})
        if self.path != "/chat":
            return self._send(404, {"error": "not found"})
        try:
            n = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(n))
            messages = [m for m in req.get("messages", [])
                        if m.get("role") in ("user", "assistant")][-12:]
            ctx = str(req.get("context", ""))[:120]
            key = get_key()
            if not key:
                return self._send(200, {"error":
                    "No API key yet. Put your OpenAI key in "
                    "~/.migration-matrix-openai-key (one line) and ask again "
                    "— no restart needed."})
            reply = ask_openai(key, messages, ctx)
            self._send(200, {"reply": reply})
        except RuntimeError as e:
            self._send(200, {"error": str(e)})
        except Exception as e:
            self._send(200, {"error": f"Server hiccup: {e}"})


if __name__ == "__main__":
    status = "found" if get_key() else "NOT set — add it to " + KEY_FILE
    print(f"Migration Matrix chat server → http://localhost:{PORT} "
          f"(key {status})")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
