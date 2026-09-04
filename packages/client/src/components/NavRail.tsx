import { useLocation, useNavigate } from "react-router-dom"
import {
  Activity,
  Home,
  Search,
  Sparkles,
  FileEdit,
  Wand2,
  Quote,
  Building2,
  ImageDown,
  Presentation,
  Mic,
  BarChart3,
  ScanSearch,
} from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useState, useEffect } from "react"
import { ERIC_ONLY, MIGRATION_MATRIX_ALLOW, canAccess } from "@/lib/featureAccess"

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
  emailAllow?: readonly string[]
  settingKey?: string
}

const SETTINGS_KEY = "stamats-app-settings"

const NAV_ITEMS: NavItem[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/search", icon: Search, label: "Search Library" },
  { to: "/ai", icon: Sparkles, label: "AI Tools" },
  { to: "/clients", icon: Building2, label: "Client Portfolio" },
  { to: "/studio", icon: FileEdit, label: "Document Studio" },
  { to: "/humanize", icon: Wand2, label: "AI Humanizer" },
  { to: "/testimonials", icon: Quote, label: "Testimonials & Awards" },
  { to: "/convert", icon: ImageDown, label: "Image Toolkit" },
  { to: "/meetings", icon: Mic, label: "Meeting Intake" },
  { to: "/analytics", icon: BarChart3, label: "Proposal Analytics" },
  { to: "/scanner", icon: ScanSearch, label: "URL Scanner", settingKey: "urlScannerEnabled" },
  { to: "/pitch-deck", icon: Presentation, label: "Pitch Deck Designer", emailAllow: ERIC_ONLY },
  { to: "/migration", icon: Activity, label: "Migration Matrix", emailAllow: MIGRATION_MATRIX_ALLOW },
]

export function NavRail() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [settings, setSettings] = useState<Record<string, unknown>>({})

  useEffect(() => {
    try { setSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")) } catch {}
    const handler = () => { try { setSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")) } catch {} }
    window.addEventListener("settings-changed", handler)
    return () => window.removeEventListener("settings-changed", handler)
  }, [])

  const visibleItems = NAV_ITEMS.filter(item => {
    if (item.emailAllow && !canAccess(item.emailAllow, user?.email)) return false
    if (item.settingKey && !settings[item.settingKey]) return false
    return true
  })

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-14 z-[150] flex flex-col pt-2 bg-white dark:bg-slate-900 border-r border-black/[0.06] dark:border-white/[0.06]">
      {visibleItems.map(item => {
        const Icon = item.icon
        const isActive = item.to === "/"
          ? location.pathname === "/"
          : location.pathname.startsWith(item.to)

        return (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            title={item.label}
            className={`relative flex items-center justify-center h-11 w-full mx-auto transition-all duration-150 ease-out
              focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950
              ${isActive
                ? "text-slate-900 dark:text-white"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              }`}
          >
            {isActive && (
              <span className="absolute left-0 top-2.5 bottom-2.5 w-[2.5px] rounded-r-full bg-slate-800 dark:bg-slate-100" />
            )}
            <span className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 ${isActive ? "bg-slate-100 dark:bg-slate-800" : ""}`}>
              <Icon size={17} strokeWidth={isActive ? 2.2 : 1.8} />
            </span>
          </button>
        )
      })}
    </aside>
  )
}
