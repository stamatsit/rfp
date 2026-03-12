/**
 * MeetingAnalysisView — Displays structured AI analysis of a meeting.
 * Supports side-by-side layout (transcript left, analysis right) on wide screens.
 */

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Users,
  ListChecks,
  MessageSquare,
  Target,
  FileText,
  Copy,
  Quote,
  Save,
  Loader2,
} from "lucide-react"
import type { MeetingRecord } from "@/lib/api"
import { testimonialsApi, meetingsApi } from "@/lib/api"
import { useIsAdmin } from "@/contexts/AuthContext"
import { toast } from "@/hooks/useToast"

interface MeetingAnalysisViewProps {
  meeting: MeetingRecord
  onUpdate?: (meeting: MeetingRecord) => void
}

function Section({
  title,
  icon: Icon,
  color,
  children,
  defaultOpen = true,
  count,
}: {
  title: string
  icon: typeof ListChecks
  color: string
  children: React.ReactNode
  defaultOpen?: boolean
  count?: number
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        {open ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            {count}
          </span>
        )}
      </button>
      {open && <div className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">{children}</div>}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
    </button>
  )
}

function buildFullCopyText(meeting: MeetingRecord): string {
  const lines: string[] = []
  if (meeting.title) lines.push(`# ${meeting.title}`)
  if (meeting.clientName) lines.push(`Client: ${meeting.clientName}`)
  if (meeting.meetingDate) lines.push(`Date: ${new Date(meeting.meetingDate).toLocaleDateString()}`)
  lines.push("")

  if (meeting.summary) {
    lines.push("## Summary", meeting.summary, "")
  }

  const attendees = meeting.meetingAttendees || []
  if (attendees.length > 0) {
    lines.push(`Attendees: ${attendees.join(", ")}`, "")
  }

  const actionItems = meeting.meetingActionItems || []
  if (actionItems.length > 0) {
    lines.push("## Action Items")
    actionItems.forEach((item, i) => {
      let line = `${i + 1}. ${item.text}`
      if (item.assignee) line += ` (${item.assignee})`
      if (item.dueDate) line += ` — due ${item.dueDate}`
      lines.push(line)
    })
    lines.push("")
  }

  const keyPoints = meeting.keyPoints || []
  if (keyPoints.length > 0) {
    lines.push("## Key Discussion Points")
    keyPoints.forEach(p => lines.push(`- ${p}`))
    lines.push("")
  }

  const decisions = meeting.meetingDecisions || []
  if (decisions.length > 0) {
    lines.push("## Decisions Made")
    decisions.forEach(d => lines.push(`- ${d}`))
    lines.push("")
  }

  const painPoints = meeting.meetingPainPoints || []
  if (painPoints.length > 0) {
    lines.push("## Pain Points")
    painPoints.forEach(p => lines.push(`- ${p}`))
    lines.push("")
  }

  const opportunities = meeting.meetingOpportunities || []
  if (opportunities.length > 0) {
    lines.push("## Opportunities")
    opportunities.forEach(o => lines.push(`- ${o}`))
    lines.push("")
  }

  const pullQuotes = meeting.meetingPullQuotes || []
  if (pullQuotes.length > 0) {
    lines.push("## Pull Quotes")
    pullQuotes.forEach(q => {
      lines.push(`> "${q.quote}"`)
      const attr = [q.speaker, q.title].filter(Boolean).join(", ")
      if (attr) lines.push(`> — ${attr}`)
      if (q.context) lines.push(`Context: ${q.context}`)
      lines.push("")
    })
  }

  return lines.join("\n")
}

// Speaker colors for diarized transcript
const SPEAKER_COLORS = [
  "text-indigo-600 dark:text-indigo-400",
  "text-teal-600 dark:text-teal-400",
  "text-amber-600 dark:text-amber-400",
  "text-rose-600 dark:text-rose-400",
  "text-cyan-600 dark:text-cyan-400",
  "text-violet-600 dark:text-violet-400",
  "text-emerald-600 dark:text-emerald-400",
  "text-orange-600 dark:text-orange-400",
]

