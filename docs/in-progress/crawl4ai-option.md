# crawl4ai for Topic Ideation: setup and monthly cost

**Status:** Decision pending (Eric). Not built, nothing hosted, nothing billed.
**Written:** 2026-10-07. Prices checked that night; recheck before buying.
**Parent doc:** [social-listening.md](social-listening.md)

## What it would do, in one paragraph

Topic Ideation opens the most-discussed threads in full before analysing them. Today a plain
fetch does that, and some sites refuse it. crawl4ai is a free, open-source crawler that opens
a page in a real headless Chrome and returns clean text. It would sit **behind** the current
reader: only when a page refuses (403, empty, or a block page) would the tool ask crawl4ai.
If crawl4ai is down or unset, scans behave exactly as they do now. It does not replace search
(Google/Serper finds the threads; crawl4ai only reads ones we already have links to).

## What the local test showed (Eric's Mac, home connection, crawl4ai 0.9.4)

| Page | Current reader | crawl4ai |
|---|---|---|
| Reddit thread (r/prenursing) | 200 but 8 characters (blocked) | 6,242 chars, real comments with links |
| Reddit thread (r/Professors) | 200 but 8 characters | 11,623 chars, real comments with links |
| allnurses (two pages) | 403 | 39,975 and 17,560 chars of real text |
| College Confidential | 7,961 chars | 7,750 chars (no gain; already works) |
| Quora | 403 | 61 chars (login wall either way) |
| Niche reviews | 403 | 502 (blocked either way) |

Memory, measured with `docker stats`: **~500 MB idle, ~1.1 GB peak** with three pages read at
once (the tool reads at most 4 at a time). crawl4ai's docs say "at least 4GB of RAM" for general
use; for this tool's light load 2 GB is enough and 4 GB is headroom. Image size on disk: 8.6 GB.

**The open question the money depends on:** that test ran from a home internet connection.
A hosted server has a datacenter IP address, which Reddit and Cloudflare-protected sites often
block. Nobody has tested crawl4ai from a datacenter IP for these sites yet. Reddit is already
covered in production by the Arctic Shift archive, so the real prize is Cloudflare-protected
forums like allnurses.

## Usage assumed for the cost math

5 scans per workday x 22 workdays = **~110 scans a month**, each reading at most 8 new pages
in full = **at most ~880 page reads a month**. That is tiny for a crawler: CPU sits near idle
and outbound data is well under 5 GB a month, so bandwidth charges round to zero everywhere.

## Monthly cost by option

Prices marked **(vendor)** were read from the vendor's own pricing page on 2026-10-07. Prices
marked **(third-party)** come from comparison sites because the vendor page would not load;
confirm them before buying. **(computed)** means derived from vendor rates.

