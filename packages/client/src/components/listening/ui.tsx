/**
 * Shared pieces for Topic Ideation: formatting, platform badges, sentiment
 * colours (semantic only), cards and the copy-to-clipboard report.
 */
import { useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { toast } from "@/hooks/useToast"
import type { Audience, ItemView, Platform, Report, Sentiment, SentimentBreakdown } from "@/types/listening"

export const ACCENT = "linear-gradient(135deg, #0D9488 0%, #0284C7 55%, #4F46E5 100%)"

// ─── formatting ──────────────────────────────────────────────────────────────

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ""
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`
  return fmtDate(iso)
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" })
}

export function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, 15)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
}

export function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

export function pct(n: number, d: number): number {
  return d ? Math.round((100 * n) / d) : 0
}

// ─── sentiment ──────────────────────────────────────────────────────────────

export const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: "#10B981",
  neutral: "#94A3B8",
  mixed: "#F59E0B",
  negative: "#F43F5E",
}

export const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  mixed: "Mixed",
  negative: "Negative",
}

export function verdict(s: SentimentBreakdown | null | undefined): { label: string; tone: Sentiment } {
  const total = s ? s.positive + s.neutral + s.negative + s.mixed : 0
  if (!s || total === 0) return { label: "No signal yet", tone: "neutral" }
  if (s.neutral / total >= 0.6 && Math.abs(s.score) < 35) return { label: "Mostly neutral", tone: "neutral" }
  if (s.score >= 35) return { label: "Mostly positive", tone: "positive" }
  if (s.score >= 10) return { label: "Leans positive", tone: "positive" }
  if (s.score > -10) return { label: "Mixed feelings", tone: "mixed" }
  if (s.score > -35) return { label: "Leans negative", tone: "negative" }
  return { label: "Mostly negative", tone: "negative" }
}

export function verdictFromScore(score: number | null): { label: string; tone: Sentiment } {
  if (score === null) return { label: "No signal yet", tone: "neutral" }
  return verdict({ positive: score > 0 ? 1 : 0, negative: score < 0 ? 1 : 0, neutral: score === 0 ? 1 : 0, mixed: 0, score })
}

export function SentimentDot({ tone, className = "" }: { tone: Sentiment; className?: string }) {
  return <span aria-hidden className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`} style={{ background: SENTIMENT_COLOR[tone] }} />
}

export function SentimentPill({ score }: { score: number | null }) {
  const v = verdictFromScore(score)
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300">
      <SentimentDot tone={v.tone} />
      {v.label}
    </span>
  )
}

