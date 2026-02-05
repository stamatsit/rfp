import { useState, useEffect, useRef } from "react"
import { AppHeader } from "@/components/AppHeader"
import { useTheme } from "@/contexts/ThemeContext"
import { useAuth } from "@/contexts/AuthContext"
import {
  FileSpreadsheet,
  Image,
  Search,
  PenLine,
  Sparkles,
  FileSearch,
  RotateCcw,
  Monitor,
  Moon,
  Sun,
  Check,
  Palette,
  LayoutGrid,
  Keyboard,
  Zap,
  Shield,
  Database,
  Trash2,
  Download,
  ChevronRight,
  Eye,
  Copy,
  Volume2,
  VolumeX,
  Clock,
  Type,
  Maximize2,
  MousePointer,
  Beaker,
  Command,
  Rocket,
  TrendingUp,
  Flame,
  Play,
  Target,
  MessageSquare,
  Award,
} from "lucide-react"

// Tile configuration - matches HomePage cards
export interface TileConfig {
  id: string
  to: string
  icon: React.ReactNode
  title: string
  description: string
  gradient: string
  shadowColor: string
  enabled: boolean
  badge?: string // Optional badge text (e.g., "NEW")
}

const defaultTiles: TileConfig[] = [
  {
    id: "ask-ai",
    to: "/ai",
    icon: <Sparkles size={22} strokeWidth={2} />,
    title: "Ask AI",
    description: "Get AI-powered answers from your approved content",
    gradient: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
    shadowColor: "rgba(139, 92, 246, 0.15)",
    enabled: true,
  },
  {
    id: "search-library",
    to: "/search",
    icon: <Search size={22} strokeWidth={2} />,
    title: "Search Library",
    description: "Find and copy approved answers and photos instantly",
    gradient: "linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)",
    shadowColor: "rgba(16, 185, 129, 0.15)",
    enabled: true,
  },
  {
    id: "import-data",
    to: "/import",
    icon: <FileSpreadsheet size={22} strokeWidth={2} />,
    title: "Import Data",
    description: "Bulk import Q&A content from Excel spreadsheets",
    gradient: "linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)",
    shadowColor: "rgba(59, 130, 246, 0.15)",
    enabled: true,
  },
  {
    id: "new-entry",
    to: "/new",
    icon: <PenLine size={22} strokeWidth={2} />,
    title: "New Entry",
    description: "Manually add individual Q&A entries to the library",
    gradient: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
    shadowColor: "rgba(99, 102, 241, 0.15)",
    enabled: true,
  },
  {
    id: "photo-library",
    to: "/photos",
    icon: <Image size={22} strokeWidth={2} />,
    title: "Photo Library",
    description: "Upload, organize, and manage proposal images",
    gradient: "linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)",
    shadowColor: "rgba(245, 158, 11, 0.15)",
    enabled: true,
  },
  {
    id: "rfp-analyzer",
    to: "/analyze",
    icon: <FileSearch size={22} strokeWidth={2} />,
    title: "RFP Analyzer",
    description: "Upload RFPs and auto-match to your library content",
    gradient: "linear-gradient(135deg, #F43F5E 0%, #E11D48 50%, #BE123C 100%)",
    shadowColor: "rgba(244, 63, 94, 0.15)",
    enabled: true,
  },
  {
    id: "proposal-insights",
    to: "/insights",
    icon: <TrendingUp size={22} strokeWidth={2} />,
    title: "Proposal Insights",
    description: "AI-powered analytics on your proposal win rates and trends",
    gradient: "linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)",
    shadowColor: "rgba(6, 182, 212, 0.15)",
    enabled: true,
    badge: "NEW",
  },
]

