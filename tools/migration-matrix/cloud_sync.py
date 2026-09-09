#!/usr/bin/env python3
"""Cloud runner (GitHub Actions). Sources, in order of preference:
  1. Eric's OneDrive folder via Microsoft Graph (the team edits these files
     in Excel Online; nothing to upload). Env: MS_CLIENT_ID, MS_TENANT and
     either MS_REFRESH_TOKEN (delegated, device-code sign-in) or
     MS_CLIENT_SECRET + MS_USER (app-only, IT-registered app).
     MS_DRIVE_PATH names the folder (default "Migration Matrix").
     Files fetched this way are mirrored into Supabase Storage so the app's
     Spreadsheets view shows the same copies.
  2. Supabase Storage bucket mm-sources (tracker/<file>, matrices/<file>),
     fed by uploads in the app. Used when no MS_* env is present.
Then: build_master -> make_present -> push_snapshot (source github-action).
Redundant runs are harmless: the server dedupes on source hash + data.
Other env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MM_INGEST_TOKEN, MM_INGEST_URL.
"""
import json, os, subprocess, sys, urllib.error, urllib.parse, urllib.request

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


def sb_upload(path, data):
    hdr = dict(H); hdr["Content-Type"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    hdr["x-upsert"] = "true"
    req = urllib.request.Request(f"{SB}/storage/v1/object/{BUCKET}/{urllib.parse.quote(path)}",
                                 data=data, headers=hdr, method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.status


# ── Microsoft Graph (Eric's OneDrive folder) ──────────────────────────────
def graph_token():
    tenant = os.environ.get("MS_TENANT", "organizations")
    client = os.environ["MS_CLIENT_ID"]
    if os.environ.get("MS_REFRESH_TOKEN"):
        body = {"grant_type": "refresh_token", "client_id": client,
                "refresh_token": os.environ["MS_REFRESH_TOKEN"],
                "scope": "Files.Read Sites.Read.All offline_access"}
    else:
        body = {"grant_type": "client_credentials", "client_id": client,
                "client_secret": os.environ["MS_CLIENT_SECRET"],
                "scope": "https://graph.microsoft.com/.default"}
    req = urllib.request.Request(f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
                                 data=urllib.parse.urlencode(body).encode())
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["access_token"]


def graph_fetch_sources():
    """Download every .xlsx in the OneDrive folder; returns (tracker_path, n_matrices)."""
    tok = graph_token()
    gh = {"Authorization": f"Bearer {tok}"}
    folder = os.environ.get("MS_DRIVE_PATH", "Migration Matrix")
    base = (f"https://graph.microsoft.com/v1.0/users/{urllib.parse.quote(os.environ['MS_USER'])}/drive"
            if os.environ.get("MS_USER") else "https://graph.microsoft.com/v1.0/me/drive")
    url = f"{base}/root:/{urllib.parse.quote(folder)}:/children?$select=name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl"
    with urllib.request.urlopen(urllib.request.Request(url, headers=gh), timeout=60) as r:
        items = json.load(r).get("value", [])
    tracker, n_mat = None, 0
    for it in items:
        name = it["name"]
        if not name.lower().endswith(".xlsx") or name.startswith("~$"):
            continue
        dl = it.get("@microsoft.graph.downloadUrl")
        if not dl:
            continue
        with urllib.request.urlopen(dl, timeout=120) as r:
            data = r.read()
        is_matrix = "content-matrix" in name.lower()
        sub = "matrices" if is_matrix else "tracker"
        dest = os.path.join(OUT, sub, name)
        open(dest, "wb").write(data)
        try:
            sb_upload(f"{sub}/{name}", data)   # mirror for the app's Spreadsheets view
        except Exception as e:
            print("mirror to storage failed (non-fatal):", str(e)[:120])
        if is_matrix:
            n_mat += 1
        elif tracker is None or "tracker" in name.lower():
            tracker = dest
        print(f"  graph: {name} ({it.get('size')} bytes, modified {it.get('lastModifiedDateTime')})")
    return tracker, n_mat


def main():
    os.makedirs(os.path.join(OUT, "tracker"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "matrices"), exist_ok=True)
    if os.environ.get("MS_CLIENT_ID"):
        tracker, n_mat = graph_fetch_sources()
        if not tracker:
            sys.exit("no tracker .xlsx in the OneDrive folder")
        origin = "onedrive"
    else:
        trackers = sb_list("tracker")
        if not trackers:
            sys.exit("no tracker in storage")
        for name in trackers:
            sb_download(f"tracker/{name}", os.path.join(OUT, "tracker", name))
        mats = sb_list("matrices")
        for name in mats:
            sb_download(f"matrices/{name}", os.path.join(OUT, "matrices", name))
        tracker, n_mat, origin = os.path.join(OUT, "tracker", sorted(trackers)[-1]), len(mats), "storage"
    env = dict(os.environ, MM_SOURCE=tracker, MM_MATRIX_DIR=os.path.join(OUT, "matrices"),
               MM_SOURCE_NAME="github-action")
    print(f"sources ({origin}): {os.path.basename(tracker)} + {n_mat} matrices")
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
