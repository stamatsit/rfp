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
]

interface TileSettings {
  id: string
  enabled: boolean
  order: number
}

interface AppSettings {
  tiles: TileSettings[]
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
          ? "bg-gradient-to-r from-green-400 to-green-500"
          : "bg-white/20 dark:bg-white/10"
      }`}
      style={{
        boxShadow: enabled
          ? "inset 0 1px 2px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.1)"
          : "inset 0 1px 3px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.05)"
      }}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-300 ${
          enabled ? "left-[22px]" : "left-0.5"
        }`}
        style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)" }}
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
    <div className="flex rounded-lg p-0.5 gap-0.5" style={{
      background: "rgba(255,255,255,0.1)",
      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.1)"
    }}>
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-200 ${
            value === option.value
              ? "bg-white/90 dark:bg-white/20 text-slate-900 dark:text-white shadow-sm"
              : "text-white/60 hover:text-white/80"
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
// SVG Filter for Liquid Glass Distortion
// ============================================================================

function LiquidGlassFilter() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
      <defs>
        <filter id="liquid-glass-distortion" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="3" seed="5" result="noise"/>
          <feGaussianBlur in="noise" stdDeviation="1.5" result="blurred"/>
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="8" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
        <filter id="glass-glow">
          <feGaussianBlur stdDeviation="20" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
    </svg>
  )
}

// ============================================================================
// Settings Categories
// ============================================================================

type SettingsCategory = "general" | "appearance" | "home" | "ai" | "accessibility" | "labs"

