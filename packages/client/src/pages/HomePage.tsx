import { useState, useEffect, useCallback, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  FileSpreadsheet,
  Image,
  Search,
  PenLine,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { DashboardWidgets } from "@/components/DashboardWidgets"
import { GuidedTour } from "@/components/tour"
import { useAuth } from "@/contexts/AuthContext"
import { getVisibleTiles, TileConfig } from "./Settings"
import { topicsApi, answersApi, photosApi, healthApi, proposalInsightsApi } from "@/lib/api"
import { clientSuccessData } from "@/data/clientSuccessData"

function getGreeting(firstName?: string): string {
  if (firstName) return `Hello ${firstName}`
  return "Hello"
}

// Stats-only phrases generator - returns objects with number and text separate
interface StatPhrase {
  number: string
  text: string
}

interface HomeStats {
  topics: number
  answers: number
  photos: number
  proposals: number
  winRate: number
}

function generateStatPhrases(stats: HomeStats): StatPhrase[] | null {
  const phrases: StatPhrase[] = []

  // Interleave sources: library, proposals, client success, library, client success...
  if (stats.answers > 0) {
    phrases.push({ number: stats.answers.toLocaleString(), text: " answers ready" })
  }
  if (stats.winRate > 0) {
    phrases.push({ number: `${Math.round(stats.winRate)}%`, text: " win rate" })
  }
  if (clientSuccessData.caseStudies.length > 0) {
    phrases.push({ number: clientSuccessData.caseStudies.length.toLocaleString(), text: " client results" })
  }
  if (stats.topics > 0) {
    phrases.push({ number: stats.topics.toLocaleString(), text: " topics covered" })
  }
  if (stats.proposals > 0) {
    phrases.push({ number: stats.proposals.toLocaleString(), text: " proposals tracked" })
  }
  if (clientSuccessData.testimonials.length > 0) {
    phrases.push({ number: clientSuccessData.testimonials.length.toLocaleString(), text: " testimonials" })
  }
  if (stats.photos > 0) {
    phrases.push({ number: stats.photos.toLocaleString(), text: " photos available" })
  }
  if (clientSuccessData.awards.length > 0) {
    phrases.push({ number: clientSuccessData.awards.length.toLocaleString(), text: " awards won" })
  }

  return phrases.length > 0 ? phrases : null
}

// Fallback when no stats available
const fallbackGreeting = "Ready to win"

type TypewriterPhase = "typing" | "waiting" | "deleting"

function TypewriterText({ phrases }: { phrases: StatPhrase[] }) {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const [phase, setPhase] = useState<TypewriterPhase>("typing")
  const [isReady, setIsReady] = useState(false)

  // Get current phrase safely
  const safeIndex = phraseIndex % phrases.length
  const currentPhrase = phrases[safeIndex] ?? phrases[0]!
  const fullText = currentPhrase!.number + currentPhrase!.text
  const numberLength = currentPhrase!.number.length

  // Initial mount - start after a brief delay to prevent glitch
  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!isReady) return

    let timeout: ReturnType<typeof setTimeout>

    if (phase === "typing") {
      if (charIndex < fullText.length) {
        timeout = setTimeout(() => {
          setCharIndex(prev => prev + 1)
        }, 75)
      } else {
        setPhase("waiting")
      }
    } else if (phase === "waiting") {
      timeout = setTimeout(() => {
        setPhase("deleting")
      }, 4000)
    } else if (phase === "deleting") {
      if (charIndex > 0) {
        timeout = setTimeout(() => {
          setCharIndex(prev => prev - 1)
        }, 40)
      } else {
        // Move to next phrase
        setPhraseIndex(prev => (prev + 1) % phrases.length)
        setPhase("typing")
      }
    }

    return () => clearTimeout(timeout)
  }, [charIndex, phase, fullText.length, phrases.length, isReady])

  // Don't render anything until ready
  if (!isReady) {
    return <span className="inline-block min-h-[1.2em]" />
  }

  const showCursor = phase === "typing" || phase === "deleting"

  // Split displayed text into number part (red) and text part (black)
  const displayedNumber = fullText.slice(0, Math.min(charIndex, numberLength))
  const displayedText = charIndex > numberLength ? fullText.slice(numberLength, charIndex) : ""

  return (
    <span className="relative inline-block">
      <span className="bg-gradient-to-r from-red-500 to-rose-600 bg-clip-text text-transparent">
        {displayedNumber}
      </span>
      <span className="text-slate-900 dark:text-white">
        {displayedText}
      </span>
      {showCursor && (
        <span className="inline-block w-[3px] h-[1em] ml-1 align-middle bg-gradient-to-b from-red-500 to-rose-600 animate-blink" />
      )}
    </span>
  )
}

