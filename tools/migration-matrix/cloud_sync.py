#!/usr/bin/env python3
"""Cloud runner (GitHub Actions): pull the spreadsheets from Supabase Storage
(bucket mm-sources: tracker/<file>, matrices/<file>), run the pipeline, push
the snapshot to production. No Mac involved. Redundant runs are harmless:
the server dedupes on source hash + data content (and counts as a heartbeat).
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MM_INGEST_TOKEN, MM_INGEST_URL.
"""
import json, os, subprocess, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SB = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = "mm-sources"
OUT = os.path.join(HERE, "sources")
H = {"Authorization": f"Bearer {KEY}", "apikey": KEY, "Content-Type": "application/json"}


def sb_list(prefix):
    req = urllib.request.Request(f"{SB}/storage/v1/object/list/{BUCKET}", method="POST",
                                 data=json.dumps({"prefix": prefix, "limit": 100}).encode(), headers=H)
    with urllib.request.urlopen(req, timeout=60) as r:
        return [o["name"] for o in json.load(r) if o.get("name") and not o["name"].startswith(".")]


def sb_download(path, dest):
    req = urllib.request.Request(f"{SB}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}", headers=H)
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def main():
    os.makedirs(os.path.join(OUT, "tracker"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "matrices"), exist_ok=True)
    trackers = sb_list("tracker")
    if not trackers:
        sys.exit("no tracker in storage")
    for name in trackers:
        sb_download(f"tracker/{name}", os.path.join(OUT, "tracker", name))
    for name in sb_list("matrices"):
        sb_download(f"matrices/{name}", os.path.join(OUT, "matrices", name))
    tracker = os.path.join(OUT, "tracker", sorted(trackers)[-1])
    env = dict(os.environ, MM_SOURCE=tracker, MM_MATRIX_DIR=os.path.join(OUT, "matrices"),
               MM_SOURCE_NAME="github-action")
    print(f"sources: {os.path.basename(tracker)} + {len(sb_list('matrices'))} matrices")
    for script in ("build_master.py", "make_present.py"):
        r = subprocess.run([sys.executable, os.path.join(HERE, script)], cwd=HERE, env=env,
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-2000:]); sys.exit(f"{script} failed")
        print(f"ok {script}")
    url = os.environ.get("MM_INGEST_URL", "https://ai.stamats.com/api/migration/ingest")
    r = subprocess.run([sys.executable, os.path.join(HERE, "push_snapshot.py"), "--post", url],
                       cwd=HERE, env=env, capture_output=True, text=True, timeout=180)
    print(r.stdout.strip()[-400:], r.stderr.strip()[-400:])
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