| Option | Size | Monthly cost | Notes |
|---|---|---|---|
| **A. Your Mac + Cloudflare Tunnel** | your hardware | **$0** | Home IP, so the test results above apply as-is. Mac must be on and awake with Docker running; if it is off, scans just skip the extra reading. Cloudflare Tunnel is on Cloudflare's free plan. |
| **B. Railway** (Hobby plan) | usage-based, ~1.1 GB used | **~$11 to $12** (computed) | $5/month plan that includes $5 of usage (vendor). Memory $10 per GB per month, CPU $20 per vCPU per month, egress $0.05/GB (vendor). At ~1.1 GB always used and ~1.5% CPU: about $11 memory + $0.30 CPU = $11.30, minus the $5 included = **$11.30 total**. One-click template exists. Easiest hosted option. |
| **C. Fly.io** | shared-cpu-2x, 2 GB | **$13.39** (vendor) | No platform fee, no free tier (vendor). Optional dedicated IPv4 $2/month (not needed: Vercel calls it over HTTPS on Fly's shared address). Egress $0.02/GB (vendor). 4 GB would be ~$25.39 (computed: +$6.00 per extra GB, vendor). |
| **D. DigitalOcean Droplet** | 2 GB / 1 vCPU / 50 GB | **$12.00** (vendor) | You run the server: install Docker, a firewall, and Caddy for HTTPS. 4 GB / 2 vCPU / 80 GB is **$24.00** (vendor). Per-second billing since 2026-01-01 (vendor). Backups optional (+20%). |
| **E. Render** | Standard 2 GB / 1 CPU | **$25** (third-party) | Plus a workspace plan fee. 4 GB is $85 (third-party). Most expensive here for no gain. |
| **F. Hetzner** | small shared VPS | **not verified** | Cheapest historically, but prices rose sharply in 2026 (third-party reports, US locations hit hardest) and the cheapest line was marked unavailable. Check hetzner.com directly if interested. |

**Only if the hosted server gets blocked:** route just the blocked sites through a residential
proxy. Pay-as-you-go runs about **$3.50 to $7 per GB** (third-party: Decodo ~$3.50 to $4, Webshare
$3.50 at 1 GB, IPRoyal ~$7 falling to $4.90). A full browser page load is a few MB, so ~880 reads
would be roughly 2 to 4 GB, about **$7 to $28 a month** on top (estimate; measure before buying).

### Totals at a glance (110 scans a month)

| Choice | Monthly |
|---|---|
| Don't add crawl4ai | $0 |
| Your Mac (option A) | $0 |
| Railway (B), no proxy needed | ~$11.30 |
| DigitalOcean 2 GB (D), no proxy needed | $12.00 |
| Fly.io 2 GB (C), no proxy needed | $13.39 |
| Any hosted option + residential proxy | roughly $20 to $40 |

## Recommendation for when you come back to this

1. **Test before paying monthly.** Spin up Fly.io or Railway for a day (cost: cents), run the same
   seven-page comparison from there (`scratchpad` script below), and look at allnurses and Reddit.
2. If the hosted run opens allnurses: pick **Railway** (least work) or **DigitalOcean 2 GB** (fixed
   price, more control). If it does not: either run it on your Mac (A) or skip crawl4ai; the
   proxy add-on costs more than the gain is worth at this volume.

## Exact setup

### Common to every option

- Image: `unclecode/crawl4ai:0.9.4` (pin the version that was tested; `latest` moves).
- Shared memory: `--shm-size=1g` (Chrome needs it).
- Port: `11235`. Health check: `GET /health` returns `{"status":"ok",...}`.
- Auth: set `CRAWL4AI_API_TOKEN` to a random secret (`openssl rand -hex 32`). Since 0.9 the server
  refuses outside connections without it. Callers send `Authorization: Bearer <token>`.
- The call the tool would make: `POST /md` with `{"url": "<page>", "f": "fit"}` returns
  `{"markdown": "..."}`.
- Built-in rate limit default is 1000/minute (config.yml `rate_limiting.default_limit`); fine as is.

Local run (what was tested):

```sh
export CRAWL4AI_API_TOKEN="$(openssl rand -hex 32)"
docker run -d --name crawl4ai -p 11235:11235 --shm-size=1g \
  -e CRAWL4AI_API_TOKEN="$CRAWL4AI_API_TOKEN" unclecode/crawl4ai:0.9.4
curl -s localhost:11235/health
curl -s -X POST localhost:11235/md -H "Authorization: Bearer $CRAWL4AI_API_TOKEN" \
  -H 'Content-Type: application/json' -d '{"url":"https://allnurses.com/","f":"fit"}' | head -c 400
```

On this Mac, `docker pull` needs Docker Desktop's helper on PATH:
`PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH" docker pull unclecode/crawl4ai:0.9.4`.

### Option A: your Mac + Cloudflare Tunnel

1. Run the local command above; add `--restart unless-stopped`.
2. Install `cloudflared`, run `cloudflared tunnel login`, create a tunnel, and route a hostname
   (e.g. `crawl.<your-domain>`) to `http://localhost:11235`.
3. Keep the Mac from sleeping while you want scans to read in full.
4. Set Vercel env (below) with that hostname.

### Option B: Railway

1. Deploy the Crawl4AI template (railway.com/deploy/crawl4ai-1) or a new service from image
   `unclecode/crawl4ai:0.9.4`.
2. Variables: `CRAWL4AI_API_TOKEN=<secret>`. Health check path `/health`. Public domain on.
3. Watch the first month's usage page; expect ~1.1 GB memory.

### Option C: Fly.io

`fly.toml`:

```toml
app = "stamats-crawl4ai"
primary_region = "iad"          # next to Vercel's default region

[build]
  image = "unclecode/crawl4ai:0.9.4"

[http_service]
  internal_port = 11235
  force_https = true
  auto_stop_machines = "off"     # keep the browser pool warm
  min_machines_running = 1

[[http_service.checks]]
  method = "GET"
  path = "/health"
  interval = "30s"
  timeout = "5s"

[[vm]]
  size = "shared-cpu-2x"
  memory = "2gb"
```

Then `fly secrets set CRAWL4AI_API_TOKEN=<secret>` and `fly deploy`. Fly gives each Machine a
`/dev/shm`; if Chrome crashes under load, raise memory to 4gb (~$25.39).

### Option D: DigitalOcean Droplet (2 GB)

1. Create a Basic Droplet, 2 GB / 1 vCPU, Ubuntu LTS, region NYC or close to `iad`.
2. Install Docker; run the local command with `--restart unless-stopped`, binding to localhost
   only: `-p 127.0.0.1:11235:11235`.
3. Install Caddy with a site block `crawl.<your-domain> { reverse_proxy 127.0.0.1:11235 }` for HTTPS.
4. Firewall: allow 22, 80, 443 only.

### Wiring it into Topic Ideation (about an hour of work, not done yet)

1. Env (local `.env` and Vercel production + preview): `CRAWL4AI_URL=https://crawl.<host>`,
   `CRAWL4AI_TOKEN=<secret>`.
2. Code: in `packages/server/src/listening/sources/reader.ts`, when the direct read throws
   (403, empty, block page) and `CRAWL4AI_URL` is set, call `POST /md {url, f:"fit"}` with a 25s
   deadline and use the markdown as the page body. For Reddit, also turn the comment permalink
   lines into comment items (they carry `/comment/<id>/` links). Coverage notes say
   "read with crawl4ai". At most 3 crawl4ai calls at once.
3. Tests: a unit test with a mocked `/md`, and one live probe run against the seven pages above.
4. Off switch: remove `CRAWL4AI_URL`; the reader skips it.

### Re-running the comparison from a hosted server

Save as `c4a_compare.py`, then run `python3 c4a_compare.py https://crawl.<host> <token-file>`
(use `http://localhost:11235` for a local container). It prints, per page, what a plain fetch
gets (what the tool does today) next to what crawl4ai gets, and flags block pages.

```python
import json, sys, time, urllib.request, re
base, token = sys.argv[1].rstrip("/"), open(sys.argv[2]).read().strip()
urls = [
  ("reddit", "https://www.reddit.com/r/prenursing/comments/1ou0jvq/online_classes_for_nursing/"),
  ("reddit", "https://www.reddit.com/r/Professors/comments/1v711eb/enrollment_trends/"),
  ("allnurses", "https://allnurses.com/programs/best-online-msn-programs-no-bedside-clinicals-r181/"),
  ("allnurses", "https://allnurses.com/resources/nti-conference-interview-inside-post-r68/"),
  ("collegeconf", "https://talk.collegeconfidential.com/t/abc-news-some-california-universities-seeing-decline-in-enrollment-heres-why/3698057"),
  ("quora", "https://www.quora.com/Are-there-any-notable-alumni-from-CGC-Landran"),
  ("niche", "https://www.niche.com/colleges/coe-college/reviews/"),
]
BLOCK = re.compile(r"just a moment|access denied|verify you are human|blocked by network security|enable javascript and cookies|attention required|captcha", re.I)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
def plain(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA}), timeout=15) as r:
            text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(script|style).*?</\1>", " ", r.read().decode("utf-8", "ignore"))))
            return f"{r.status} {len(text):>6}ch" + (" BLOCKPAGE" if BLOCK.search(text[:3000]) else "")
    except Exception as e:
        return f"FAIL {str(e)[:40]}"
def c4a(u):
    t = time.time()
    try:
        req = urllib.request.Request(f"{base}/md", data=json.dumps({"url": u, "f": "fit"}).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
        md = json.loads(urllib.request.urlopen(req, timeout=90).read()).get("markdown") or ""
        return f"{len(md):>6}ch {time.time()-t:4.1f}s" + (" BLOCKPAGE" if BLOCK.search(md[:3000]) else "")
    except Exception as e:
        return f"FAIL {time.time()-t:4.1f}s {str(e)[:60]}"
print(f"{'site':12} {'plain fetch':34} crawl4ai")
for site, u in urls:
    print(f"{site:12} {plain(u):34} {c4a(u)}")
```

Note: when run from your own computer, the "plain fetch" column reflects your home IP, not
Vercel's. Only the crawl4ai column tells you about the hosted server. The pages:

- https://www.reddit.com/r/prenursing/comments/1ou0jvq/online_classes_for_nursing/
- https://www.reddit.com/r/Professors/comments/1v711eb/enrollment_trends/
- https://allnurses.com/programs/best-online-msn-programs-no-bedside-clinicals-r181/
- https://allnurses.com/resources/nti-conference-interview-inside-post-r68/
- https://talk.collegeconfidential.com/t/abc-news-some-california-universities-seeing-decline-in-enrollment-heres-why/3698057
- https://www.quora.com/Are-there-any-notable-alumni-from-CGC-Landran
- https://www.niche.com/colleges/coe-college/reviews/

## Cleanup on this Mac

The test image takes 8.6 GB: `docker rmi unclecode/crawl4ai:latest` removes it. No container is
left running.

## Sources

- crawl4ai self-hosting docs (4 GB guidance, token, endpoints): https://docs.crawl4ai.com/core/self-hosting/
- Railway pricing (vendor): https://railway.com/pricing
- Railway crawl4ai template: https://railway.com/deploy/crawl4ai-1
- Fly.io pricing (vendor): https://docs.fly.io/about/pricing
- DigitalOcean Droplet pricing (vendor): https://www.digitalocean.com/pricing/droplets
- Render pricing (third-party): https://www.budgetforge.dev/tools/render-pricing-2026
- Hetzner 2026 price changes (third-party): https://findstack.com/resources/hetzner-price-increase-2026
- Residential proxy pricing (third-party): https://apiserpent.com/blog/residential-proxy-pricing-effective-cost
