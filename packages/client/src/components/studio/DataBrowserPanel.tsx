import { useState, useCallback, useEffect, useRef } from "react"
import { Search, BookOpen, BarChart3, Award, MessageSquareQuote, CornerDownLeft, ChevronDown, ChevronRight, X, Database } from "lucide-react"
import { markdownToHtml } from "@/lib/markdownToHtml"
import { clientSuccessData, type CaseStudy, type Testimonial, type TopLineResult } from "@/data/clientSuccessData"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

type DataTab = "qa" | "casestudies" | "results" | "testimonials"

interface QAItem {
  id: string
  question: string
  answer: string
  topicId: string | null
}

interface DataBrowserPanelProps {
  onInsert: (content: string) => void
  onAskAI: (prompt: string) => void
}

const ALL_CASE_STUDIES = clientSuccessData.caseStudies
const ALL_RESULTS = clientSuccessData.topLineResults
const ALL_TESTIMONIALS = clientSuccessData.testimonials

export function DataBrowserPanel({ onInsert, onAskAI }: DataBrowserPanelProps) {
  const [activeTab, setActiveTab] = useState<DataTab>("qa")
  const [search, setSearch] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // QA from API
  const [qaItems, setQaItems] = useState<QAItem[]>([])
  const [qaLoading, setQaLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchQA = useCallback(async (q?: string) => {
    setQaLoading(true)
    try {
      const url = q
        ? `${API_BASE}/answers/search?q=${encodeURIComponent(q)}&status=Approved`
        : `${API_BASE}/answers?status=Approved&limit=40`
      const res = await fetch(url, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setQaItems(data as QAItem[])
      }
    } catch {
      // ignore
    } finally {
      setQaLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === "qa") {
      void fetchQA()
    }
  }, [activeTab, fetchQA])

  useEffect(() => {
    if (activeTab !== "qa") return
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      void fetchQA(search || undefined)
    }, 280)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [search, activeTab, fetchQA])

  // Filter static data by search
  const lc = search.toLowerCase()

  const filteredCaseStudies = ALL_CASE_STUDIES.filter(
    (cs) =>
      !search ||
      cs.client.toLowerCase().includes(lc) ||
      cs.focus.toLowerCase().includes(lc) ||
      cs.challenge.toLowerCase().includes(lc),
  )

  const filteredResults = ALL_RESULTS.filter(
    (r) =>
      !search ||
      r.metric.toLowerCase().includes(lc) ||
      r.result.toLowerCase().includes(lc) ||
      r.client.toLowerCase().includes(lc),
  )

  const filteredTestimonials = ALL_TESTIMONIALS.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(lc) ||
      t.organization.toLowerCase().includes(lc) ||
      t.quote.toLowerCase().includes(lc),
  )

  const tabs: { id: DataTab; label: string; icon: typeof BookOpen; count: number }[] = [
    { id: "qa", label: "Q&A", icon: BookOpen, count: qaItems.length },
    { id: "casestudies", label: "Cases", icon: BarChart3, count: filteredCaseStudies.length },
    { id: "results", label: "Stats", icon: Award, count: filteredResults.length },
    { id: "testimonials", label: "Quotes", icon: MessageSquareQuote, count: filteredTestimonials.length },
  ]

  const handleTabChange = (tab: DataTab) => {
    setActiveTab(tab)
    setExpandedId(null)
    setSearch("")
  }

  return (
    <div className="flex flex-col border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/60">
      {/* Panel header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 dark:border-slate-800/60">
        <Database className="w-3 h-3 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex-1">Data Library</span>
        {search && (
          <button
            onClick={() => setSearch("")}
            className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-100 dark:border-slate-800/60 bg-white dark:bg-slate-900">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-all border-b-2 ${
                isActive
                  ? "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/20"
                  : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
              }`}
            >
              <Icon className="w-2.5 h-2.5 flex-shrink-0" />
              <span>{tab.label}</span>
              {isActive && tab.count > 0 && (
                <span className="text-[8px] bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full px-1 tabular-nums">{tab.count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="px-2.5 pt-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab === "qa" ? "Q&A answers" : activeTab === "casestudies" ? "case studies" : activeTab === "results" ? "stats & results" : "testimonials"}…`}
            className="w-full h-7 pl-7 pr-2 text-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 placeholder:text-slate-400 outline-none focus:ring-1 focus:ring-emerald-400/30 focus:border-emerald-300 dark:focus:border-emerald-700 transition-all"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto max-h-60 pb-1">
        {activeTab === "qa" && (
          <QAList
            items={qaItems}
            isLoading={qaLoading}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
            onInsert={(item) => onInsert(`\n\n${item.answer}\n\n`)}
            onAskAI={(item) => onAskAI(`Using this approved Q&A answer as a reference, help me incorporate it naturally into my document:\n\nQ: ${item.question}\nA: ${item.answer}`)}
          />
        )}
        {activeTab === "casestudies" && (
          <CaseStudyList
            items={filteredCaseStudies}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId(expandedId === id ? null : id)}
            onInsert={(cs) => {
              const metrics = cs.metrics.map((m) => `- ${m.label}: ${m.value}`).join("\n")
              const md = `**${cs.client}** — ${cs.focus}\n\n**Challenge:** ${cs.challenge}\n\n**Solution:** ${cs.solution}\n\n**Results:**\n${metrics}`
              onInsert(markdownToHtml(md))
            }}
            onAskAI={(cs) => onAskAI(`Help me write a compelling case study section for ${cs.client}. Focus: ${cs.focus}. Their challenge was: "${cs.challenge}". Key metrics: ${cs.metrics.slice(0, 3).map((m) => `${m.label}: ${m.value}`).join("; ")}.`)}
          />
        )}
        {activeTab === "results" && (
          <ResultList
            items={filteredResults}
            onInsert={(r) => onInsert(markdownToHtml(`**${r.result}** — ${r.metric} (${r.client})`))}
            onAskAI={(r) => onAskAI(`Help me incorporate this result naturally into my proposal: ${r.result} ${r.metric} for ${r.client}.`)}
          />
        )}
        {activeTab === "testimonials" && (
          <TestimonialList
            items={filteredTestimonials}
            onInsert={(t) => {
              const md = `> "${t.quote}"\n>\n> — **${t.name}**, ${t.title}, ${t.organization}`
              onInsert(markdownToHtml(md))
            }}
            onAskAI={(t) => onAskAI(`Help me incorporate this testimonial from ${t.name} at ${t.organization} into my document: "${t.quote}"`)}
          />
        )}
      </div>
    </div>
  )
}

// ── Sub-lists ─────────────────────────────────────────────────────────────────

function QAList({
  items,
  isLoading,
  expandedId,
  onToggle,
  onInsert,
  onAskAI,
}: {
  items: QAItem[]
  isLoading: boolean
  expandedId: string | null
  onToggle: (id: string) => void
  onInsert: (item: QAItem) => void
  onAskAI: (item: QAItem) => void
}) {
  if (isLoading) {
    return (
      <div className="px-3 py-3 space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-1 animate-pulse">
            <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-md" style={{ width: `${60 + i * 10}%` }} />
            <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-md w-3/4" />
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <BookOpen className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        <p className="text-[10px] text-slate-400 dark:text-slate-500">No approved Q&A answers</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {items.map((item) => (
        <div key={item.id} className={`transition-colors ${expandedId === item.id ? "bg-emerald-50/50 dark:bg-emerald-900/10" : "hover:bg-white dark:hover:bg-slate-800/30"}`}>
          <button
            onClick={() => onToggle(item.id)}
            className="flex items-start gap-1.5 w-full text-left px-3 py-2"
          >
            {expandedId === item.id
              ? <ChevronDown className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
              : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />}
            <span className={`text-[10px] font-medium leading-snug ${expandedId === item.id ? "text-emerald-700 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"}`}>
              {item.question}
            </span>
          </button>
          {expandedId === item.id && (
            <div className="px-3 pb-2 pl-[22px]">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-4 mb-2">
                {item.answer}
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => onInsert(item)}
                  className="flex items-center gap-1 px-2 py-1 text-[9px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-md shadow-sm transition-colors"
                >
                  <CornerDownLeft className="w-2 h-2" />
                  Insert
                </button>
                <button
                  onClick={() => onAskAI(item)}
                  className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200/60 dark:border-emerald-800/50 rounded-md transition-colors"
                >
                  Ask AI to adapt
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function CaseStudyList({
  items,
  expandedId,
  onToggle,
  onInsert,
  onAskAI,
}: {
  items: CaseStudy[]
  expandedId: string | null
  onToggle: (id: string) => void
  onInsert: (cs: CaseStudy) => void
  onAskAI: (cs: CaseStudy) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <BarChart3 className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        <p className="text-[10px] text-slate-400 dark:text-slate-500">No case studies found</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {items.map((cs) => {
        const id = String(cs.id)
        return (
          <div key={cs.id} className={`transition-colors ${expandedId === id ? "bg-emerald-50/50 dark:bg-emerald-900/10" : "hover:bg-white dark:hover:bg-slate-800/30"}`}>
            <button
              onClick={() => onToggle(id)}
              className="flex items-start gap-1.5 w-full text-left px-3 py-2"
            >
              {expandedId === id
                ? <ChevronDown className="w-3 h-3 text-emerald-500 flex-shrink-0 mt-0.5" />
                : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />}
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] font-semibold leading-snug ${expandedId === id ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}`}>
                  {cs.client}
                </p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500">{cs.focus}</p>
              </div>
            </button>
            {expandedId === id && (
              <div className="px-3 pb-2 pl-[22px] space-y-1.5">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {cs.challenge}
                </p>
                {cs.metrics.slice(0, 2).map((m, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-400 flex-shrink-0 mt-1.5" />
                    <span className="text-[9px] text-emerald-700 dark:text-emerald-300 font-medium leading-relaxed">
                      {m.label}: {m.value}
                    </span>
                  </div>
                ))}
                <div className="flex gap-1.5 pt-0.5">
                  <button
                    onClick={() => onInsert(cs)}
                    className="flex items-center gap-1 px-2 py-1 text-[9px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded-md shadow-sm transition-colors"
                  >
                    <CornerDownLeft className="w-2 h-2" />
                    Insert
                  </button>
                  <button
                    onClick={() => onAskAI(cs)}
                    className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200/60 dark:border-emerald-800/50 rounded-md transition-colors"
                  >
                    Ask AI to write
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ResultList({
  items,
  onInsert,
  onAskAI,
}: {
  items: TopLineResult[]
  onInsert: (r: TopLineResult) => void
  onAskAI: (r: TopLineResult) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <Award className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        <p className="text-[10px] text-slate-400 dark:text-slate-500">No results found</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {items.map((r, i) => (
        <div
          key={i}
          className="group flex items-start gap-2 px-3 py-2 hover:bg-white dark:hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums leading-snug">{r.result}</p>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">{r.metric}</p>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 leading-snug truncate">{r.client}</p>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
            <button
              onClick={() => onInsert(r)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded transition-colors"
              title="Insert"
            >
              <CornerDownLeft className="w-2 h-2" />
            </button>
            <button
              onClick={() => onAskAI(r)}
              className="px-1.5 py-0.5 text-[8px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 border border-emerald-200/60 dark:border-emerald-800/50 rounded transition-colors"
              title="Ask AI to incorporate"
            >
              AI
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function TestimonialList({
  items,
  onInsert,
  onAskAI,
}: {
  items: Testimonial[]
  onInsert: (t: Testimonial) => void
  onAskAI: (t: Testimonial) => void
}) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <MessageSquareQuote className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        <p className="text-[10px] text-slate-400 dark:text-slate-500">No testimonials found</p>
      </div>
    )
  }
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {items.map((t, i) => (
        <div
          key={i}
          className="group px-3 py-2 hover:bg-white dark:hover:bg-slate-800/30 transition-colors"
        >
          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3 italic mb-1.5">
            "{t.quote}"
          </p>
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold text-slate-700 dark:text-slate-300 truncate">{t.name}</p>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate">{t.title}, {t.organization}</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
              <button
                onClick={() => onInsert(t)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-semibold text-white bg-emerald-500 hover:bg-emerald-600 rounded transition-colors"
                title="Insert"
              >
                <CornerDownLeft className="w-2 h-2" />
              </button>
              <button
                onClick={() => onAskAI(t)}
                className="px-1.5 py-0.5 text-[8px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 border border-emerald-200/60 dark:border-emerald-800/50 rounded transition-colors"
                title="Ask AI to incorporate"
              >
                AI
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