// Accent color presets
const accentColors = [
  { name: "Blue", value: "#3B82F6", gradient: "from-blue-500 to-blue-600" },
  { name: "Purple", value: "#8B5CF6", gradient: "from-purple-500 to-purple-600" },
  { name: "Pink", value: "#EC4899", gradient: "from-pink-500 to-pink-600" },
  { name: "Red", value: "#EF4444", gradient: "from-red-500 to-red-600" },
  { name: "Orange", value: "#F97316", gradient: "from-orange-500 to-orange-600" },
  { name: "Amber", value: "#F59E0B", gradient: "from-amber-500 to-amber-600" },
  { name: "Emerald", value: "#10B981", gradient: "from-emerald-500 to-emerald-600" },
  { name: "Teal", value: "#14B8A6", gradient: "from-teal-500 to-teal-600" },
  { name: "Cyan", value: "#06B6D4", gradient: "from-cyan-500 to-cyan-600" },
  { name: "Indigo", value: "#6366F1", gradient: "from-indigo-500 to-indigo-600" },
]

// Storage key for settings
const SETTINGS_KEY = "stamats-settings"
const STATS_KEY = "stamats-usage-stats"

export interface AppSettings {
  tiles: { id: string; enabled: boolean; order: number }[]
  theme: "light" | "dark" | "system"
  accentColor: string
  // AI Settings
  aiAutoSuggest: boolean
  aiShowSources: boolean
  aiResponseLength: "concise" | "balanced" | "detailed"
  // Search Settings
  searchResultsPerPage: number
  searchHighlightMatches: boolean
  searchIncludePhotos: boolean
  // Accessibility
  reduceMotion: boolean
  fontSize: "small" | "medium" | "large"
  highContrast: boolean
  // Notifications
  soundEnabled: boolean
  showCopyConfirmation: boolean
  // Data
  autoSaveInterval: number
  // Labs
  commandPaletteEnabled: boolean
  aiPoweredSearch: boolean
  smartSuggestions: boolean
  // Keyboard shortcuts
  shortcuts: Record<string, string>
}

interface UsageStats {
  searchesThisWeek: number
  aiQueriesThisWeek: number
  copiedAnswers: number
  photosViewed: number
  rfpsAnalyzed: number
  currentStreak: number
  longestStreak: number
  totalTimesSaved: number // in minutes
  lastActiveDate: string
  weeklyActivity: number[] // 7 days
  achievements: string[]
}

const defaultStats: UsageStats = {
  searchesThisWeek: 47,
  aiQueriesThisWeek: 23,
  copiedAnswers: 156,
  photosViewed: 89,
  rfpsAnalyzed: 12,
  currentStreak: 5,
  longestStreak: 14,
  totalTimesSaved: 340,
  lastActiveDate: new Date().toISOString(),
  weeklyActivity: [8, 12, 15, 9, 18, 22, 14],
  achievements: ["first-search", "ai-explorer", "speed-demon", "streak-starter"],
}

const defaultSettings: AppSettings = {
  tiles: defaultTiles.map((t, i) => ({ id: t.id, enabled: true, order: i })),
  theme: "system",
  accentColor: "#3B82F6",
  aiAutoSuggest: true,
  aiShowSources: true,
  aiResponseLength: "balanced",
  searchResultsPerPage: 25,
  searchHighlightMatches: true,
  searchIncludePhotos: true,
  reduceMotion: false,
  fontSize: "medium",
  highContrast: false,
  soundEnabled: false,
  showCopyConfirmation: true,
  autoSaveInterval: 0,
  commandPaletteEnabled: true,
  aiPoweredSearch: false,
  smartSuggestions: true,
  shortcuts: {
    search: "Cmd+K",
    ai: "Cmd+J",
    home: "Cmd+H",
    newEntry: "Cmd+N",
  },
}

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const tileIds = new Set(parsed.tiles?.map((t: { id: string }) => t.id) || [])
      const mergedTiles = [
        ...(parsed.tiles || []),
        ...defaultTiles
          .filter(t => !tileIds.has(t.id))
          .map((t, i) => ({ id: t.id, enabled: true, order: (parsed.tiles?.length || 0) + i }))
      ]
      return { ...defaultSettings, ...parsed, tiles: mergedTiles }
    }
  } catch (e) {
    console.error("Failed to load settings:", e)
  }
  return defaultSettings
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    // Apply accent color to CSS
    document.documentElement.style.setProperty('--accent-color', settings.accentColor)
    window.dispatchEvent(new CustomEvent("settings-changed", { detail: settings }))
  } catch (e) {
    console.error("Failed to save settings:", e)
  }
}

