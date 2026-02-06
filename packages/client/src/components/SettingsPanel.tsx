import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { useTheme } from "@/contexts/ThemeContext"
import {
  FileSpreadsheet,
  Image,
  Search,
  PenLine,
  Sparkles,
  FileSearch,
  Monitor,
  Moon,
  Sun,
  Check,
  Palette,
  LayoutGrid,
  Zap,
  Eye,
  Volume2,
  VolumeX,
  Type,
  Maximize2,
  Beaker,
  Command,
  Rocket,
  TrendingUp,
  Target,
  MessageSquare,
  Award,
  GripVertical,
  Keyboard,
  BarChart3,
  LineChart,
  Gauge,
  BookOpen,
  Layers,
} from "lucide-react"

// ============================================================================
// Settings Types & Storage
// ============================================================================

export interface TileConfig {
  id: string
  to: string
  icon: React.ReactNode
  title: string
  description: string
  gradient: string
  shadowColor: string
  enabled: boolean
  badge?: string
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
  {
    id: "case-studies",
    to: "/case-studies",
    icon: <BookOpen size={22} strokeWidth={2} />,
    title: "Client Success",
    description: "Pull highlights, stats, and testimonials from 57 client projects",
    gradient: "linear-gradient(135deg, #64748B 0%, #475569 50%, #334155 100%)",
    shadowColor: "rgba(100, 116, 139, 0.15)",
    enabled: true,
    badge: "BETA",
  },
  {
    id: "unified-ai",
    to: "/unified-ai",
    icon: <Layers size={22} strokeWidth={2} />,
    title: "Unified AI",
    description: "Cross-reference all your data: proposals, case studies, and library",
    gradient: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
    shadowColor: "rgba(99, 102, 241, 0.15)",
    enabled: true,
    badge: "POWER",
  },
]

interface TileSettings {
  id: string
  enabled: boolean
  order: number
}

// ============================================================================
// Widget Types & Configurations
// ============================================================================

export type WidgetSize = "small" | "medium" | "large"

export interface WidgetConfig {
  id: string
  type: WidgetType
  title: string
  description: string
  icon: React.ReactNode
  gradient: string
  enabled: boolean
  size: WidgetSize
  order: number
}

export type WidgetType =
  | "win-rate-chart"
  | "recent-activity"
  | "quick-stats"
  | "trending-topics"
  | "ai-suggestions"
  | "proposal-momentum"

interface WidgetSettings {
  id: string
  enabled: boolean
  size: WidgetSize
  order: number
}

const defaultWidgets: Omit<WidgetConfig, "enabled" | "order">[] = [
  {
    id: "win-rate-chart",
    type: "win-rate-chart",
    title: "Win Rate",
    description: "Live win rate trend with animated chart",
    icon: <LineChart size={18} />,
    gradient: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
    size: "small",
  },
  {
    id: "quick-stats",
    type: "quick-stats",
    title: "Quick Stats",
    description: "At-a-glance library metrics",
    icon: <BarChart3 size={18} />,
    gradient: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
    size: "small",
  },
  {
    id: "proposal-momentum",
    type: "proposal-momentum",
    title: "Momentum",
    description: "Proposal velocity and trends",
    icon: <Gauge size={18} />,
    gradient: "linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)",
    size: "small",
  },
]

interface AppSettings {
  tiles: TileSettings[]
  widgets: WidgetSettings[]
  widgetsEnabled: boolean
  theme: "light" | "dark" | "system"
  accentColor: string
  aiAutoSuggest: boolean
  aiShowSources: boolean
  aiResponseLength: string
  searchResultsPerPage: number
  searchHighlightMatches: boolean
  searchIncludePhotos: boolean
  reduceMotion: boolean
  fontSize: string
  highContrast: boolean
  soundEnabled: boolean
  showCopyConfirmation: boolean
  autoSaveInterval: number
  commandPaletteEnabled: boolean
  aiPoweredSearch: boolean
  smartSuggestions: boolean
  shortcuts: Record<string, string>
}

const SETTINGS_KEY = "stamats-app-settings"

