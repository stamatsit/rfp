#!/usr/bin/env python3
"""Cloud runner (GitHub Actions). Sources, in order of preference:
  1. Eric's OneDrive folder via Microsoft Graph (the team edits these files
     in Excel Online; nothing to upload). Env: MS_CLIENT_ID, MS_TENANT and
     either MS_REFRESH_TOKEN (delegated, device-code sign-in) or
     MS_CLIENT_SECRET + MS_USER (app-only, IT-registered app).
     MS_DRIVE_PATH names the folder (default "Migration Matrix").
     Files fetched this way are mirrored into Supabase Storage so the app's
     Spreadsheets view shows the same copies.
  2. OneDrive "Anyone with the link" shares, via MM_SHARE_URLS (one link per
     line: a folder, or a single file owned by anyone, so Laura's tracker and
     Crystal's matrices are read in place; MM_SHARE_URL is the older
     one-folder form). Needs no Microsoft credentials: following a link mints
     an anonymous guest session, and SharePoint's REST API then lists and
     serves the files with that session. Used when no MS_* env is present.
     Files are mirrored into Supabase Storage the same way.
  3. Supabase Storage bucket mm-sources (tracker/<file>, matrices/<file>),
     fed by uploads in the app. Last resort when neither of the above is set.
Then: build_master -> make_present -> push_snapshot (source github-action).
Redundant runs are harmless: the server dedupes on source hash + data.
Every run is stamped with the moment it started reading (run_started_at, sent
with the snapshot), and a run that fails reports "sync failed: <why>" as a
heartbeat with the same stamp. The dashboard's "Sync now" button waits for the
first run that started after the click and shows its result.
Other env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MM_INGEST_TOKEN, MM_INGEST_URL.
"""
import datetime, http.cookiejar, json, os, re, subprocess, sys, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
INGEST_URL = os.environ.get("MM_INGEST_URL", "https://ai.stamats.com/api/migration/ingest")
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


def sb_remove(paths):
    if not paths:
        return
    req = urllib.request.Request(f"{SB}/storage/v1/object/{BUCKET}", method="DELETE",
                                 data=json.dumps({"prefixes": paths}).encode(), headers=H)
    with urllib.request.urlopen(req, timeout=60) as r:
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


UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/140.0 Safari/537.36")


RUNTIME_URLMAP = os.path.join(HERE, "contract", "sources-weburls.runtime.json")


def _share_links():
    """MM_SHARE_URLS: one share link per line (a folder or a single file, any
    owner), optionally written 'name.xlsx=link' to force the file name.
    MM_SHARE_URL (one folder link) is the older form and still works."""
    raw = os.environ.get("MM_SHARE_URLS") or os.environ.get("MM_SHARE_URL") or ""
    out = []
    for line in re.split(r"[\n,]+", raw):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, sep, url = line.partition("=")
        if sep and url.strip().startswith("http"):
            out.append((name.strip(), url.strip()))
        else:
            out.append((None, line))
    return out


def _guest_opener(share):
    """Follow a share link in a fresh cookie jar: SharePoint refuses the REST
    API outright (401) until the link itself has been opened, which mints a
    guest session scoped to that one share."""
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", UA)]
    with opener.open(urllib.request.Request(share), timeout=60) as r:
        landing = r.geturl()
    return opener, landing


def _rest_json(opener, url):
    req = urllib.request.Request(url, headers={"Accept": "application/json;odata=nometadata"})
    with opener.open(req, timeout=60) as r:
        return json.load(r)