function DiarizedTranscript({ text }: { text: string }) {
  const speakerMap = new Map<string, number>()
  let nextColor = 0

  // Parse **Speaker:** lines into segments
  const segments: { speaker: string; text: string }[] = []
  const lines = text.split("\n")
  let currentSpeaker = ""
  let currentText: string[] = []

  for (const line of lines) {
    const match = line.match(/^\*\*(.+?):\*\*\s*(.*)/)
    if (match) {
      if (currentSpeaker && currentText.length > 0) {
        segments.push({ speaker: currentSpeaker, text: currentText.join("\n") })
      }
      currentSpeaker = match[1]!
      currentText = match[2]! ? [match[2]!] : []
    } else if (line.trim() === "" && currentSpeaker) {
      // Blank line — continue accumulating
    } else if (currentSpeaker) {
      currentText.push(line)
    } else {
      // No speaker label yet — treat as preamble
      if (line.trim()) {
        segments.push({ speaker: "", text: line })
      }
    }
  }
  if (currentSpeaker && currentText.length > 0) {
    segments.push({ speaker: currentSpeaker, text: currentText.join("\n") })
  }

  // If we couldn't parse any speaker segments, fall back to raw
  if (segments.length === 0 || segments.every(s => !s.speaker)) {
    return (
      <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-sans leading-relaxed">
        {text}
      </pre>
    )
  }

  return (
    <div className="space-y-3">
      {segments.map((seg, i) => {
        if (!seg.speaker) {
          return <p key={i} className="text-xs text-zinc-500 dark:text-zinc-400">{seg.text}</p>
        }
        if (!speakerMap.has(seg.speaker)) {
          speakerMap.set(seg.speaker, nextColor)
          nextColor = (nextColor + 1) % SPEAKER_COLORS.length
        }
        const colorClass = SPEAKER_COLORS[speakerMap.get(seg.speaker)!]
        return (
          <div key={i} className="text-xs leading-relaxed">
            <span className={`font-semibold ${colorClass}`}>{seg.speaker}:</span>{" "}
            <span className="text-zinc-700 dark:text-zinc-300">{seg.text.trim()}</span>
          </div>
        )
      })}
    </div>
  )
}

