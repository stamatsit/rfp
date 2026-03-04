/**
 * ClientAssetsTab — Case studies, testimonials, awards, proposals, Q&A library.
 */

import { useState } from "react"
import {
  FileText,
  Quote,
  Trophy,
  Briefcase,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Link2,
  Link2Off,
  Loader2,
} from "lucide-react"
import { useClientData, useClientSelection, normalizeCaseStudy } from "./ClientPortfolioContext"
import { SectionHeader } from "./SectionHeader"
import { LinkAnswerModal } from "./LinkAnswerModal"
import { clientQaApi } from "@/lib/api"
import { toast } from "@/hooks/useToast"

// ─── Constants ────────────────────────────────────────────────────

const WON_COLORS: Record<string, string> = {
  Yes: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40",
  No: "bg-red-50 text-red-700 border-red-200/70 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/40",
  Pending: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40",
  Cancelled: "bg-slate-100 text-slate-500 border-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/40",
}

export function ClientAssetsTab() {
  const { isAdmin } = useClientData()
  const { selectedClient, mergedData, qaLinks, setQaLinks, qaLinksLoading } = useClientSelection()

  const [openCaseStudies, setOpenCaseStudies] = useState<Set<number>>(new Set([0]))
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showLinkModal, setShowLinkModal] = useState(false)

  if (!selectedClient || !mergedData) return null

  const handleCopy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleUnlinkQa = async (linkId: string) => {
    try {
      await clientQaApi.unlink(linkId)
      setQaLinks(prev => prev.filter(l => l.linkId !== linkId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      toast.error(`Failed to unlink Q&A: ${msg}`)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-200">

      {/* Case Studies */}
      {mergedData.caseStudies.length > 0 && (
        <div>
          <SectionHeader icon={FileText} title="Case Studies" count={mergedData.caseStudies.length} />
          <div className="space-y-2">
            {mergedData.caseStudies.map((cs, i) => {
              const n = normalizeCaseStudy(cs as unknown as Record<string, unknown>, i)
              const isOpen = openCaseStudies.has(i)
              return (
                <div key={n.id} className="border border-slate-200/60 dark:border-slate-700/40 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenCaseStudies(prev => {
                      const next = new Set(prev)
                      next.has(i) ? next.delete(i) : next.add(i)
                      return next
                    })}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate pr-2">{n.focus}</span>
                    {isOpen ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-4 py-3 bg-white dark:bg-slate-900/60 space-y-3">
                      {n.challenge && (
                        <div>
                          <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Challenge</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{n.challenge}</p>
                        </div>
                      )}
                      {n.solution && (
                        <div>
                          <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Solution</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{n.solution}</p>
                        </div>
                      )}
                      {n.metrics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {n.metrics.map((m, mi) => (
                            <span key={mi} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 text-[11px] font-medium border border-sky-200/60 dark:border-sky-800/40">
                              <span className="font-semibold">{m.value}</span>
                              <span className="text-sky-600/70 dark:text-sky-500">{m.label}</span>
                            </span>
                          ))}
                        </div>
                      )}
                      {n.testimonial && (
                        <blockquote className="border-l-2 border-sky-300 dark:border-sky-600 pl-3 italic text-sm text-slate-600 dark:text-slate-400">
                          &ldquo;{n.testimonial.quote}&rdquo;
                          {n.testimonial.attribution && <footer className="mt-0.5 text-[11px] not-italic text-slate-400 dark:text-slate-500">&mdash; {n.testimonial.attribution}</footer>}
                        </blockquote>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Testimonials */}
      {mergedData.testimonials.length > 0 ? (
        <div>
          <SectionHeader icon={Quote} title="Testimonials" count={mergedData.testimonials.length} />
          <div className="space-y-2">
            {(mergedData.testimonials as Array<{ id?: string; quote: string; name?: string; title?: string; organization?: string; notes?: string | null; status?: string }>).map((t, i) => {
              const id = t.id || `hc-t-${i}`
              const attribution = [t.name, t.title, t.organization].filter(Boolean).join(", ")
              const copyText = `"${t.quote}" — ${attribution}`
              const isCopied = copiedId === id
              return (
                <div key={id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-200/60 dark:border-slate-700/40">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed flex-1">&ldquo;{t.quote}&rdquo;</p>
                    <button
                      onClick={() => handleCopy(id, copyText)}
                      className="shrink-0 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                      title="Copy testimonial"
                    >
                      {isCopied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">&mdash; {attribution}</p>
                  {t.notes && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400/80 mt-1.5 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-200/60 dark:border-amber-700/40">
                      <span className="font-medium">Internal note:</span> {t.notes}
                    </p>
                  )}
                  {t.status && t.status !== "approved" && (
                    <span className="mt-1 inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200/60 uppercase tracking-wider">{t.status}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-700/60 text-center">
          <Quote size={20} className="text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-xs text-slate-400 dark:text-slate-500">No testimonials on file</p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Ask AI to help draft a testimonial request email</p>
        </div>
      )}

      {/* Awards */}
      {mergedData.awards.length > 0 && (
        <div>
          <SectionHeader icon={Trophy} title="Awards" count={mergedData.awards.length} />
          <div className="border border-slate-200/60 dark:border-slate-700/40 rounded-xl overflow-hidden">
            {(mergedData.awards as Array<{ id?: string; name: string; year: number | string; issuingAgency?: string | null; awardLevel?: string | null }>).map((a, i) => {
              const id = a.id || `hc-a-${i}`
              return (
                <div key={id} className={`flex items-center gap-3 px-4 py-2.5 ${i < mergedData.awards.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}>
                  <Trophy size={13} className="text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate">{a.name}</p>
                    {a.issuingAgency && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{a.issuingAgency}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.awardLevel && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40">{a.awardLevel}</span>
                    )}
                    <span className="text-xs text-slate-400 dark:text-slate-500">{a.year}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Proposals */}
      {mergedData.proposals.length > 0 && (
        <div>
          <SectionHeader icon={Briefcase} title="Proposals" count={mergedData.proposals.length} />
          <div className="border border-slate-200/60 dark:border-slate-700/40 rounded-xl overflow-hidden">
            {(mergedData.proposals as Array<{ id?: string; date?: string | null; projectType?: string | null; category?: string | null; won?: string | null; servicesOffered?: string[] }>).map((p, i) => {
              const wonStatus = p.won ?? "Pending"
              const dateStr = p.date ? new Date(p.date).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—"
              return (
                <div key={p.id || `prop-${i}`} className={`px-4 py-2.5 ${i < mergedData.proposals.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-slate-200 font-medium truncate">
                        {p.projectType || p.category || "Proposal"}
                      </p>
                      {p.servicesOffered && p.servicesOffered.length > 0 && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                          {p.servicesOffered.slice(0, 4).join(", ")}{p.servicesOffered.length > 4 ? ` +${p.servicesOffered.length - 4}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-400 dark:text-slate-500">{dateStr}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${WON_COLORS[wonStatus] ?? WON_COLORS.Pending}`}>
                        {wonStatus}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Q&A Library */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Q&amp;A Library</span>
            {qaLinks.length > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400">
                {qaLinks.length}
              </span>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowLinkModal(true)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 border border-sky-200/60 dark:border-sky-800/40 transition-colors"
            >
              <Link2 size={11} strokeWidth={2.5} />
              Link Answer
            </button>
          )}
        </div>
        {qaLinksLoading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" />
            Loading linked answers…
          </div>
        ) : qaLinks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-700/60 text-center">
            <BookOpen size={20} className="text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-xs text-slate-400 dark:text-slate-500">No Q&amp;A answers linked yet</p>
            {isAdmin && (
              <button
                onClick={() => setShowLinkModal(true)}
                className="mt-2 text-[11px] text-sky-500 hover:text-sky-600 font-medium"
              >
                + Link an answer
              </button>
            )}
          </div>
        ) : (
          <div className="border border-slate-200/60 dark:border-slate-700/40 rounded-xl overflow-hidden">
            {qaLinks.map((link, i) => (
              <div
                key={link.linkId}
                className={`px-4 py-3 ${i < qaLinks.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
                      {link.question}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2">
                      {link.answer}
                    </p>
                    {link.topic && (
                      <span className="inline-block mt-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {link.topic}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-0.5">
                    <button
                      onClick={() => handleCopy(link.linkId, `Q: ${link.question}\n\nA: ${link.answer}`)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
                      title="Copy Q&A"
                    >
                      {copiedId === link.linkId ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleUnlinkQa(link.linkId)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Unlink"
                      >
                        <Link2Off size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* No assets empty state */}
      {mergedData.caseStudies.length === 0 && mergedData.results.length === 0 && mergedData.testimonials.length === 0 && mergedData.awards.length === 0 && mergedData.proposals.length === 0 && qaLinks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Briefcase size={28} className="text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No assets found for this client</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Use the Overview tab's AI to help identify what to gather</p>
        </div>
      )}

      {/* Link Answer Modal */}
      {showLinkModal && selectedClient && (
        <LinkAnswerModal
          clientName={selectedClient}
          alreadyLinked={qaLinks.map(l => l.answerId)}
          onClose={() => setShowLinkModal(false)}
          onLinked={async () => {
            setShowLinkModal(false)
            const fresh = await clientQaApi.list(selectedClient)
            setQaLinks(fresh)
          }}
        />
      )}
    </div>
  )
}