const categories = [
  { id: "general" as const, label: "General", icon: Monitor },
  { id: "appearance" as const, label: "Appearance", icon: Palette },
  { id: "home" as const, label: "Home Screen", icon: LayoutGrid },
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
      if (panelRef.current) {
        panelRef.current.style.left = `${positionRef.current.x}px`
        panelRef.current.style.top = `${positionRef.current.y}px`
      }
      setIsVisible(true)
      requestAnimationFrame(() => {
        setIsAnimatingIn(true)
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
      <LiquidGlassFilter />

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[998] transition-opacity duration-300 ${
          isAnimatingIn ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "rgba(0,0,0,0.2)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed z-[999]"
        style={{
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
        {/* Liquid Glass Container */}
        <div
          className="relative w-full h-full rounded-2xl overflow-hidden"
          style={{
            // Liquid glass effect
            background: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            boxShadow: `
              0 0 0 0.5px rgba(255,255,255,0.4),
              0 0 0 1px rgba(255,255,255,0.1),
              0 25px 50px -12px rgba(0,0,0,0.4),
              0 12px 24px -8px rgba(0,0,0,0.3),
              inset 0 1px 1px rgba(255,255,255,0.4),
              inset 0 -1px 1px rgba(0,0,0,0.1)
            `,
          }}
        >
          {/* Inner highlight layer */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.05) 100%)",
            }}
          />

          {/* Refraction shimmer effect */}
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none opacity-30"
            style={{
              background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)",
              animation: "shimmer 3s ease-in-out infinite",
            }}
          />

          {/* Title Bar */}
          <div
            className="panel-titlebar h-12 flex items-center px-4 cursor-grab active:cursor-grabbing"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <TrafficLights onClose={onClose} />
            <div className="flex-1 text-center">
              <span className="text-[13px] font-semibold text-white/80 drop-shadow-sm">
                Settings
              </span>
            </div>
            <div className="w-14" /> {/* Spacer for balance */}
          </div>

          {/* Content */}
          <div className="flex h-[calc(100%-48px)]">
            {/* Sidebar */}
            <div
              className="w-48 p-3 flex flex-col gap-1"
              style={{
                background: "rgba(0,0,0,0.1)",
                borderRight: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {categories.map(cat => {
                const Icon = cat.icon
                const isActive = activeCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200 ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "text-white/60 hover:text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <Icon size={16} className={isActive ? "text-white" : ""} />
                    <span className="text-[13px] font-medium">{cat.label}</span>
                    {cat.id === "labs" && (
                      <span className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full">
                        New
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Main Content */}
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
              {/* General Settings */}
              {activeCategory === "general" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Theme</h3>
                    <div className="flex gap-2">
                      {themeOptions.map(option => {
                        const Icon = option.icon
                        const isActive = settings.theme === option.value
                        return (
                          <button
                            key={option.value}
                            onClick={() => updateSetting("theme", option.value)}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 ${
                              isActive
                                ? "bg-white/25 text-white"
                                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
                            }`}
                            style={isActive ? {
                              boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2), 0 0 0 1px rgba(255,255,255,0.1)"
                            } : {}}
                          >
                            <Icon size={16} />
                            <span className="text-[13px] font-medium">{option.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Sound & Feedback</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          {settings.soundEnabled ? <Volume2 size={16} className="text-white/60" /> : <VolumeX size={16} className="text-white/60" />}
                          <span className="text-[13px] text-white/80">Sound Effects</span>
                        </div>
                        <Toggle enabled={settings.soundEnabled} onChange={() => updateSetting("soundEnabled", !settings.soundEnabled)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Check size={16} className="text-white/60" />
                          <span className="text-[13px] text-white/80">Copy Confirmations</span>
                        </div>
                        <Toggle enabled={settings.showCopyConfirmation} onChange={() => updateSetting("showCopyConfirmation", !settings.showCopyConfirmation)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Keyboard</h3>
                    <button className="flex items-center justify-between w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-3">
                        <Keyboard size={16} className="text-white/60" />
                        <span className="text-[13px] text-white/80">Keyboard Shortcuts</span>
                      </div>
                      <span className="text-[12px] text-white/40">View all</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Appearance Settings */}
              {activeCategory === "appearance" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Accent Color</h3>
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
                                isActive ? "scale-105 ring-2 ring-white/50 ring-offset-2 ring-offset-transparent" : "hover:scale-105"
                              }`}
                              style={{ background: `linear-gradient(135deg, ${color.value}, ${color.value}cc)` }}
                            >
                              {isActive && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Check size={16} className="text-white drop-shadow" strokeWidth={3} />
                                </div>
                              )}
                            </div>
                            <p className={`text-[10px] text-center mt-1.5 ${isActive ? "text-white" : "text-white/40"}`}>
                              {color.name}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Typography</h3>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                      <div className="flex items-center gap-3">
                        <Type size={16} className="text-white/60" />
                        <span className="text-[13px] text-white/80">Font Size</span>
                      </div>
                      <SegmentedControl
                        options={[{ value: "small", label: "S" }, { value: "medium", label: "M" }, { value: "large", label: "L" }]}
                        value={settings.fontSize}
                        onChange={(v) => updateSetting("fontSize", v)}
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Display</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Maximize2 size={16} className="text-white/60" />
                          <span className="text-[13px] text-white/80">High Contrast</span>
                        </div>
                        <Toggle enabled={settings.highContrast} onChange={() => updateSetting("highContrast", !settings.highContrast)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Zap size={16} className="text-white/60" />
                          <span className="text-[13px] text-white/80">Reduce Motion</span>
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
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Tiles</h3>
                    <span className="text-[11px] text-white/40">Drag to reorder</span>
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
                        className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                          draggedTile === tile.id ? "opacity-50" : ""
                        } ${
                          dragOverTile === tile.id ? "bg-white/20 ring-1 ring-white/30" : "bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/50">
                          <GripVertical size={14} />
                        </div>
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: tile.gradient }}
                        >
                          <div className="text-white scale-75">{tile.icon}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-white/90">{tile.title}</p>
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

              {/* AI Settings */}
              {activeCategory === "ai" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Responses</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Zap size={16} className="text-white/60" />
                          <span className="text-[13px] text-white/80">Response Length</span>
                        </div>
                        <SegmentedControl
                          options={[{ value: "concise", label: "Short" }, { value: "balanced", label: "Medium" }, { value: "detailed", label: "Long" }]}
                          value={settings.aiResponseLength}
                          onChange={(v) => updateSetting("aiResponseLength", v)}
                        />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Eye size={16} className="text-white/60" />
                          <span className="text-[13px] text-white/80">Show Sources</span>
                        </div>
                        <Toggle enabled={settings.aiShowSources} onChange={() => updateSetting("aiShowSources", !settings.aiShowSources)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Suggestions</h3>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                      <div className="flex items-center gap-3">
                        <Sparkles size={16} className="text-white/60" />
                        <span className="text-[13px] text-white/80">Auto-suggest</span>
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
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Vision</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Maximize2 size={16} className="text-white/60" />
                          <div>
                            <p className="text-[13px] text-white/80">High Contrast</p>
                            <p className="text-[11px] text-white/40">Increase color contrast</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.highContrast} onChange={() => updateSetting("highContrast", !settings.highContrast)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Type size={16} className="text-white/60" />
                          <div>
                            <p className="text-[13px] text-white/80">Large Text</p>
                            <p className="text-[11px] text-white/40">Increase font sizes</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.fontSize === "large"} onChange={() => updateSetting("fontSize", settings.fontSize === "large" ? "medium" : "large")} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Motion</h3>
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                      <div className="flex items-center gap-3">
                        <Zap size={16} className="text-white/60" />
                        <div>
                          <p className="text-[13px] text-white/80">Reduce Motion</p>
                          <p className="text-[11px] text-white/40">Minimize animations</p>
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
                  <div
                    className="p-4 rounded-xl"
                    style={{
                      background: "linear-gradient(135deg, rgba(139,92,246,0.2) 0%, rgba(236,72,153,0.2) 100%)",
                      border: "1px solid rgba(139,92,246,0.3)"
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Beaker size={16} className="text-purple-400" />
                      <span className="text-[13px] font-semibold text-purple-300">Experimental</span>
                    </div>
                    <p className="text-[12px] text-purple-300/70">
                      These features are in development and may change or be removed.
                    </p>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Features</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Command size={16} className="text-white/60" />
                          <div>
                            <p className="text-[13px] text-white/80">Command Palette</p>
                            <p className="text-[11px] text-white/40">Quick actions with Cmd+K</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.commandPaletteEnabled} onChange={() => updateSetting("commandPaletteEnabled", !settings.commandPaletteEnabled)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Rocket size={16} className="text-white/60" />
                          <div>
                            <p className="text-[13px] text-white/80">AI-Powered Search</p>
                            <p className="text-[11px] text-white/40">Semantic search understanding</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.aiPoweredSearch} onChange={() => updateSetting("aiPoweredSearch", !settings.aiPoweredSearch)} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-3">
                          <Target size={16} className="text-white/60" />
                          <div>
                            <p className="text-[13px] text-white/80">Smart Suggestions</p>
                            <p className="text-[11px] text-white/40">Activity-based recommendations</p>
                          </div>
                        </div>
                        <Toggle enabled={settings.smartSuggestions} onChange={() => updateSetting("smartSuggestions", !settings.smartSuggestions)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-3">Coming Soon</h3>
                    <div className="space-y-2">
                      {[
                        { icon: MessageSquare, label: "Team Collaboration" },
                        { icon: Award, label: "Weekly Challenges" },
                      ].map(item => {
                        const Icon = item.icon
                        return (
                          <div key={item.label} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 opacity-50">
                            <Icon size={16} className="text-white/40" />
                            <span className="text-[13px] text-white/60">{item.label}</span>
                            <span className="ml-auto text-[10px] text-white/30 uppercase">Soon</span>
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
        @keyframes shimmer {
          0%, 100% { opacity: 0.2; transform: translateX(-100%); }
          50% { opacity: 0.4; transform: translateX(100%); }
        }

        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.2);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.3);
        }
      `}</style>
    </>,
    document.body
  )
}