const defaultSettings: AppSettings = {
  tiles: defaultTiles.map((t, i) => ({ id: t.id, enabled: true, order: i })),
  widgets: defaultWidgets.map((w, i) => ({ id: w.id, enabled: true, size: w.size, order: i })),
  widgetsEnabled: false,
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
      // Merge tiles
      const tileIds = new Set(parsed.tiles?.map((t: { id: string }) => t.id) || [])
      const mergedTiles = [
        ...(parsed.tiles || []),
        ...defaultTiles
          .filter(t => !tileIds.has(t.id))
          .map((t, i) => ({ id: t.id, enabled: true, order: (parsed.tiles?.length || 0) + i }))
      ]
      // Merge widgets
      const widgetIds = new Set(parsed.widgets?.map((w: { id: string }) => w.id) || [])
      const mergedWidgets = [
        ...(parsed.widgets || []),
        ...defaultWidgets
          .filter(w => !widgetIds.has(w.id))
          .map((w, i) => ({ id: w.id, enabled: true, size: w.size, order: (parsed.widgets?.length || 0) + i }))
      ]
      // Preserve widgetsEnabled explicitly (default to false only if not set)
      const widgetsEnabled = parsed.widgetsEnabled !== undefined ? parsed.widgetsEnabled : defaultSettings.widgetsEnabled
      return { ...defaultSettings, ...parsed, tiles: mergedTiles, widgets: mergedWidgets, widgetsEnabled }
    }
  } catch (e) {
    console.error("Failed to load settings:", e)
  }
  return defaultSettings
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    document.documentElement.style.setProperty('--accent-color', settings.accentColor)
    window.dispatchEvent(new CustomEvent("settings-changed", { detail: settings }))
  } catch (e) {
    console.error("Failed to save settings:", e)
  }
}

export function getVisibleTiles(): TileConfig[] {
  const settings = loadSettings()
  return [...defaultTiles]
    .sort((a, b) => {
      const orderA = settings.tiles.find(t => t.id === a.id)?.order ?? 999
      const orderB = settings.tiles.find(t => t.id === b.id)?.order ?? 999
      return orderA - orderB
    })
    .filter(tile => {
      const tileSetting = settings.tiles.find(t => t.id === tile.id)
      return tileSetting?.enabled !== false
    })
}

export function getVisibleWidgets(): WidgetConfig[] {
  const settings = loadSettings()
  if (!settings.widgetsEnabled) return []

  return [...defaultWidgets]
    .map(widget => {
      const widgetSetting = settings.widgets.find(w => w.id === widget.id)
      return {
        ...widget,
        enabled: widgetSetting?.enabled ?? true,
        size: widgetSetting?.size ?? widget.size,
        order: widgetSetting?.order ?? 999,
      }
    })
    .filter(widget => widget.enabled)
    .sort((a, b) => a.order - b.order)
}

export function getWidgetDefaults() {
  return defaultWidgets
}

// ============================================================================
// Accent Colors
// ============================================================================

const accentColors = [
  { name: "Blue", value: "#3B82F6", gradient: "from-blue-500 to-blue-600" },
  { name: "Purple", value: "#8B5CF6", gradient: "from-purple-500 to-purple-600" },
  { name: "Pink", value: "#EC4899", gradient: "from-pink-500 to-pink-600" },
  { name: "Red", value: "#EF4444", gradient: "from-red-500 to-red-600" },
  { name: "Orange", value: "#F97316", gradient: "from-orange-500 to-orange-600" },
  { name: "Yellow", value: "#EAB308", gradient: "from-yellow-500 to-yellow-600" },
  { name: "Green", value: "#22C55E", gradient: "from-green-500 to-green-600" },
  { name: "Teal", value: "#14B8A6", gradient: "from-teal-500 to-teal-600" },
  { name: "Cyan", value: "#06B6D4", gradient: "from-cyan-500 to-cyan-600" },
  { name: "Slate", value: "#64748B", gradient: "from-slate-500 to-slate-600" },
]

// ============================================================================
// UI Components
// ============================================================================

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
        enabled
          ? "bg-blue-500"
          : "bg-slate-200 dark:bg-slate-600"
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
          enabled ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  )
}

