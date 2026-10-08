/**
 * Gate 0 source probe. Runs three queries through every lane and reports
 * count, latency and a rough on-topic share per lane, plus deep-read results.
 * Responses go to the dev file cache, so re-running costs no quota.
 *
 *   cd packages/server && npx tsx src/listening/probe.ts
 */
import "dotenv/config"
import path from "node:path"
import { FileCache } from "./cache.js"
import { DEFAULT_PSE_ENGINE_ID, SITE_GROUPS } from "./config.js"
import { PseProvider } from "./sources/pse.js"
import { YoutubeSource } from "./sources/youtube.js"
import { NewsSource } from "./sources/news.js"
import { PageReader, isReadable } from "./sources/reader.js"
import { describeError } from "./util/http.js"
import { queryTokens, normForMatch } from "./util/text.js"
import { canonicalUrl } from "./util/url.js"
import type { RawItem } from "./types.js"

const QUERIES = [
  { q: "online nursing degree", entity: false },
  { q: "college enrollment trends", entity: false },
  { q: "Coe College", entity: true },
]

function onTopicShare(items: RawItem[], q: string): number {
  const toks = queryTokens(q)
  if (!items.length || !toks.length) return 0
  const hits = items.filter((it) => {
    const hay = normForMatch(`${it.title} ${it.text}`)
    const n = toks.filter((t) => hay.includes(t)).length
    return n / toks.length >= 0.5
  }).length
  return Math.round((100 * hits) / items.length)
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: true; v: T; ms: number } | { ok: false; err: string; ms: number }> {
  const t = Date.now()
  try {
    return { ok: true, v: await fn(), ms: Date.now() - t }
  } catch (err) {
    return { ok: false, err: describeError(err), ms: Date.now() - t }
  }
}

async function main() {
  const key = process.env["GOOGLE_PSE_API_KEY"]
  const yt = process.env["YOUTUBE_API_KEY"]
  if (!key || !yt) throw new Error("GOOGLE_PSE_API_KEY and YOUTUBE_API_KEY must be set in packages/server/.env")
  const cache = new FileCache(path.resolve(process.cwd(), ".cache/listening"))
  const pse = new PseProvider(key, process.env["GOOGLE_PSE_ENGINE_ID"] || DEFAULT_PSE_ENGINE_ID, cache)
  const youtube = new YoutubeSource(yt, cache)
  const news = new NewsSource(cache)
  const reader = new PageReader(cache)
  let pseCalls = 0
  let ytUnits = 0

  for (const { q, entity } of QUERIES) {
    const sq = entity ? `"${q}"` : q
    console.log(`\n=== ${q}`)
    const all: RawItem[] = []
    const lanes = [
      ...SITE_GROUPS.map((g) => ({ id: g.id, run: () => pse.search({ q: sq, sites: g.sites, start: 1, dateRestrict: "y1" }, `search:${g.id}`) })),
      { id: "reddit p2", run: () => pse.search({ q: sq, sites: ["reddit.com"], start: 11, dateRestrict: "y1" }, "search:reddit:p2") },
    ]
    for (const lane of lanes) {
      const r = await timed(lane.run)
      if (r.ok) {
        if (!r.v.fromCache) pseCalls++
        all.push(...r.v.items)
        const plats = [...new Set(r.v.items.map((i) => i.platform))].join(",")
        console.log(`  ${lane.id.padEnd(10)} ${String(r.v.items.length).padStart(3)} items  ${String(r.ms).padStart(5)}ms  on-topic ${onTopicShare(r.v.items, q)}%  next=${r.v.nextStart ?? "-"}  ${r.v.fromCache ? "(cache)" : ""}  [${plats}]  dated=${r.v.items.filter((i) => i.publishedAt).length}`)
      } else console.log(`  ${lane.id.padEnd(10)} FAILED ${r.ms}ms: ${r.err}`)
    }
    const y = await timed(() => youtube.harvest(q, "1y", {}))
    if (y.ok) {
      ytUnits += y.v.units
      all.push(...y.v.items)
      console.log(`  youtube    ${String(y.v.items.length).padStart(3)} items  ${String(y.ms).padStart(5)}ms  videos=${y.v.videos} commentVideos=${y.v.commentVideos} units=${y.v.units}  ${y.v.notes.join("; ")}`)
    } else console.log(`  youtube    FAILED ${y.ms}ms: ${y.err}`)
    const n = await timed(() => news.harvest(sq, "1y"))
    if (n.ok) {
      all.push(...n.v)
      console.log(`  news       ${String(n.v.length).padStart(3)} items  ${String(n.ms).padStart(5)}ms  on-topic ${onTopicShare(n.v, q)}%`)
    } else console.log(`  news       FAILED ${n.ms}ms: ${n.err}`)

    const uniq = new Map(all.map((i) => [canonicalUrl(i.url), i]))
    console.log(`  unique items: ${uniq.size} (raw ${all.length}), on-topic ${onTopicShare([...uniq.values()], q)}%`)

    // Deep read: two Reddit threads and two forum/review pages.
    const reddit = [...uniq.values()].filter((i) => i.platform === "reddit" && i.kind === "post").slice(0, 2)
    const other = [...uniq.values()].filter((i) => (i.platform === "forums" || i.platform === "reviews") && isReadable(i.url)).slice(0, 2)
    for (const it of [...reddit, ...other]) {
      const r = await timed(() => reader.read(it.url))
      if (r.ok) console.log(`  read ${it.platform.padEnd(8)} ok   ${String(r.ms).padStart(5)}ms via=${r.v.via} body=${r.v.body?.length ?? 0}ch comments=${r.v.comments.length}  ${it.url.slice(0, 90)}`)
      else console.log(`  read ${it.platform.padEnd(8)} FAIL ${String(r.ms).padStart(5)}ms ${r.err}  ${it.url.slice(0, 90)}`)
    }
  }
  console.log(`\nGoogle search calls spent: ${pseCalls}   YouTube units: ${ytUnits}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