interface CardProps {
  to: string
  icon: React.ReactNode
  title: string
  description: string
  gradient: string
  shadowColor: string
  badge?: string
  id?: string
}

function Card({ to, icon, title, description, gradient, shadowColor, badge, onClick, dataTour }: CardProps & { onClick?: () => void; dataTour?: string }) {
  const [isHovered, setIsHovered] = useState(false)
  const className = "group relative block rounded-2xl p-6 cursor-pointer bg-white dark:bg-slate-900 border border-black/[0.04] dark:border-white/[0.06] transition-all duration-[350ms] ease-out hover:-translate-y-1 active:translate-y-0 active:scale-[0.99]"
  const style = { boxShadow: '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.02)' }
  const handleMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
    setIsHovered(true)
    e.currentTarget.style.boxShadow = `0 0 0 1px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.04), 0 12px 24px ${shadowColor}, 0 24px 48px rgb(0 0 0 / 0.03)`
  }
  const handleMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
    setIsHovered(false)
    e.currentTarget.style.boxShadow = '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.02)'
  }

  const glowElement = (
    <div
      className="absolute -inset-1 rounded-2xl blur-2xl transition-opacity duration-500 -z-10"
      style={{ backgroundColor: shadowColor, opacity: isHovered ? 0.5 : 0 }}
    />
  )

  const children = (
    <>
      {glowElement}
      {badge && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-teal-500 text-white rounded-full shadow-lg animate-pulse">
            {badge}
          </span>
        </div>
      )}
      <div
        className="relative w-12 h-12 rounded-xl flex items-center justify-center mb-5 overflow-hidden transition-transform duration-300 ease-out group-hover:scale-110"
        style={{ background: gradient }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent" />
        <div className="relative text-white">{icon}</div>
      </div>
      <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white tracking-[-0.01em] mb-1.5 transition-colors">{title}</h3>
      <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-relaxed transition-colors">{description}</p>
      <div className="mt-5 flex items-center text-[13px] font-medium text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors duration-200">
        <span>Open</span>
        <ArrowRight size={14} className="ml-1.5 transition-transform duration-200 ease-out group-hover:translate-x-1" strokeWidth={2} />
      </div>
    </>
  )

  if (onClick) {
    return (
      <div role="button" tabIndex={0} onClick={onClick} className={className} style={style} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} data-tour={dataTour}>
        {children}
      </div>
    )
  }

  return (
    <Link to={to} className={className} style={style} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} data-tour={dataTour}>
      {children}
    </Link>
  )
}