def share_fetch_sources():
    """Read every share link in MM_SHARE_URLS; returns (tracker_path, n_matrices).

    A link may open a FOLDER (its landing URL carries the server-relative
    path in ?id=; every .xlsx inside is read) or a single FILE (the landing
    URL is Doc.aspx?sourcedoc={guid}; the bytes come from <link>&download=1,
    the real name and modified time from REST GetFileById). So Laura's
    tracker and Crystal's matrices are read where their owners keep them,
    no copies. Each file's link is remembered in sources-weburls.runtime.json
    so the dashboard's buttons open the owner's file.
    """
    tracker, n_mat, webmap = None, 0, {}

    def keep(name, data, modified, link):
        nonlocal tracker, n_mat
        if not data[:2] == b"PK":
            print(f"  share: {name} did not come back as a workbook, skipped")
            return
        is_matrix = "content-matrix" in name.lower()
        sub = "matrices" if is_matrix else "tracker"
        dest = os.path.join(OUT, sub, name)
        open(dest, "wb").write(data)
        try:
            if not is_matrix:   # one tracker in the mirror, whatever it is called today
                sb_remove([f"tracker/{n}" for n in sb_list("tracker") if n != name])
            sb_upload(f"{sub}/{name}", data)   # mirror for the app's Spreadsheets view
        except Exception as e:
            print("mirror to storage failed (non-fatal):", str(e)[:120])
        webmap[name] = link
        if is_matrix:
            n_mat += 1
        elif tracker is None or "tracker" in name.lower():
            tracker = dest
        print(f"  share: {name} ({len(data)} bytes, modified {modified})")

    # Messages name a link by its position, never by its URL: Actions logs on
    # this public repo are public, and failure reasons reach the dashboard.
    def read_one(forced_name, share, label):
        opener, landing = _guest_opener(share)
        parsed = urllib.parse.urlparse(landing)
        q = urllib.parse.parse_qs(parsed.query)
        rel = (q.get("id") or [None])[0]
        doc = (q.get("sourcedoc") or [None])[0]
        if rel:                                   # a folder
            site = "https://" + parsed.netloc + re.sub(r"^(/personal/[^/]+).*", r"\1", rel)
            api = (f"{site}/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(rel)}')"
                   f"/Files?$select=Name,Length,TimeLastModified")
            for it in _rest_json(opener, api).get("value", []):
                name = it["Name"]
                if not name.lower().endswith(".xlsx") or name.startswith("~$"):
                    continue
                furl = (f"{site}/_api/web/GetFileByServerRelativeUrl("
                        f"'{urllib.parse.quote(rel + '/' + name)}')/$value")
                with opener.open(urllib.request.Request(furl), timeout=180) as r:
                    data = r.read()
                keep(name, data, it.get("TimeLastModified"),
                     "https://" + parsed.netloc + urllib.parse.quote(rel + "/" + name))
        elif doc:                                 # a single file
            guid = doc.strip("{}")
            site = "https://" + parsed.netloc + re.sub(r"^(/personal/[^/]+).*", r"\1", parsed.path)
            try:
                meta = _rest_json(opener, f"{site}/_api/web/GetFileById('{guid}')"
                                          f"?$select=Name,Length,TimeLastModified")
            except Exception as e:
                print(f"  share: could not read the file's name ({str(e)[:80]})")
                meta = {}
            name = forced_name or meta.get("Name")
            if not name:
                sys.exit(f"cannot tell what file spreadsheet {label} is; write it as "
                         f"'name.xlsx=link' in MM_SHARE_URLS")
            dl = share + ("&" if "?" in share else "?") + "download=1"
            with opener.open(urllib.request.Request(dl), timeout=180) as r:
                data = r.read()
            keep(name, data, meta.get("TimeLastModified"), share)
        else:
            sys.exit(f"spreadsheet {label} did not open a folder or a file; check it is "
                     f"still shared with 'Anyone with the link'")

    links = _share_links()
    for i, (forced_name, share) in enumerate(links, 1):
        try:
            read_one(forced_name, share, f"link {i} of {len(links)}")
        except urllib.error.HTTPError as e:
            # the usual cause: the owner stopped sharing the file, or moved it
            sys.exit(f"spreadsheet link {i} of {len(links)} stopped working (HTTP {e.code}); "
                     f"check the file is still shared with 'Anyone with the link'")
    os.makedirs(os.path.dirname(RUNTIME_URLMAP), exist_ok=True)
    json.dump(webmap, open(RUNTIME_URLMAP, "w"), indent=1)
    return tracker, n_mat


def report_failure(reason, started):
    """Tell the dashboard this run failed, so a "Sync now" click can say why
    instead of waiting out its timeout. Best effort: a failure to report is
    printed and otherwise ignored. Dry runs report nothing."""
    token = os.environ.get("MM_INGEST_TOKEN")
    if os.environ.get("MM_DRY_RUN") or not token:
        return
    reason = re.sub(r"https?://\S+", "[link]", str(reason))   # never store a share link
    body = {"heartbeat": True, "detail": f"sync failed: {reason}"[:400], "run_started_at": started}
    req = urllib.request.Request(INGEST_URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-mm-ingest-token": token})
    try:
        urllib.request.urlopen(req, timeout=30).close()
    except Exception as e:
        print("could not report the failure to the dashboard:", str(e)[:120])


def main():
    started = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    try:
        run(started)
    except SystemExit as e:
        if e.code not in (None, 0):
            report_failure(e.code if isinstance(e.code, str) else f"exit code {e.code}", started)
        raise
    except Exception as e:
        report_failure(f"{type(e).__name__}: {e}", started)
        raise


def run(started):
    os.makedirs(os.path.join(OUT, "tracker"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "matrices"), exist_ok=True)
    if os.environ.get("MS_CLIENT_ID"):
        tracker, n_mat = graph_fetch_sources()
        if not tracker:
            sys.exit("no tracker .xlsx in the OneDrive folder")
        origin = "onedrive"
    elif os.environ.get("MM_SHARE_URLS") or os.environ.get("MM_SHARE_URL"):
        tracker, n_mat = share_fetch_sources()
        if not tracker:
            sys.exit("no tracker .xlsx behind the share links")
        origin = "onedrive-share"
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
               MM_SOURCE_NAME="github-action", MM_RUN_STARTED_AT=started)
    print(f"sources ({origin}): {os.path.basename(tracker)} + {n_mat} matrices")
    for script in ("build_master.py", "make_present.py"):
        r = subprocess.run([sys.executable, os.path.join(HERE, script)], cwd=HERE, env=env,
                           capture_output=True, text=True, timeout=300)
        if r.returncode != 0:
            print(r.stdout[-2000:], r.stderr[-2000:])
            last = (r.stderr.strip() or r.stdout.strip() or "no output").splitlines()[-1]
            sys.exit(f"{script} failed ({last[:200]})")
        print(f"ok {script}")
    mode = "--dry-run" if os.environ.get("MM_DRY_RUN") else "--post"   # dry run: validate, store nothing
    r = subprocess.run([sys.executable, os.path.join(HERE, "push_snapshot.py"), mode, INGEST_URL],
                       cwd=HERE, env=env, capture_output=True, text=True, timeout=180)
    print(r.stdout.strip()[-400:], r.stderr.strip()[-400:])
    if r.returncode != 0:
        last = (r.stdout.strip() or r.stderr.strip() or "no output").splitlines()[-1]
        sys.exit(f"sending the snapshot failed ({last[:200]})")


if __name__ == "__main__":
    main()
