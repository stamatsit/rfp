#!/usr/bin/env python3
"""Drive the REAL migration routes on a throwaway local Postgres: store, fail, recover. Local only.

  e2e_realdb.py SNAPSHOT.json

Needs packages/server/e2e/mm-harness.ts running on 127.0.0.1:3002 (see README.md). The harness refuses
any database but the local test one, and this script only ever talks to 127.0.0.1.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:3002/api/migration"
HDR = {"Content-Type": "application/json", "x-mm-ingest-token": "local-e2e"}
snap = json.load(open(sys.argv[1]))
fails = []


def post(body):
    req = urllib.request.Request(BASE + "/ingest", data=json.dumps(body, default=str).encode(), method="POST", headers=HDR)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def latest():
    with urllib.request.urlopen(BASE + "/latest", timeout=60) as r:
        return json.load(r)


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f"  {detail}" if detail else ""))
    if not ok:
        fails.append(name)


s, r = post(snap)
# A fresh database stores it (201); one that already holds this exact snapshot reports a duplicate
check("the real snapshot is stored", s in (200, 201) and bool(r.get("snapshot_id") or r.get("deduped")), str(r)[:90])
a = latest()
first_id = a["snapshot"]["id"]
check("the contract version comes back", a["snapshot"]["contract"] == snap["contract"], a["snapshot"]["contract"])
check("no problem shown after a good run", a.get("sync_problem") is None)
team = {t["name"]: t for t in a["snapshot"]["data"]["team"]}
sent = {t["name"]: t for t in snap["data"]["team"]}
check("the team columns survive storage",
      all(team[n].get("migration_complete") == sent[n].get("migration_complete") for n in sent),
      str({n: team[n].get("migration_complete") for n in list(team)[:3]}))

reason = "Migration Tracker needs attention: it has 1 item to fix, listed on its Start Here tab. The dashboard keeps its last good numbers."
s, r = post({"heartbeat": True, "detail": f"sync failed: {reason}", "run_started_at": "2026-11-04T20:00:00.000Z"})
check("a failed run is logged", s == 200 and r.get("heartbeat") is True)
b = latest()
check("the page gets the reason, without the run tag", b.get("sync_problem") == reason, str(b.get("sync_problem"))[:70])
check("the last good numbers stay", b["snapshot"]["id"] == first_id)

s, r = post({"heartbeat": True, "detail": "alive"})
check("an ordinary heartbeat is not a problem", latest().get("sync_problem") is None)

post({"heartbeat": True, "detail": f"sync failed: {reason}"})
check("a failure with no run tag still shows", latest().get("sync_problem") == reason)
s, r = post(snap)
c = latest()
check("re-sending the same data clears the problem", c.get("sync_problem") is None, str(r)[:90])

post({"heartbeat": True, "detail": f"sync failed: {reason}"})
changed = json.loads(json.dumps(snap, default=str))
changed["data"]["team"][0]["assigned"] = changed["data"]["team"][0]["assigned"] + 1
changed["generated_at"] = "2026-11-04T21:00:00.000Z"
s, r = post(changed)
d = latest()
check("new data clears the problem and is shown", d.get("sync_problem") is None and d["snapshot"]["id"] != first_id, str(r)[:90])
print("RESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILED: {fails}")
sys.exit(1 if fails else 0)