function loadStats(): UsageStats {
  try {
    const stored = localStorage.getItem(STATS_KEY)
    if (stored) return { ...defaultStats, ...JSON.parse(stored) }
  } catch (e) { /* ignore */ }
  return defaultStats
}

export function getVisibleTiles(): TileConfig[] {
  const settings = loadSettings()
  const enabledIds = new Set(settings.tiles.filter(t => t.enabled).map(t => t.id))
  const orderMap = new Map(settings.tiles.map(t => [t.id, t.order]))
  return defaultTiles
    .filter(t => enabledIds.has(t.id))
    .sort((a, b) => (orderMap.get(a.id) || 0) - (orderMap.get(b.id) || 0))
}

// Toggle Switch Component
function Toggle({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-all duration-200 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${enabled ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700"}`}
    >
      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${enabled ? "left-6" : "left-1"}`} />
    </button>
  )
}

// Setting Row Component
function SettingRow({ icon: Icon, title, description, children, onClick, badge }: {
  icon: React.ElementType; title: string; description?: string; children?: React.ReactNode; onClick?: () => void; badge?: string
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper onClick={onClick} className={`flex items-center gap-4 p-4 w-full text-left ${onClick ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer' : ''} transition-colors`}>
      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-slate-500 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[15px] font-medium text-slate-900 dark:text-white">{title}</p>
          {badge && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">
              {badge}
            </span>
          )}
        </div>
        {description && <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
      {children}
      {onClick && <ChevronRight size={16} className="text-slate-400" />}
    </Wrapper>
  )
}

// Section Component
function Section({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3 px-1">
        <h2 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.08em]">{title}</h2>
        {badge && (
          <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full animate-pulse">
            {badge}
          </span>
        )}
      </div>
      <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
        {children}
      </div>
    </div>
  )
}

// Segmented Control Component
function SegmentedControl<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 gap-1">
      {options.map(option => (
        <button key={option.value} onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 text-[13px] font-medium rounded-md transition-all duration-200 ${value === option.value ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// Command Palette Demo
function CommandPaletteDemo({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = [
    { icon: Search, label: "Search Library", shortcut: "Cmd+K", action: "/search" },
    { icon: Sparkles, label: "Ask AI", shortcut: "Cmd+J", action: "/ai" },
    { icon: PenLine, label: "New Entry", shortcut: "Cmd+N", action: "/new" },
    { icon: FileSpreadsheet, label: "Import Data", shortcut: "Cmd+I", action: "/import" },
    { icon: Image, label: "Photo Library", shortcut: "Cmd+P", action: "/photos" },
    { icon: FileSearch, label: "RFP Analyzer", shortcut: "Cmd+R", action: "/analyze" },
    { icon: Moon, label: "Toggle Dark Mode", shortcut: "Cmd+D", action: "theme" },
  ]

  const filtered = commands.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
          <Command size={20} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-[16px] text-slate-900 dark:text-white placeholder-slate-400 outline-none"
          />
          <kbd className="px-2 py-1 text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon
            return (
              <button
                key={cmd.label}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                  i === 0 ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  i === 0 ? "bg-blue-100 dark:bg-blue-800/30" : "bg-slate-100 dark:bg-slate-800"
                }`}>
                  <Icon size={18} className={i === 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-500"} />
                </div>
                <span className={`flex-1 text-[15px] font-medium ${
                  i === 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"
                }`}>
                  {cmd.label}
                </span>
                <kbd className="px-2 py-1 text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded">
                  {cmd.shortcut}
                </kbd>
              </button>
            )
          })}
        </div>
        <div className="p-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-[12px] text-slate-500 text-center">
            Press <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-200 dark:bg-slate-700 rounded">Enter</kbd> to select, <kbd className="px-1.5 py-0.5 text-[10px] bg-slate-200 dark:bg-slate-700 rounded">Arrow keys</kbd> to navigate
          </p>
        </div>
      </div>
    </div>
  )
}

// Navigation categories
type SettingsCategory = "appearance" | "home" | "ai" | "search" | "accessibility" | "data" | "labs"

const categories = [
  { id: "appearance" as const, label: "Appearance", icon: Palette },
  { id: "home" as const, label: "Home Screen", icon: LayoutGrid },
  { id: "ai" as const, label: "AI Assistant", icon: Sparkles },
  { id: "search" as const, label: "Search", icon: Search },
  { id: "accessibility" as const, label: "Accessibility", icon: Eye },
  { id: "labs" as const, label: "Labs", icon: Beaker },
  { id: "data" as const, label: "Data & Storage", icon: Database },
]

export function Settings() {
  const { setTheme } = useTheme()
  const { logout } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [stats] = useState<UsageStats>(() => loadStats())
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("appearance")
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const newSettings = { ...prev, [key]: value }
      saveSettings(newSettings)
      return newSettings
    })
  }

  const toggleTile = (id: string) => {
    const newTiles = settings.tiles.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t)
    updateSetting("tiles", newTiles)
  }

  const resetAllSettings = () => {
    setSettings(defaultSettings)
    saveSettings(defaultSettings)
    setTheme("light")
    setShowResetConfirm(false)
  }

  const exportSettings = () => {
    const dataStr = JSON.stringify(settings, null, 2)
    const blob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "stamats-settings.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  // Apply settings
  useEffect(() => {
    if (settings.theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      setTheme(prefersDark ? "dark" : "light")
    } else {
      setTheme(settings.theme)
    }
  }, [settings.theme, setTheme])

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-color', settings.accentColor)
  }, [settings.accentColor])

  useEffect(() => {
    const sizes = { small: "14px", medium: "16px", large: "18px" }
    document.documentElement.style.fontSize = sizes[settings.fontSize]
  }, [settings.fontSize])

  useEffect(() => {
    if (settings.reduceMotion) {
      document.documentElement.classList.add("reduce-motion")
    } else {
      document.documentElement.classList.remove("reduce-motion")
    }
  }, [settings.reduceMotion])

  // Command palette keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && settings.commandPaletteEnabled) {
        e.preventDefault()
        setShowCommandPalette(true)
      }
      if (e.key === 'Escape') {
        setShowCommandPalette(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settings.commandPaletteEnabled])

  const orderedTiles = [...defaultTiles].sort((a, b) => {
    const orderA = settings.tiles.find(t => t.id === a.id)?.order ?? 999
    const orderB = settings.tiles.find(t => t.id === b.id)?.order ?? 999
    return orderA - orderB
  })

  const tileStates = settings.tiles.reduce((acc, t) => {
    acc[t.id] = t.enabled
    return acc
  }, {} as Record<string, boolean>)

  const themeOptions = [
    { value: "light" as const, label: "Light", icon: Sun },
    { value: "dark" as const, label: "Dark", icon: Moon },
    { value: "system" as const, label: "System", icon: Monitor },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <AppHeader showAskAI={true} />

      {showCommandPalette && <CommandPaletteDemo onClose={() => setShowCommandPalette(false)} />}

      <div className="flex-1 flex">
        {/* Sidebar Navigation */}
        <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 p-4 hidden lg:block">
          <nav className="space-y-1">
            {categories.map(cat => {
              const Icon = cat.icon
              const isActive = activeCategory === cat.id
              const isLabs = cat.id === "labs"
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${
                    isActive ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <Icon size={18} className={isActive ? "text-blue-600 dark:text-blue-400" : isLabs ? "text-purple-500" : ""} />
                  <span className="text-[14px] font-medium flex-1">{cat.label}</span>
                  {isLabs && (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">
                      New
                    </span>
                  )}
                </button>
              )
            })}
          </nav>

          <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800">
            <button onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <Shield size={18} />
              <span className="text-[14px] font-medium">Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Mobile Category Selector */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-2 z-50">
          <div className="flex justify-around">
            {categories.slice(0, 5).map(cat => {
              const Icon = cat.icon
              const isActive = activeCategory === cat.id
              return (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-medium">{cat.label.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-6 lg:p-10 overflow-y-auto pb-24 lg:pb-10">
          <div className="max-w-2xl mx-auto">
            {/* Page Header with Stats Badge */}
            <div className="mb-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h1 className="text-[28px] font-semibold text-slate-900 dark:text-white tracking-tight">
                    {categories.find(c => c.id === activeCategory)?.label}
                  </h1>
                  <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-1">
                    {activeCategory === "appearance" && "Customize the look and feel of Stamats"}
                    {activeCategory === "home" && "Choose which tiles appear on your home screen"}
                    {activeCategory === "ai" && "Configure AI assistant behavior"}
                    {activeCategory === "search" && "Adjust search preferences"}
                    {activeCategory === "accessibility" && "Make Stamats easier to use"}
                    {activeCategory === "labs" && "Try experimental features before anyone else"}
                    {activeCategory === "data" && "Manage your data and storage"}
                  </p>
                </div>
                {/* Compact Stats Badge */}
                <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-orange-500/10 to-pink-500/10 dark:from-orange-500/20 dark:to-pink-500/20 rounded-xl border border-orange-200/50 dark:border-orange-500/20">
                  <div className="flex items-center gap-1.5">
                    <Flame size={16} className="text-orange-500" />
                    <span className="text-[14px] font-bold text-orange-600 dark:text-orange-400">{stats.currentStreak}</span>
                    <span className="text-[12px] text-orange-500/70 dark:text-orange-400/70">day streak</span>
                  </div>
                  <div className="w-px h-4 bg-orange-300/50 dark:bg-orange-500/30" />
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} className="text-emerald-500" />
                    <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">{stats.totalTimesSaved}m</span>
                    <span className="text-[11px] text-emerald-500/70 dark:text-emerald-400/70">saved</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Appearance Settings */}
            {activeCategory === "appearance" && (
              <div className="space-y-6">
                {/* Two Column Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Theme */}
                  <div className="space-y-4">
                    <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Theme</h3>
                    <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                      <div className="space-y-3">
                        {themeOptions.map(option => {
                          const Icon = option.icon
                          const isActive = settings.theme === option.value
                          return (
                            <button
                              key={option.value}
                              onClick={() => updateSetting("theme", option.value)}
                              className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all duration-200 ${
                                isActive
                                  ? "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/50"
                                  : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                              }`}
                            >
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                isActive ? "bg-blue-100 dark:bg-blue-800/40" : "bg-slate-100 dark:bg-slate-800"
                              }`}>
                                <Icon size={20} className={isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400"} />
                              </div>
                              <span className={`text-[15px] font-medium flex-1 text-left ${
                                isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"
                              }`}>
                                {option.label}
                              </span>
                              {isActive && (
                                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                                  <Check size={12} className="text-white" strokeWidth={3} />
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Accent Color */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Accent Color</h3>
                      <span className="px-2 py-0.5 text-[9px] font-bold uppercase bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-full">New</span>
                    </div>
                    <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                      <div className="grid grid-cols-5 gap-2">
                        {accentColors.map(color => {
                          const isActive = settings.accentColor === color.value
                          return (
                            <button
                              key={color.value}
                              onClick={() => updateSetting("accentColor", color.value)}
                              className="group relative"
                              title={color.name}
                            >
                              <div className={`aspect-square rounded-xl bg-gradient-to-br ${color.gradient} transition-all duration-200 ${
                                isActive
                                  ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 scale-105"
                                  : "group-hover:scale-105 group-hover:shadow-lg"
                              }`} style={{ ["--tw-ring-color" as string]: color.value }}>
                                {isActive && (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Check size={16} className="text-white drop-shadow-md" strokeWidth={3} />
                                  </div>
                                )}
                              </div>
                              <p className={`text-[10px] text-center mt-1.5 transition-colors ${
                                isActive ? "text-slate-900 dark:text-white font-medium" : "text-slate-400 dark:text-slate-500"
                              }`}>{color.name}</p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview Card */}
                <div className="space-y-4">
                  <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Preview</h3>
                  <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${settings.accentColor}, ${settings.accentColor}dd)` }}>
                        <Sparkles size={24} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-[17px] font-semibold text-slate-900 dark:text-white">Sample Card Title</h4>
                        <p className="text-[14px] text-slate-500 dark:text-slate-400 mt-1">This is how your content will appear with the selected theme and accent color.</p>
                        <div className="flex items-center gap-3 mt-4">
                          <button
                            className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-all hover:opacity-90"
                            style={{ background: settings.accentColor }}
                          >
                            Primary Button
                          </button>
                          <button className="px-4 py-2 rounded-lg text-[13px] font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                            Secondary
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Typography & Display */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Typography */}
                  <div className="space-y-4">
                    <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Typography</h3>
                    <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Type size={18} className="text-slate-500" />
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-slate-900 dark:text-white">Font Size</p>
                            <p className="text-[12px] text-slate-500">Adjust text size</p>
                          </div>
                        </div>
                        <SegmentedControl
                          options={[{ value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }]}
                          value={settings.fontSize}
                          onChange={(v) => updateSetting("fontSize", v)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Display Options */}
                  <div className="space-y-4">
                    <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Display</h3>
                    <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Maximize2 size={18} className="text-slate-500" />
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-slate-900 dark:text-white">High Contrast</p>
                            <p className="text-[12px] text-slate-500">Better visibility</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.highContrast} onChange={() => updateSetting("highContrast", !settings.highContrast)} />
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Zap size={18} className="text-slate-500" />
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-slate-900 dark:text-white">Reduce Motion</p>
                            <p className="text-[12px] text-slate-500">Minimize animations</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.reduceMotion} onChange={() => updateSetting("reduceMotion", !settings.reduceMotion)} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sidebar Density */}
                <div className="space-y-4">
                  <h3 className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Interface Density</h3>
                  <div className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: "compact", label: "Compact", desc: "More content, less space" },
                        { value: "comfortable", label: "Comfortable", desc: "Balanced spacing" },
                        { value: "spacious", label: "Spacious", desc: "Relaxed layout" },
                      ].map(option => {
                        const isActive = (settings as AppSettings & { density?: string }).density === option.value || (option.value === "comfortable" && !(settings as AppSettings & { density?: string }).density)
                        return (
                          <button
                            key={option.value}
                            onClick={() => updateSetting("density" as keyof AppSettings, option.value as AppSettings[keyof AppSettings])}
                            className={`p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                              isActive
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                            }`}
                          >
                            <p className={`text-[14px] font-medium ${isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"}`}>
                              {option.label}
                            </p>
                            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{option.desc}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Home Screen Settings */}
            {activeCategory === "home" && (
              <Section title="Visible Tiles">
                {orderedTiles.map(tile => (
                  <div key={tile.id} className="flex items-center gap-4 p-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: tile.gradient }}>
                      <div className="text-white scale-90">{tile.icon}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-slate-900 dark:text-white">{tile.title}</p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{tile.description}</p>
                    </div>
                    <Toggle enabled={tileStates[tile.id] ?? true} onChange={() => toggleTile(tile.id)} />
                  </div>
                ))}
              </Section>
            )}

            {/* AI Settings */}
            {activeCategory === "ai" && (
              <>
                <Section title="Responses">
                  <SettingRow icon={Zap} title="Response Length" description="Control how detailed AI responses are">
                    <SegmentedControl options={[{ value: "concise", label: "Concise" }, { value: "balanced", label: "Balanced" }, { value: "detailed", label: "Detailed" }]}
                      value={settings.aiResponseLength} onChange={(v) => updateSetting("aiResponseLength", v)} />
                  </SettingRow>
                  <SettingRow icon={Eye} title="Show Sources" description="Display source references in AI answers">
                    <Toggle enabled={settings.aiShowSources} onChange={() => updateSetting("aiShowSources", !settings.aiShowSources)} />
                  </SettingRow>
                </Section>
                <Section title="Suggestions">
                  <SettingRow icon={Sparkles} title="Auto-suggest" description="Show AI suggestions as you type">
                    <Toggle enabled={settings.aiAutoSuggest} onChange={() => updateSetting("aiAutoSuggest", !settings.aiAutoSuggest)} />
                  </SettingRow>
                </Section>
              </>
            )}

            {/* Search Settings */}
            {activeCategory === "search" && (
              <>
                <Section title="Results">
                  <SettingRow icon={LayoutGrid} title="Results per Page" description="Number of results to show">
                    <SegmentedControl options={[{ value: "10", label: "10" }, { value: "25", label: "25" }, { value: "50", label: "50" }]}
                      value={String(settings.searchResultsPerPage)} onChange={(v) => updateSetting("searchResultsPerPage", parseInt(v))} />
                  </SettingRow>
                  <SettingRow icon={MousePointer} title="Highlight Matches" description="Highlight matching text in results">
                    <Toggle enabled={settings.searchHighlightMatches} onChange={() => updateSetting("searchHighlightMatches", !settings.searchHighlightMatches)} />
                  </SettingRow>
                </Section>
                <Section title="Content">
                  <SettingRow icon={Image} title="Include Photos" description="Show photos in search results">
                    <Toggle enabled={settings.searchIncludePhotos} onChange={() => updateSetting("searchIncludePhotos", !settings.searchIncludePhotos)} />
                  </SettingRow>
                </Section>
              </>
            )}

            {/* Accessibility Settings */}
            {activeCategory === "accessibility" && (
              <>
                <Section title="Motion">
                  <SettingRow icon={Zap} title="Reduce Motion" description="Minimize animations and transitions">
                    <Toggle enabled={settings.reduceMotion} onChange={() => updateSetting("reduceMotion", !settings.reduceMotion)} />
                  </SettingRow>
                </Section>
                <Section title="Feedback">
                  <SettingRow icon={settings.soundEnabled ? Volume2 : VolumeX} title="Sound Effects" description="Play sounds for actions">
                    <Toggle enabled={settings.soundEnabled} onChange={() => updateSetting("soundEnabled", !settings.soundEnabled)} />
                  </SettingRow>
                  <SettingRow icon={Copy} title="Copy Confirmation" description="Show confirmation when copying text">
                    <Toggle enabled={settings.showCopyConfirmation} onChange={() => updateSetting("showCopyConfirmation", !settings.showCopyConfirmation)} />
                  </SettingRow>
                </Section>
                <Section title="Keyboard">
                  <SettingRow icon={Keyboard} title="Keyboard Shortcuts" description="View all available shortcuts" onClick={() => {}} />
                </Section>
              </>
            )}

            {/* Labs Settings */}
            {activeCategory === "labs" && (
              <>
                <div className="mb-8 p-4 rounded-2xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-3 mb-2">
                    <Beaker size={20} className="text-purple-600 dark:text-purple-400" />
                    <p className="text-[15px] font-semibold text-purple-700 dark:text-purple-300">Experimental Features</p>
                  </div>
                  <p className="text-[13px] text-purple-600 dark:text-purple-400">
                    These features are still in development. They may change or be removed at any time.
                  </p>
                </div>

                <Section title="Power User" badge="Hot">
                  <SettingRow icon={Command} title="Command Palette" description="Quick actions with Cmd+K" badge="Try it">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowCommandPalette(true)}
                        className="px-3 py-1.5 text-[13px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <Play size={14} className="inline mr-1.5" />
                        Demo
                      </button>
                      <Toggle enabled={settings.commandPaletteEnabled} onChange={() => updateSetting("commandPaletteEnabled", !settings.commandPaletteEnabled)} />
                    </div>
                  </SettingRow>
                </Section>

                <Section title="AI Enhancements">
                  <SettingRow icon={Rocket} title="AI-Powered Search" description="Use AI to understand your search intent" badge="Beta">
                    <Toggle enabled={settings.aiPoweredSearch} onChange={() => updateSetting("aiPoweredSearch", !settings.aiPoweredSearch)} />
                  </SettingRow>
                  <SettingRow icon={Target} title="Smart Suggestions" description="Get intelligent suggestions based on your activity">
                    <Toggle enabled={settings.smartSuggestions} onChange={() => updateSetting("smartSuggestions", !settings.smartSuggestions)} />
                  </SettingRow>
                </Section>

                <Section title="Coming Soon">
                  <div className="p-4 space-y-4">
                    {[
                      { icon: MessageSquare, label: "Team Collaboration", desc: "Share answers with your team" },
                      { icon: TrendingUp, label: "Analytics Dashboard", desc: "Deep insights into your usage" },
                      { icon: Award, label: "Weekly Challenges", desc: "Compete with colleagues" },
                    ].map(item => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="flex items-center gap-4 opacity-50">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Icon size={18} className="text-slate-400" />
                          </div>
                          <div className="flex-1">
                            <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400">{item.label}</p>
                            <p className="text-[13px] text-slate-400 dark:text-slate-500">{item.desc}</p>
                          </div>
                          <span className="px-2 py-1 text-[11px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg">Soon</span>
                        </div>
                      )
                    })}
                  </div>
                </Section>
              </>
            )}

            {/* Data Settings */}
            {activeCategory === "data" && (
              <>
                <Section title="Auto-save">
                  <SettingRow icon={Clock} title="Auto-save Interval" description="Automatically save work in progress">
                    <SegmentedControl options={[{ value: "0", label: "Off" }, { value: "1", label: "1m" }, { value: "5", label: "5m" }]}
                      value={String(settings.autoSaveInterval)} onChange={(v) => updateSetting("autoSaveInterval", parseInt(v))} />
                  </SettingRow>
                </Section>
                <Section title="Export">
                  <SettingRow icon={Download} title="Export Settings" description="Download your settings as JSON" onClick={exportSettings} />
                </Section>
                <Section title="Reset">
                  {!showResetConfirm ? (
                    <SettingRow icon={RotateCcw} title="Reset All Settings" description="Restore all settings to defaults" onClick={() => setShowResetConfirm(true)} />
                  ) : (
                    <div className="p-4">
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                        <p className="text-[15px] font-medium text-red-700 dark:text-red-300 mb-3">Are you sure you want to reset all settings?</p>
                        <p className="text-[13px] text-red-600 dark:text-red-400 mb-4">This will restore all settings to their default values. This action cannot be undone.</p>
                        <div className="flex gap-3">
                          <button onClick={resetAllSettings} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-[14px] font-medium rounded-lg transition-colors">Reset All Settings</button>
                          <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-[14px] font-medium rounded-lg transition-colors">Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </Section>
                <Section title="Clear Data">
                  <SettingRow icon={Trash2} title="Clear Local Cache" description="Remove cached data to free up space"
                    onClick={() => { localStorage.removeItem("stamats-cache"); window.location.reload() }} />
                </Section>
              </>
            )}

            {/* Auto-save indicator */}
            <div className="mt-8 text-center">
              <p className="text-[13px] text-slate-400 dark:text-slate-500 flex items-center justify-center gap-2">
                <Check size={14} className="text-emerald-500" />
                Changes saved automatically
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
