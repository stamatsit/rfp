import { useLocation, useNavigate } from "react-router-dom"
import {
  Home,
  Search,
  Sparkles,
  FileEdit,
  Wand2,
  Quote,
} from "lucide-react"

interface NavItem {
  to: string
  icon: React.ElementType
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/search", icon: Search, label: "Search Library" },
  { to: "/ai", icon: Sparkles, label: "AI Tools" },
  { to: "/studio", icon: FileEdit, label: "Document Studio" },
  { to: "/humanize", icon: Wand2, label: "AI Humanizer" },
  { to: "/testimonials", icon: Quote, label: "Testimonials & Awards" },
]

export function NavRail() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-14 z-[150] flex flex-col pt-2 bg-white dark:bg-slate-900 border-r border-black/[0.06] dark:border-white/[0.06]">
      {NAV_ITEMS.map(item => {
        const Icon = item.icon
        const isActive = item.to === "/"
          ? location.pathname === "/"
          : location.pathname.startsWith(item.to)

        return (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            title={item.label}
            className={`relative flex items-center justify-center h-11 w-full mx-auto transition-colors duration-150
              ${isActive
                ? "text-slate-900 dark:text-white"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
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