export function MeetingAnalysisView({ meeting, onUpdate }: MeetingAnalysisViewProps) {
  const isAdmin = useIsAdmin()
  const [savedQuotes, setSavedQuotes] = useState<Set<number>>(new Set())
  const [savingQuote, setSavingQuote] = useState<number | null>(null)
  const [diarizing, setDiarizing] = useState(false)

  const actionItems = meeting.meetingActionItems || []
  const decisions = meeting.meetingDecisions || []
  const painPoints = meeting.meetingPainPoints || []
  const opportunities = meeting.meetingOpportunities || []
  const keyPoints = meeting.keyPoints || []
  const attendees = meeting.meetingAttendees || []
  const pullQuotes = meeting.meetingPullQuotes || []

  const handleSaveTestimonial = async (quote: typeof pullQuotes[0], index: number) => {
    try {
      setSavingQuote(index)
      await testimonialsApi.create({
        quote: quote.quote,
        name: quote.speaker || undefined,
        title: quote.title || undefined,
        organization: meeting.clientName,
        source: `Meeting: ${meeting.title || "Untitled"}`,
        notes: quote.context ? `Context: ${quote.context}` : undefined,
        testimonialDate: meeting.meetingDate ? new Date(meeting.meetingDate).toISOString().split("T")[0] : undefined,
      })
      setSavedQuotes(prev => new Set(prev).add(index))
      toast.success("Saved to testimonials as draft")
    } catch (err) {
      toast.error("Failed to save testimonial")
    } finally {
      setSavingQuote(null)
    }
  }

  const actionItemsText = actionItems
    .map((item, i) => {
      let line = `${i + 1}. ${item.text}`
      if (item.assignee) line += ` (${item.assignee})`
      if (item.dueDate) line += ` — due ${item.dueDate}`
      return line
    })
    .join("\n")

  const handleCopyAll = () => {
    navigator.clipboard.writeText(buildFullCopyText(meeting))
    toast.success("Copied meeting notes to clipboard")
  }

  const hasTranscript = !!meeting.extractedText
  const hasDiarized = !!meeting.diarizedTranscript
  const [showSpeakers, setShowSpeakers] = useState(hasDiarized)

  const handleDiarize = async () => {
    try {
      setDiarizing(true)
      const result = await meetingsApi.diarize(meeting.id)
      if (result.diarizedTranscript && onUpdate) {
        onUpdate({ ...meeting, diarizedTranscript: result.diarizedTranscript })
      }
      setShowSpeakers(true)
      toast.success("Speaker labels added")
    } catch {
      toast.error("Failed to label speakers")
    } finally {
      setDiarizing(false)
    }
  }

  const analysisContent = (
    <div className="space-y-3">
      {/* Copy All button */}
      <div className="flex justify-end">
        <button
          onClick={handleCopyAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy All
        </button>
      </div>

      {/* Summary */}
      {meeting.summary && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 mb-1">Summary</h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-300/80 leading-relaxed">{meeting.summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Attendees */}
      {attendees.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Users className="w-4 h-4 text-zinc-400" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {attendees.join(", ")}
          </span>
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <Section title="Action Items" icon={ListChecks} color="text-blue-500" count={actionItems.length}>
          <div className="mt-3 space-y-2">
            <div className="flex justify-end">
              <CopyButton text={actionItemsText} />
            </div>
            {actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <div className="w-5 h-5 rounded border border-zinc-300 dark:border-zinc-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-800 dark:text-zinc-200">{item.text}</span>
                  {(item.assignee || item.dueDate) && (
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.assignee && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
                          {item.assignee}
                        </span>
                      )}
                      {item.dueDate && (
                        <span className="text-xs text-zinc-500">{item.dueDate}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Pull Quotes */}
      {pullQuotes.length > 0 && (
        <Section title="Client Pull Quotes" icon={Quote} color="text-rose-500" count={pullQuotes.length}>
          <div className="mt-3 space-y-3">
            {pullQuotes.map((pq, i) => (
              <div key={i} className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 rounded-lg p-3">
                <blockquote className="text-sm text-zinc-800 dark:text-zinc-200 italic leading-relaxed">
                  &ldquo;{pq.quote}&rdquo;
                </blockquote>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {pq.speaker && <span className="font-medium text-zinc-700 dark:text-zinc-300">{pq.speaker}</span>}
                    {pq.speaker && pq.title && <span>, </span>}
                    {pq.title && <span>{pq.title}</span>}
                    {pq.context && (
                      <span className="ml-2 text-zinc-400 dark:text-zinc-500">— {pq.context}</span>
                    )}
                  </div>
                  {isAdmin && (
                    savedQuotes.has(i) ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSaveTestimonial(pq, i)}
                        disabled={savingQuote === i}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors disabled:opacity-50"
                      >
                        {savingQuote === i ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Save className="w-3 h-3" />
                        )}
                        Save to Testimonials
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Key Discussion Points */}
      {keyPoints.length > 0 && (
        <Section title="Key Discussion Points" icon={MessageSquare} color="text-violet-500" count={keyPoints.length}>
          <ul className="mt-3 space-y-1.5">
            {keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <span className="text-violet-400 mt-1">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Decisions */}
      {decisions.length > 0 && (
        <Section title="Decisions Made" icon={CheckCircle2} color="text-emerald-500" count={decisions.length}>
          <ul className="mt-3 space-y-1.5">
            {decisions.map((decision, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <span>{decision}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Pain Points */}
      {painPoints.length > 0 && (
        <Section title="Client Pain Points" icon={AlertTriangle} color="text-amber-500" count={painPoints.length}>
          <ul className="mt-3 space-y-1.5">
            {painPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Opportunities */}
      {opportunities.length > 0 && (
        <Section title="Opportunities & Leverage" icon={Lightbulb} color="text-cyan-500" count={opportunities.length}>
          <ul className="mt-3 space-y-1.5">
            {opportunities.map((opp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <Target className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                <span>{opp}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )

  // Side-by-side when transcript is available
  if (hasTranscript) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Transcript */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Transcript</span>
                {hasDiarized ? (
                  <button
                    onClick={() => setShowSpeakers(!showSpeakers)}
                    className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                      showSpeakers
                        ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                        : "bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    {showSpeakers ? "Speakers On" : "Speakers Off"}
                  </button>
                ) : (
                  <button
                    onClick={handleDiarize}
                    disabled={diarizing}
                    className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
                  >
                    {diarizing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Users className="w-3 h-3" />
                    )}
                    {diarizing ? "Labeling..." : "Label Speakers"}
                  </button>
                )}
              </div>
              <CopyButton text={showSpeakers && hasDiarized ? meeting.diarizedTranscript! : meeting.extractedText!} />
            </div>
            <div className="p-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
              {showSpeakers && hasDiarized ? (
                <DiarizedTranscript text={meeting.diarizedTranscript!} />
              ) : (
                <pre className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap font-sans leading-relaxed">
                  {meeting.extractedText}
                </pre>
              )}
            </div>
          </div>
        </div>

        {/* Right: Analysis */}
        <div>{analysisContent}</div>
      </div>
    )
  }

  // No transcript — single column
  return analysisContent
}