// Default card configurations (used as fallback if settings fail)
const defaultCards = [
  {
    id: "ask-ai",
    to: "/ai",
    icon: <Sparkles size={22} strokeWidth={2} />,
    title: "Ask AI",
    description: "Get AI-powered answers from your approved content",
    gradient: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
    shadowColor: "rgba(139, 92, 246, 0.15)",
  },
  {
    id: "search-library",
    to: "/search",
    icon: <Search size={22} strokeWidth={2} />,
    title: "Search Library",
    description: "Find and copy approved answers and photos instantly",
    gradient: "linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)",
    shadowColor: "rgba(16, 185, 129, 0.15)",
  },
  {
    id: "import-data",
    to: "/import",
    icon: <FileSpreadsheet size={22} strokeWidth={2} />,
    title: "Import Data",
    description: "Bulk import Q&A content from Excel spreadsheets",
    gradient: "linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)",
    shadowColor: "rgba(59, 130, 246, 0.15)",
  },
  {
    id: "new-entry",
    to: "/new",
    icon: <PenLine size={22} strokeWidth={2} />,
    title: "New Entry",
    description: "Manually add individual entries to the library",
    gradient: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
    shadowColor: "rgba(99, 102, 241, 0.15)",
  },
  {
    id: "photo-library",
    to: "/photos",
    icon: <Image size={22} strokeWidth={2} />,
    title: "Photo Library",
    description: "Upload, organize, and manage proposal images",
    gradient: "linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)",
    shadowColor: "rgba(245, 158, 11, 0.15)",
  },
  {
    id: "proposal-insights",
    to: "/insights",
    icon: <TrendingUp size={22} strokeWidth={2} />,
    title: "Proposal Insights",
    description: "AI-powered analytics on your proposal win rates and trends",
    gradient: "linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)",
    shadowColor: "rgba(6, 182, 212, 0.15)",
    badge: "NEW",
  },
]

// Load cached stats from localStorage
function loadCachedStats(): HomeStats {
  try {
    const cached = localStorage.getItem("stamats-library-stats")
    if (cached) {
      const parsed = JSON.parse(cached)
      return { topics: 0, answers: 0, photos: 0, proposals: 0, winRate: 0, ...parsed }
    }
  } catch {
    // Ignore parse errors
  }
  return { topics: 0, answers: 0, photos: 0, proposals: 0, winRate: 0 }
}

// Save stats to localStorage
function saveCachedStats(stats: HomeStats) {
  try {
    localStorage.setItem("stamats-library-stats", JSON.stringify(stats))
  } catch {
    // Ignore storage errors
  }
}

