import { useState, useRef, useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ChevronRight, Sun, Moon, Settings, HelpCircle, LifeBuoy, LogOut, ChevronDown, Bot } from "lucide-react"
import { useTheme } from "@/contexts/ThemeContext"
import { useAuth } from "@/contexts/AuthContext"
import { SettingsPanel, loadSettings, saveSettings } from "./SettingsPanel"
import { UserAvatar } from "./UserAvatar"

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
  "/search": { title: "Search Library" },
  "/ai": { title: "Ask AI" },
  "/import": { title: "Import Data" },
  "/photos": { title: "Photo Library" },
  "/new": { title: "New Entry" },
  "/analyze": { title: "Document Scanner" },
  "/help": { title: "Help" },
  "/support": { title: "Support" },
  "/settings": { title: "Settings" },
  "/case-studies": { title: "Client Success" },
  "/insights": { title: "Proposal Insights" },
  "/unified-ai": { title: "Unified AI" },
  "/testimonials": { title: "Testimonials" },
  "/studio": { title: "Document Studio" },
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  const handleToggle = () => {
    const newTheme = isDark ? "light" : "dark"
    toggleTheme()
    const current = loadSettings()
    saveSettings({ ...current, theme: newTheme })
  }

  return (
    <button
      onClick={handleToggle}
      className="relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none bg-slate-200 dark:bg-slate-700"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full flex items-center justify-center transition-transform duration-200 bg-white dark:bg-slate-500 shadow-sm ${
          isDark ? 'translate-x-5' : 'translate-x-0'
        }`}
      >
        {isDark ? (
          <Moon size={10} className="text-slate-200" strokeWidth={2.5} />
        ) : (
          <Sun size={10} className="text-amber-500" strokeWidth={2.5} />
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
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const isHomePage = location.pathname === "/"
  const currentPage = pageConfig[location.pathname]
  const displayTitle = title || currentPage?.title

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }
    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isUserMenuOpen])

  // Generate default breadcrumbs if not provided
  const defaultBreadcrumbs: BreadcrumbItem[] = isHomePage
    ? []
    : [
        { label: "Library", href: "/" },
        { label: displayTitle || "Page" },
      ]

  const displayBreadcrumbs = breadcrumbs || defaultBreadcrumbs

  return (
    <header className="sticky top-0 z-[200] backdrop-blur-premium border-b border-black/[0.05] dark:border-white/[0.08] transition-colors duration-300"
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
              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div className="hidden sm:block">
              <span className="text-[15px] font-semibold text-slate-900 dark:text-white tracking-[-0.02em] block leading-none transition-colors">
                Stamats
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 tracking-wide block mt-0.5 transition-colors">
                Content Library
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

            {/* Ask AI — icon only */}
            {showAskAI && location.pathname !== "/ai" && (
              <Link
                to="/ai"
                className="text-violet-500 dark:text-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors duration-200 active:scale-95"
                title="Ask AI"
              >
                <Bot size={20} strokeWidth={2} />
              </Link>
            )}

            {/* User Menu */}
            {user && (
              <div ref={userMenuRef} className="relative">
                <button
                  data-tour="settings"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className={`hidden sm:flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all duration-200
                             hover:bg-slate-100/80 dark:hover:bg-slate-800/80
                             ${isUserMenuOpen ? "bg-slate-100 dark:bg-slate-800" : ""}`}
                >
                  <UserAvatar user={user} size="sm" />
                  <span className="text-[13px] text-slate-600 dark:text-slate-400 font-medium">
                    {user.name}
                  </span>
                  <ChevronDown size={14} className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 ${isUserMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {/* Dropdown */}
                {isUserMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1.5 w-52 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg shadow-black/10 dark:shadow-black/30 z-[100]"
                  >
                    {/* User info header */}
                    <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700">
                      <p className="text-[13px] font-medium text-slate-900 dark:text-white">{user.name}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">{user.email}</p>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => { setIsUserMenuOpen(false); setIsSettingsOpen(true) }}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <Settings size={15} className="text-slate-400 dark:text-slate-500" />
                        Settings
                      </button>
                      <button
                        onClick={() => { setIsUserMenuOpen(false); navigate("/help") }}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <HelpCircle size={15} className="text-slate-400 dark:text-slate-500" />
                        Help
                      </button>
                      <button
                        onClick={() => { setIsUserMenuOpen(false); navigate("/support") }}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <LifeBuoy size={15} className="text-slate-400 dark:text-slate-500" />
                        Support
                      </button>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-700 pt-1">
                      <button
                        onClick={() => { setIsUserMenuOpen(false); logout() }}
                        className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[13px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <LogOut size={15} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <SettingsPanel isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
          </div>
        </div>
      </div>
    </header>
  )
}