/** Stacked bar: positive, mixed, neutral, negative. */
export function SentimentBar({ s, height = 10, showLegend = false }: { s: SentimentBreakdown; height?: number; showLegend?: boolean }) {
  const total = s.positive + s.neutral + s.negative + s.mixed
  const order: Sentiment[] = ["positive", "mixed", "neutral", "negative"]
  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        style={{ height }}
        role="img"
        aria-label={total ? order.map((k) => `${pct(s[k], total)}% ${k}`).join(", ") : "no sentiment yet"}
      >
        {total > 0 &&
          order.map((k) =>
            s[k] ? <div key={k} style={{ width: `${(100 * s[k]) / total}%`, background: SENTIMENT_COLOR[k] }} title={`${SENTIMENT_LABEL[k]}: ${s[k]} (${pct(s[k], total)}%)`} /> : null,
          )}
      </div>
      {showLegend && total > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
          {order.filter((k) => s[k] > 0).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-slate-400 tabular-nums">
              <SentimentDot tone={k} />
              {SENTIMENT_LABEL[k]} <b className="font-semibold text-slate-700 dark:text-slate-200">{pct(s[k], total)}%</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── platforms ──────────────────────────────────────────────────────────────

export const PLATFORM: Record<Platform, { label: string; color: string }> = {
  reddit: { label: "Reddit", color: "#FF4500" },
  youtube: { label: "YouTube", color: "#FF0033" },
  facebook: { label: "Facebook", color: "#1877F2" },
  instagram: { label: "Instagram", color: "#E1306C" },
  linkedin: { label: "LinkedIn", color: "#0A66C2" },
  tiktok: { label: "TikTok", color: "#111827" },
  threads: { label: "Threads", color: "#334155" },
  bluesky: { label: "Bluesky", color: "#0085FF" },
  quora: { label: "Quora", color: "#B92B27" },
  forums: { label: "Forums", color: "#7C3AED" },
  reviews: { label: "Reviews", color: "#D97706" },
  news: { label: "News", color: "#64748B" },
  other: { label: "Web", color: "#64748B" },
}

export function PlatformBadge({ platform, className = "" }: { platform: Platform; className?: string }) {
  const p = PLATFORM[platform] ?? PLATFORM.other
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-300 ${className}`}>
      <span aria-hidden className="w-2 h-2 rounded-[3px] shrink-0" style={{ background: p.color }} />
      {p.label}
    </span>
  )
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  student: "Students",
  parent: "Parents",
  patient: "Patients",
  professional: "Professionals",
  general: "General",
}

// ─── layout ─────────────────────────────────────────────────────────────────

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`bg-white dark:bg-slate-900 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl ${className}`}>
      {children}
    </div>
  )
}

export function SectionHeading({ id, title, hint, action, count }: { id: string; title: string; hint?: string; action?: ReactNode; count?: number }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4 scroll-mt-32" id={id}>
      <div>
        <h2 className="text-[20px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white">
          {title}
          {count !== undefined && <span className="ml-2 text-[15px] font-medium text-slate-400 tabular-nums">{count}</span>}
        </h2>
        {hint && <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

export function Tag({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "teal" | "blue" | "amber" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    teal: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300",
    blue: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  }
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ${tones[tone]}`}>{children}</span>
}

export function NewBadge() {
  return <span className="inline-flex items-center rounded-full bg-sky-500 text-white px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide">New</span>
}

export function CopyButton({ text, label = "Copy", done = "Copied", className = "", ariaLabel }: { text: string | (() => string); label?: string; done?: string; className?: string; ariaLabel?: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(typeof text === "function" ? text() : text)
          setOk(true)
          setTimeout(() => setOk(false), 1600)
        } catch {
          toast.error("Could not copy. Your browser blocked clipboard access.")
        }
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 ${className}`}
    >
      {ok ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      {ok ? done : label}
    </button>
  )
}

export function ExternalLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 rounded ${className}`}>
      {children}
    </a>
  )
}

// ─── copy report ────────────────────────────────────────────────────────────

export function reportMarkdown(r: Report, items: Map<string, ItemView>): string {
  const lines: string[] = []
  const v = verdict(r.sentiment)
  lines.push(`# ${r.query}`, "")
  lines.push(`${r.summary}`, "")
  lines.push(`Sample: ${plural(r.totals.relevant, "relevant post")} and comments, ${v.label.toLowerCase()} (${fmtDate(r.generatedAt)}).`, "")
  if (r.ideas.length) {
    lines.push("## Content ideas", "")
    r.ideas.forEach((idea, i) => {
      lines.push(`${i + 1}. **${idea.headline}** (${idea.format}, for ${AUDIENCE_LABEL[idea.audience].toLowerCase()})`)
      lines.push(`   ${idea.angle}`)
      const links = idea.evidenceItemIds.map((id) => items.get(id)?.url).filter(Boolean).slice(0, 4)
      if (links.length) lines.push(`   Sources: ${links.join(" , ")}`)
    })
    lines.push("")
  }
  if (r.questions.length) {
    lines.push("## Questions people ask", "")
    for (const q of r.questions) lines.push(`- "${q.text}" (${PLATFORM[q.platform].label}: ${q.url})`)
    lines.push("")
  }
  if (r.subtopics.length) {
    lines.push("## Subtopics", "")
    for (const s of r.subtopics) lines.push(`- **${s.name}** (${s.share}%): ${s.summary}`)
    lines.push("")
  }
  return lines.join("\n")
}
