import { Link, useLocation } from "react-router-dom"
import { ChevronRight, Sparkles, HelpCircle, Sun, Moon } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"

interface BreadcrumbItem {
  label: string
  href?: string
}

interface AppHeaderProps {
  title?: string
  breadcrumbs?: BreadcrumbItem[]
  showAskAI?: boolean
}

// Page metadata for automatic breadcrumb generation
const pageConfig: Record<string, { title: string }> = {
  "/": { title: "Content Library" },
  "/search": { title: "Search" },
  "/ai": { title: "Ask AI" },
  "/import": { title: "Import" },
  "/photos": { title: "Photos" },
  "/new": { title: "New Entry" },
  "/analyze": { title: "Analyzer" },
  "/documents": { title: "Documents" },
  "/help": { title: "Help" },
  "/support": { title: "Support" },
}

// Beautiful dark mode toggle component
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      onClick={toggleTheme}
      className="relative w-14 h-8 rounded-full p-1 transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
      style={{
        background: isDark
          ? 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
          : 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
        boxShadow: isDark
          ? 'inset 0 2px 4px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)'
          : 'inset 0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
      }}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {/* Stars for dark mode */}
      <div className={`absolute inset-0 overflow-hidden rounded-full transition-opacity duration-300 ${isDark ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute top-1.5 left-2 w-0.5 h-0.5 bg-white/60 rounded-full" />
        <div className="absolute top-3 left-3.5 w-1 h-1 bg-white/40 rounded-full" />
        <div className="absolute bottom-2 left-2.5 w-0.5 h-0.5 bg-white/50 rounded-full" />
      </div>

      {/* Sun rays for light mode */}
      <div className={`absolute inset-0 overflow-hidden rounded-full transition-opacity duration-300 ${isDark ? 'opacity-0' : 'opacity-100'}`}>
        <div className="absolute top-1 right-3 w-1 h-1 bg-amber-400/60 rounded-full" />
        <div className="absolute bottom-1.5 right-2 w-0.5 h-0.5 bg-amber-400/40 rounded-full" />
      </div>

      {/* Toggle knob */}
      <div
        className={`relative w-6 h-6 rounded-full shadow-lg transition-all duration-300 ease-out flex items-center justify-center ${
          isDark ? 'translate-x-6' : 'translate-x-0'
        }`}
        style={{
          background: isDark
            ? 'linear-gradient(135deg, #334155 0%, #1e293b 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #fef3c7 100%)',
          boxShadow: isDark
            ? '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
            : '0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
        }}
      >
        {isDark ? (
          <Moon size={14} className="text-slate-300" strokeWidth={2} />
        ) : (
          <Sun size={14} className="text-amber-500" strokeWidth={2} />
        )}
      </div>
    </button>
  )
}

export function AppHeader({
  title,
  breadcrumbs,
  showAskAI = true,
}: AppHeaderProps) {
  const location = useLocation()
  const isHomePage = location.pathname === "/"
  const currentPage = pageConfig[location.pathname]
  const displayTitle = title || currentPage?.title

  // Generate default breadcrumbs if not provided
  const defaultBreadcrumbs: BreadcrumbItem[] = isHomePage
    ? []
    : [
        { label: "Library", href: "/" },
        { label: displayTitle || "Page" },
      ]

  const displayBreadcrumbs = breadcrumbs || defaultBreadcrumbs

  return (
    <header className="sticky top-0 z-50 backdrop-blur-premium border-b border-black/[0.03] dark:border-white/[0.06] transition-colors duration-300"
      style={{
        background: 'linear-gradient(to bottom, rgba(255,255,255,0.85), rgba(255,255,255,0.75))',
      }}
    >
      {/* Dark mode background override */}
      <div className="absolute inset-0 hidden dark:block transition-opacity duration-300"
        style={{
          background: 'linear-gradient(to bottom, rgba(15,23,42,0.95), rgba(15,23,42,0.9))',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="h-14 flex items-center justify-between">
          {/* Left - Logo */}
          <Link
            to="/"
            className="flex items-center gap-3 group relative"
          >
            {/* Logo with subtle hover animation */}
            <div className="relative">
              <img
                src="/stamats-logo.png"
                alt="Stamats"
                className="w-9 h-9 object-contain transition-all duration-300 ease-out group-hover:scale-105"
              />
              {/* Subtle glow on hover */}
              <div className="absolute inset-0 rounded-full bg-red-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div className="hidden sm:block">
              <span className="text-[15px] font-semibold text-slate-900 dark:text-white tracking-[-0.02em] block leading-none transition-colors">
                Stamats
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 tracking-wide block mt-0.5 transition-colors">
                RFPs & Proposals
              </span>
            </div>
          </Link>

          {/* Center - Breadcrumbs */}
          {!isHomePage && displayBreadcrumbs.length > 0 && (
            <nav className="absolute left-1/2 -translate-x-1/2 hidden md:block">
              <ol className="flex items-center gap-1 text-[13px]">
                {displayBreadcrumbs.map((crumb, index) => {
                  const isLast = index === displayBreadcrumbs.length - 1
                  return (
                    <li key={index} className="flex items-center">
                      {index > 0 && (
                        <ChevronRight
                          size={12}
                          className="mx-1 text-slate-300 dark:text-slate-600"
                          strokeWidth={2.5}
                        />
                      )}
                      {crumb.href && !isLast ? (
                        <Link
                          to={crumb.href}
                          className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors duration-200 px-1.5 py-0.5 rounded-md hover:bg-slate-100/80 dark:hover:bg-slate-800/80"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="text-slate-800 dark:text-white font-medium px-1.5 transition-colors">
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
            </nav>
          )}

          {/* Right - Actions */}
          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <ThemeToggle />

            {location.pathname !== "/help" && (
              <Link to="/help">
                <button
                  className="inline-flex items-center justify-center w-9 h-9
                             text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300
                             rounded-xl
                             transition-all duration-200 ease-out
                             hover:bg-slate-100/80 dark:hover:bg-slate-800/80 active:scale-95"
                  title="Help"
                >
                  <HelpCircle size={18} strokeWidth={1.75} />
                </button>
              </Link>
            )}
            {showAskAI && location.pathname !== "/ai" && (
              <Link to="/ai">
                <button
                  className="group relative inline-flex items-center gap-1.5 px-4 py-2
                             text-white text-[13px] font-medium
                             rounded-full overflow-hidden
                             transition-all duration-300 ease-out
                             active:scale-[0.97]"
                  style={{
                    background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)',
                    boxShadow: '0 1px 2px rgba(139, 92, 246, 0.3), 0 4px 12px rgba(139, 92, 246, 0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                  }}
                >
                  {/* Shimmer effect on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.1) 100%)',
                    }}
                  />
                  <Sparkles size={14} strokeWidth={2.5} className="relative z-10" />
                  <span className="relative z-10">Ask AI</span>
                </button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
