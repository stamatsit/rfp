import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import {
  FileSpreadsheet,
  Image,
  Search,
  PenLine,
  Sparkles,
  ArrowRight,
  FileSearch,
  LogOut,
} from "lucide-react"
import { AppHeader } from "@/components/AppHeader"
import { useAuth } from "@/contexts/AuthContext"

// Dynamic greeting based on time of day
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

// Random phrases for typewriter - one is chosen on page load
const typewriterPhrases = [
  "win more work",
  "find answers fast",
  "crush that RFP",
  "close the deal",
  "make it happen",
  "seal the win",
  "land the contract",
  "get it done",
  "own the pitch",
  "nail the proposal",
]

// Pick a random phrase once on module load
const randomPhrase = typewriterPhrases[Math.floor(Math.random() * typewriterPhrases.length)] as string

function TypewriterText() {
  const [displayedText, setDisplayedText] = useState("")
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    if (isComplete) return

    if (displayedText.length < randomPhrase.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(randomPhrase.slice(0, displayedText.length + 1))
      }, 75)
      return () => clearTimeout(timeout)
    } else {
      setIsComplete(true)
    }
  }, [displayedText, isComplete])

  return (
    <span className="relative inline-block">
      <span
        className="bg-gradient-to-r from-red-500 to-rose-600 bg-clip-text text-transparent"
      >
        {displayedText}
      </span>
      {/* Blinking cursor - hide when animation is complete */}
      {!isComplete && (
        <span
          className="inline-block w-[3px] h-[1em] ml-1 align-middle bg-gradient-to-b from-red-500 to-rose-600 animate-blink"
        />
      )}
      {/* Subtle glow effect */}
      <span
        className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 opacity-15 blur-2xl -z-10"
      />
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
}

function Card({ to, icon, title, description, gradient, shadowColor }: CardProps) {
  return (
    <Link
      to={to}
      className="group relative block rounded-2xl p-6
                 bg-white dark:bg-slate-900 border border-black/[0.04] dark:border-white/[0.06]
                 transition-all duration-[350ms] ease-out
                 hover:-translate-y-1 active:translate-y-0 active:scale-[0.99]"
      style={{
        boxShadow: '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.02)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 1px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.04), 0 12px 24px ${shadowColor}, 0 24px 48px rgb(0 0 0 / 0.03)`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 1px rgb(0 0 0 / 0.02), 0 1px 2px rgb(0 0 0 / 0.03), 0 4px 8px rgb(0 0 0 / 0.02)'
      }}
    >
      {/* Icon container with gradient */}
      <div
        className="relative w-12 h-12 rounded-xl flex items-center justify-center mb-5 overflow-hidden
                   transition-transform duration-300 ease-out group-hover:scale-110"
        style={{ background: gradient }}
      >
        {/* Inner highlight */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/25 to-transparent" />
        <div className="relative text-white">
          {icon}
        </div>
      </div>

      {/* Content */}
      <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white tracking-[-0.01em] mb-1.5 transition-colors">
        {title}
      </h3>
      <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-relaxed transition-colors">
        {description}
      </p>

      {/* Action indicator */}
      <div className="mt-5 flex items-center text-[13px] font-medium text-slate-400 dark:text-slate-500
                      group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors duration-200">
        <span>Open</span>
        <ArrowRight
          size={14}
          className="ml-1.5 transition-transform duration-200 ease-out group-hover:translate-x-1"
          strokeWidth={2}
        />
      </div>
    </Link>
  )
}

// Card configurations with refined gradients
const cards = [
  {
    to: "/ai",
    icon: <Sparkles size={22} strokeWidth={2} />,
    title: "Ask AI",
    description: "Get AI-powered answers from your approved content",
    gradient: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
    shadowColor: "rgba(139, 92, 246, 0.15)",
  },
  {
    to: "/search",
    icon: <Search size={22} strokeWidth={2} />,
    title: "Search Library",
    description: "Find and copy approved answers and photos instantly",
    gradient: "linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)",
    shadowColor: "rgba(16, 185, 129, 0.15)",
  },
  {
    to: "/import",
    icon: <FileSpreadsheet size={22} strokeWidth={2} />,
    title: "Import Data",
    description: "Bulk import Q&A content from Excel spreadsheets",
    gradient: "linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)",
    shadowColor: "rgba(59, 130, 246, 0.15)",
  },
  {
    to: "/new",
    icon: <PenLine size={22} strokeWidth={2} />,
    title: "New Entry",
    description: "Manually add individual Q&A entries to the library",
    gradient: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
    shadowColor: "rgba(99, 102, 241, 0.15)",
  },
  {
    to: "/photos",
    icon: <Image size={22} strokeWidth={2} />,
    title: "Photo Library",
    description: "Upload, organize, and manage proposal images",
    gradient: "linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)",
    shadowColor: "rgba(245, 158, 11, 0.15)",
  },
  {
    to: "/analyze",
    icon: <FileSearch size={22} strokeWidth={2} />,
    title: "RFP Analyzer",
    description: "Upload RFPs and auto-match to your library content",
    gradient: "linear-gradient(135deg, #F43F5E 0%, #E11D48 50%, #BE123C 100%)",
    shadowColor: "rgba(244, 63, 94, 0.15)",
  },
]

export function HomePage() {
  const greeting = getGreeting()
  const { logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 transition-colors duration-300">
      <AppHeader />

      {/* Hero */}
      <section className="pt-20 pb-12 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-[13px] font-medium text-slate-400 dark:text-slate-500 tracking-widest uppercase mb-3 animate-fade-in transition-colors">
            {greeting}
          </p>
          <h1 className="text-[42px] font-semibold text-slate-900 dark:text-white tracking-[-0.03em] leading-[1.1] transition-colors">
            Let's <TypewriterText />
          </h1>
        </div>
      </section>

      {/* Main Grid */}
      <main className="flex-1 px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
            {cards.map((card) => (
              <Card key={card.to} {...card} />
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-5 px-6 border-t border-black/[0.04] dark:border-white/[0.06] bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm transition-colors">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <p className="text-[13px] text-slate-400 dark:text-slate-500 transition-colors">
            © {new Date().getFullYear()} Stamats
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/support"
              className="text-[13px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200"
            >
              Get Support
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-[13px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}