function SegmentedControl({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex rounded-lg p-0.5 gap-0.5 bg-slate-200 dark:bg-slate-700">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-200 ${
            value === option.value
              ? "bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// Traffic Lights Component
// ============================================================================

function TrafficLights({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="flex items-center gap-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Close (Red) */}
      <button
        onClick={onClose}
        className="w-3 h-3 rounded-full relative group transition-all duration-150"
        style={{
          background: "linear-gradient(180deg, #FF5F57 0%, #E0443E 100%)",
          boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.1)"
        }}
      >
        {hovered && (
          <svg className="absolute inset-0 w-3 h-3" viewBox="0 0 12 12">
            <path d="M3.5 3.5L8.5 8.5M8.5 3.5L3.5 8.5" stroke="rgba(77,22,22,0.8)" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        )}
      </button>

      {/* Minimize (Yellow) */}
      <button
        className="w-3 h-3 rounded-full relative transition-all duration-150"
        style={{
          background: "linear-gradient(180deg, #FFBD2E 0%, #DEA123 100%)",
          boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.1)"
        }}
      >
        {hovered && (
          <svg className="absolute inset-0 w-3 h-3" viewBox="0 0 12 12">
            <path d="M2.5 6H9.5" stroke="rgba(101,67,11,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        )}
      </button>

      {/* Maximize (Green) */}
      <button
        className="w-3 h-3 rounded-full relative transition-all duration-150"
        style={{
          background: "linear-gradient(180deg, #28C840 0%, #1AAB29 100%)",
          boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.1)"
        }}
      >
        {hovered && (
          <svg className="absolute inset-0 w-3 h-3" viewBox="0 0 12 12">
            <path d="M3 4.5L6 2L9 4.5M3 7.5L6 10L9 7.5" stroke="rgba(15,77,24,0.8)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
    </div>
  )
}


// ============================================================================
// Settings Categories
// ============================================================================

type SettingsCategory = "general" | "appearance" | "home" | "widgets" | "ai" | "accessibility" | "labs"

const categories = [
  { id: "general" as const, label: "General", icon: Monitor },
  { id: "appearance" as const, label: "Appearance", icon: Palette },
  { id: "home" as const, label: "Home Screen", icon: LayoutGrid },
  { id: "widgets" as const, label: "Widgets", icon: BarChart3, badge: "New" },
  { id: "ai" as const, label: "AI", icon: Sparkles },
  { id: "accessibility" as const, label: "Accessibility", icon: Eye },
  { id: "labs" as const, label: "Labs", icon: Beaker },
]

// ============================================================================
// Main Settings Panel Component
// ============================================================================

interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { setTheme } = useTheme()
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("general")
  const [isAnimatingIn, setIsAnimatingIn] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Use refs for dragging to avoid re-renders
  const isDraggingRef = useRef(false)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const positionRef = useRef({ x: 0, y: 0 })

  // Drag state for tiles
  const [draggedTile, setDraggedTile] = useState<string | null>(null)
  const [dragOverTile, setDragOverTile] = useState<string | null>(null)

  // Center panel on open
  useEffect(() => {
    if (isOpen) {
      const centerX = (window.innerWidth - 720) / 2
      const centerY = (window.innerHeight - 520) / 2
      positionRef.current = { x: Math.max(50, centerX), y: Math.max(50, centerY) }
      setIsVisible(true)
      // Use double RAF to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (panelRef.current) {
            panelRef.current.style.left = `${positionRef.current.x}px`
            panelRef.current.style.top = `${positionRef.current.y}px`
          }
          setIsAnimatingIn(true)
        })
      })
    } else {
      setIsAnimatingIn(false)
      const timer = setTimeout(() => setIsVisible(false), 300)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Apply theme changes
  useEffect(() => {
    if (settings.theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      setTheme(prefersDark ? "dark" : "light")
    } else {
      setTheme(settings.theme)
    }
  }, [settings.theme, setTheme])

  // Handle dragging - optimized with refs and direct DOM manipulation
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-titlebar') && !(e.target as HTMLElement).closest('button')) {
      isDraggingRef.current = true
      dragOffsetRef.current = {
        x: e.clientX - positionRef.current.x,
        y: e.clientY - positionRef.current.y
      }
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'
    }
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current && panelRef.current) {
        const newX = Math.max(0, Math.min(window.innerWidth - 720, e.clientX - dragOffsetRef.current.x))
        const newY = Math.max(0, Math.min(window.innerHeight - 520, e.clientY - dragOffsetRef.current.y))
        positionRef.current = { x: newX, y: newY }
        // Direct DOM manipulation - no React re-render
        panelRef.current.style.left = `${newX}px`
        panelRef.current.style.top = `${newY}px`
      }
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Update settings
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

  // Tile drag handlers
  const handleTileDragStart = (e: React.DragEvent, tileId: string) => {
    setDraggedTile(tileId)
    e.dataTransfer.effectAllowed = "move"
  }

  const handleTileDragOver = (e: React.DragEvent, tileId: string) => {
    e.preventDefault()
    if (tileId !== draggedTile) setDragOverTile(tileId)
  }

  const handleTileDrop = (e: React.DragEvent, targetTileId: string) => {
    e.preventDefault()
    if (!draggedTile || draggedTile === targetTileId) {
      setDraggedTile(null)
      setDragOverTile(null)
      return
    }

    const currentOrder = [...defaultTiles].sort((a, b) => {
      const orderA = settings.tiles.find(t => t.id === a.id)?.order ?? 999
      const orderB = settings.tiles.find(t => t.id === b.id)?.order ?? 999
      return orderA - orderB
    }).map(t => t.id)

    const draggedIndex = currentOrder.indexOf(draggedTile)
    const targetIndex = currentOrder.indexOf(targetTileId)
    const newOrder = [...currentOrder]
    newOrder.splice(draggedIndex, 1)
    newOrder.splice(targetIndex, 0, draggedTile)

    const newTiles = settings.tiles.map(t => ({
      ...t,
      order: newOrder.indexOf(t.id)
    }))

    updateSetting("tiles", newTiles)
    setDraggedTile(null)
    setDragOverTile(null)
  }

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
    { value: "system" as const, label: "Auto", icon: Monitor },
  ]

  if (!isVisible) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[998] transition-opacity duration-300 ${
          isAnimatingIn ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed z-[999]"
        style={{
          left: positionRef.current.x || '50%',
          top: positionRef.current.y || '50%',
          marginLeft: positionRef.current.x ? 0 : -360,
          marginTop: positionRef.current.y ? 0 : -260,
          width: 720,
          height: 520,
          transform: isAnimatingIn
            ? "scale(1) translateY(0)"
            : "scale(0.95) translateY(10px)",
          opacity: isAnimatingIn ? 1 : 0,
          transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Clean Panel Container */}
        <div
          className="relative w-full h-full rounded-xl overflow-hidden bg-white dark:bg-slate-900"
          style={{
            boxShadow: `
              0 0 0 1px rgba(0,0,0,0.08),
              0 4px 6px -1px rgba(0,0,0,0.1),
              0 20px 40px -8px rgba(0,0,0,0.25)
            `,
          }}
        >
          {/* Title Bar */}
          <div
            className="panel-titlebar h-12 flex items-center px-4 cursor-grab active:cursor-grabbing bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700"
          >
            <TrafficLights onClose={onClose} />
            <div className="flex-1 text-center">
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
                Settings
              </span>
            </div>
            <div className="w-14" /> {/* Spacer for balance */}
          </div>

          {/* Content */}
          <div className="flex h-[calc(100%-48px)]">
            {/* Sidebar */}
            <div className="w-48 p-3 flex flex-col gap-1 bg-slate-50 dark:bg-slate-800/50 border-r border-slate-200 dark:border-slate-700">
              {categories.map(cat => {
                const Icon = cat.icon
                const isActive = activeCategory === cat.id
                const badge = 'badge' in cat ? cat.badge : (cat.id === "labs" ? "New" : null)
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200 ${
                      isActive
                        ? "bg-blue-500 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <Icon size={16} />
                    <span className="text-[13px] font-medium">{cat.label}</span>
                    {badge && (
                      <span className={`ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase text-white rounded-full ${
                        cat.id === "widgets"
                          ? "bg-gradient-to-r from-blue-500 to-indigo-500"
                          : "bg-gradient-to-r from-purple-500 to-pink-500"
                      }`}>
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Main Content */}
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900">
              {/* General Settings */}
              {activeCategory === "general" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Theme</h3>
                    <div className="flex gap-2">
                      {themeOptions.map(option => {
                        const Icon = option.icon
                        const isActive = settings.theme === option.value
                        return (
                          <button
                            key={option.value}
                            onClick={() => updateSetting("theme", option.value)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 border ${
                              isActive
                                ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400"
                                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                            }`}
                          >
                            <Icon size={16} />
                            <span className="text-[13px] font-medium">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Sound & Feedback</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          {settings.soundEnabled ? <Volume2 size={16} className="text-slate-500 dark:text-slate-400" /> : <VolumeX size={16} className="text-slate-500 dark:text-slate-400" />}
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">Sound Effects</span>
                        </div>
                        <Toggle enabled={settings.soundEnabled} onChange={() => updateSetting("soundEnabled", !settings.soundEnabled)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-slate-500 dark:text-slate-400" />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">Copy Confirmations</span>
                        </div>
                        <Toggle enabled={settings.showCopyConfirmation} onChange={() => updateSetting("showCopyConfirmation", !settings.showCopyConfirmation)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Keyboard</h3>
                    <button className="flex items-center justify-between w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                      <div className="flex items-center gap-3">
                        <Keyboard size={16} className="text-slate-500 dark:text-slate-400" />
                        <span className="text-[13px] text-slate-700 dark:text-slate-300">Keyboard Shortcuts</span>
                      </div>
                      <span className="text-[12px] text-slate-400 dark:text-slate-500">View all</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Appearance Settings */}
              {activeCategory === "appearance" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Accent Color</h3>
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
                            <div
                              className={`aspect-square rounded-xl transition-all duration-200 ${
                                isActive ? "scale-105 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900" : "hover:scale-105"
                              }`}
                              style={{
                                background: `linear-gradient(135deg, ${color.value}, ${color.value}cc)`,
                                ...(isActive ? { boxShadow: `0 0 0 2px ${color.value}` } : {})
                              }}
                            >
                              {isActive && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Check size={16} className="text-white drop-shadow" strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <p className={`text-[10px] text-center mt-1.5 ${isActive ? "text-slate-700 dark:text-slate-300 font-medium" : "text-slate-400 dark:text-slate-500"}`}>
                              {color.name}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Typography</h3>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <Type size={16} className="text-slate-500 dark:text-slate-400" />
                        <span className="text-[13px] text-slate-700 dark:text-slate-300">Font Size</span>
                      </div>
                      <SegmentedControl
                        options={[{ value: "small", label: "S" }, { value: "medium", label: "M" }, { value: "large", label: "L" }]}
                        value={settings.fontSize}
                        onChange={(v) => updateSetting("fontSize", v)}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Display</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Maximize2 size={16} className="text-slate-500 dark:text-slate-400" />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">High Contrast</span>
                        </div>
                        <Toggle enabled={settings.highContrast} onChange={() => updateSetting("highContrast", !settings.highContrast)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Zap size={16} className="text-slate-500 dark:text-slate-400" />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">Reduce Motion</span>
                        </div>
                        <Toggle enabled={settings.reduceMotion} onChange={() => updateSetting("reduceMotion", !settings.reduceMotion)} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Home Screen Settings */}
              {activeCategory === "home" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tiles</h3>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">Drag to reorder</span>
                  </div>
                  <div className="space-y-2">
                    {orderedTiles.map(tile => (
                      <div
                        key={tile.id}
                        draggable
                        onDragStart={(e) => handleTileDragStart(e, tile.id)}
                        onDragOver={(e) => handleTileDragOver(e, tile.id)}
                        onDragLeave={() => setDragOverTile(null)}
                        onDrop={(e) => handleTileDrop(e, tile.id)}
                        onDragEnd={() => { setDraggedTile(null); setDragOverTile(null) }}
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 border ${
                          draggedTile === tile.id ? "opacity-50" : ""
                        } ${
                          dragOverTile === tile.id
                            ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700"
                            : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        <div className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500">
                          <GripVertical size={14} />
                        </div>
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: tile.gradient }}
                        >
                          <div className="text-white scale-75">{tile.icon}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{tile.title}</p>
                        </div>
                        <Toggle
                          enabled={tileStates[tile.id] ?? true}
                          onChange={() => toggleTile(tile.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Widgets Settings */}
              {activeCategory === "widgets" && (
                <div className="space-y-6">
                  {/* Master Toggle */}
                  <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                        <BarChart3 size={20} className="text-white" />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-slate-800 dark:text-white">Dashboard Widgets</p>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">Show widgets on home screen</p>
                      </div>
                    </div>
                    <Toggle
                      enabled={settings.widgetsEnabled}
                      onChange={() => updateSetting("widgetsEnabled", !settings.widgetsEnabled)}
                    />
                  </div>

                  <p className="text-[13px] text-slate-500 dark:text-slate-400">
                    {settings.widgetsEnabled
                      ? "Widgets are displayed on your home screen showing stats, trends, and suggestions."
                      : "Enable widgets to see stats, trends, and suggestions on your home screen."}
                  </p>
                </div>
              )}

              {/* AI Settings */}
              {activeCategory === "ai" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Responses</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Zap size={16} className="text-slate-500 dark:text-slate-400" />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">Response Length</span>
                        </div>
                        <SegmentedControl
                          options={[{ value: "concise", label: "Short" }, { value: "balanced", label: "Medium" }, { value: "detailed", label: "Long" }]}
                          value={settings.aiResponseLength}
                          onChange={(v) => updateSetting("aiResponseLength", v)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Eye size={16} className="text-slate-500 dark:text-slate-400" />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">Show Sources</span>
                        </div>
                        <Toggle enabled={settings.aiShowSources} onChange={() => updateSetting("aiShowSources", !settings.aiShowSources)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Suggestions</h3>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <Sparkles size={16} className="text-slate-500 dark:text-slate-400" />
                        <span className="text-[13px] text-slate-700 dark:text-slate-300">Auto-suggest</span>
                      </div>
                      <Toggle enabled={settings.aiAutoSuggest} onChange={() => updateSetting("aiAutoSuggest", !settings.aiAutoSuggest)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Accessibility Settings */}
              {activeCategory === "accessibility" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Vision</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Maximize2 size={16} className="text-slate-500 dark:text-slate-400" />
                          <div>
                            <p className="text-[13px] text-slate-700 dark:text-slate-300">High Contrast</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">Increase color contrast</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.highContrast} onChange={() => updateSetting("highContrast", !settings.highContrast)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Type size={16} className="text-slate-500 dark:text-slate-400" />
                          <div>
                            <p className="text-[13px] text-slate-700 dark:text-slate-300">Large Text</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">Increase font sizes</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.fontSize === "large"} onChange={() => updateSetting("fontSize", settings.fontSize === "large" ? "medium" : "large")} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Motion</h3>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-3">
                        <Zap size={16} className="text-slate-500 dark:text-slate-400" />
                        <div>
                          <p className="text-[13px] text-slate-700 dark:text-slate-300">Reduce Motion</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">Minimize animations</p>
                        </div>
                      </div>
                      <Toggle enabled={settings.reduceMotion} onChange={() => updateSetting("reduceMotion", !settings.reduceMotion)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Labs Settings */}
              {activeCategory === "labs" && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center gap-2 mb-2">
                      <Beaker size={16} className="text-purple-500 dark:text-purple-400" />
                      <span className="text-[13px] font-semibold text-purple-700 dark:text-purple-300">Experimental</span>
                    </div>
                    <p className="text-[12px] text-purple-600 dark:text-purple-400">
                      These features are in development and may change or be removed.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Features</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Command size={16} className="text-slate-500 dark:text-slate-400" />
                          <div>
                            <p className="text-[13px] text-slate-700 dark:text-slate-300">Command Palette</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">Quick actions with Cmd+K</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.commandPaletteEnabled} onChange={() => updateSetting("commandPaletteEnabled", !settings.commandPaletteEnabled)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Rocket size={16} className="text-slate-500 dark:text-slate-400" />
                          <div>
                            <p className="text-[13px] text-slate-700 dark:text-slate-300">AI-Powered Search</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">Semantic search understanding</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.aiPoweredSearch} onChange={() => updateSetting("aiPoweredSearch", !settings.aiPoweredSearch)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <Target size={16} className="text-slate-500 dark:text-slate-400" />
                          <div>
                            <p className="text-[13px] text-slate-700 dark:text-slate-300">Smart Suggestions</p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">Activity-based recommendations</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.smartSuggestions} onChange={() => updateSetting("smartSuggestions", !settings.smartSuggestions)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Coming Soon</h3>
                    <div className="space-y-2">
                      {[
                        { icon: MessageSquare, label: "Team Collaboration" },
                        { icon: Award, label: "Weekly Challenges" },
                      ].map(item => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 opacity-60">
                            <Icon size={16} className="text-slate-400 dark:text-slate-500" />
                            <span className="text-[13px] text-slate-500 dark:text-slate-400">{item.label}</span>
                            <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 uppercase font-medium">Soon</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.2);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
        }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </>,
    document.body
  )
}