export function HomePage() {
  const { user, markTourCompleted } = useAuth()
  const [showTour, setShowTour] = useState(false)
  const firstName = user?.name?.split(" ")[0]

  // Trigger tour for users who haven't completed it
  useEffect(() => {
    if (user && user.hasCompletedTour === false) {
      const timer = setTimeout(() => setShowTour(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [user])
  const greeting = getGreeting(firstName)
  const [visibleCards, setVisibleCards] = useState<TileConfig[]>(() => {
    try {
      return getVisibleTiles()
    } catch {
      return defaultCards as TileConfig[]
    }
  })
  // Initialize from cached stats
  const [stats, setStats] = useState(loadCachedStats)
  const [systemStatus, setSystemStatus] = useState<"checking" | "online" | "degraded" | "offline">("checking")

  // Fetch real stats from API and cache them, plus check health
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [topicsRes, answersRes, photosRes, health, syncStatus] = await Promise.all([
          topicsApi.getAll().catch(() => []),
          answersApi.getAll().catch(() => []),
          photosApi.getAll().catch(() => []),
          healthApi.check().catch(() => null),
          proposalInsightsApi.getSyncStatus().catch(() => null),
        ])

        // Get win rate from metrics if we have proposals
        let winRate = 0
        if (syncStatus && syncStatus.totalProposals > 0) {
          try {
            const metrics = await proposalInsightsApi.getMetrics()
            winRate = metrics.summary?.winRate ?? 0
          } catch {
            // Metrics not available
          }
        }

        const newStats: HomeStats = {
          topics: Array.isArray(topicsRes) ? topicsRes.length : 0,
          answers: Array.isArray(answersRes) ? answersRes.length : 0,
          photos: Array.isArray(photosRes) ? photosRes.length : 0,
          proposals: syncStatus?.totalProposals ?? 0,
          winRate,
        }
        // Only update if we got real data
        if (newStats.answers > 0 || newStats.topics > 0 || newStats.photos > 0 || newStats.proposals > 0) {
          setStats(newStats)
          saveCachedStats(newStats)
        }
        // Set system status
        if (health && health.status === "ok") {
          setSystemStatus("online")
        } else if (health) {
          setSystemStatus("degraded")
        } else {
          setSystemStatus("offline")
        }
      } catch {
        setSystemStatus("offline")
      }
    }
    fetchStats()
  }, [])

  // Generate phrases based on stats (returns null if no stats)
  const typewriterPhrases = useMemo(() => {
    return generateStatPhrases(stats)
  }, [stats])

  // Listen for settings changes
  const handleSettingsChange = useCallback(() => {
    try {
      setVisibleCards(getVisibleTiles())
    } catch {
      setVisibleCards(defaultCards as TileConfig[])
    }
  }, [])

  useEffect(() => {
    window.addEventListener("settings-changed", handleSettingsChange)
    return () => window.removeEventListener("settings-changed", handleSettingsChange)
  }, [handleSettingsChange])

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 transition-colors duration-300">
      <AppHeader />

      {/* Hero */}
      <section className="pt-20 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <p className="text-[13px] font-medium text-slate-400 dark:text-slate-500 tracking-widest uppercase animate-fade-in transition-colors">
              {greeting}
            </p>
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full
                border transition-all duration-500 ease-out
                ${systemStatus === "checking"
                  ? "bg-slate-50 dark:bg-slate-800/50 border-slate-200/60 dark:border-slate-700/60 opacity-50"
                  : systemStatus === "online"
                    ? "bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800/40 opacity-100"
                    : systemStatus === "degraded"
                      ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/40 opacity-100"
                      : "bg-red-50/80 dark:bg-red-950/40 border-red-200/60 dark:border-red-800/40 opacity-100"
                }`}
            >
              <span className="relative flex h-2.5 w-2.5">
                {systemStatus === "online" && (
                  <span className="absolute inset-0 rounded-full bg-emerald-400 dark:bg-emerald-400 animate-ping opacity-75" />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-500
                  ${systemStatus === "online"
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : systemStatus === "degraded"
                      ? "bg-amber-500 dark:bg-amber-400"
                      : systemStatus === "offline"
                        ? "bg-red-500 dark:bg-red-400"
                        : "bg-slate-300 dark:bg-slate-600"
                  }`}
                />
              </span>
              <span className={`text-[11px] font-medium uppercase tracking-wider transition-colors duration-500
                ${systemStatus === "online"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : systemStatus === "degraded"
                    ? "text-amber-600 dark:text-amber-400"
                    : systemStatus === "offline"
                      ? "text-red-500 dark:text-red-400"
                      : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {systemStatus === "checking" ? "..." : systemStatus === "online" ? "Connected" : systemStatus === "degraded" ? "Degraded" : "Contact support"}
              </span>
            </div>
          </div>
          <h1 className="text-[42px] font-semibold text-slate-900 dark:text-white tracking-[-0.03em] leading-[1.1] transition-colors">
            {typewriterPhrases ? (
              <TypewriterText phrases={typewriterPhrases} />
            ) : (
              <span className="bg-gradient-to-r from-red-500 to-rose-600 bg-clip-text text-transparent">
                {fallbackGreeting}
              </span>
            )}
          </h1>
        </div>
      </section>

      {/* Main Grid */}
      <main className="flex-1 px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          {/* Dashboard Widgets */}
          <DashboardWidgets />

          {/* Action Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
            {visibleCards.map((card) => (
              <Card
                key={card.id || card.to}
                {...card}
                dataTour={card.id}
                onClick={card.id === "new-entry" ? () => window.dispatchEvent(new CustomEvent("open-new-entry")) : undefined}
              />
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 px-6 border-t border-black/[0.04] dark:border-white/[0.06] bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm transition-colors">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[13px] text-slate-400 dark:text-slate-500 transition-colors">
            © {new Date().getFullYear()} Stamats
          </p>
        </div>
      </footer>

      <GuidedTour
        isOpen={showTour}
        onComplete={() => {
          setShowTour(false)
          markTourCompleted()
        }}
      />
    </div>
  )
}
