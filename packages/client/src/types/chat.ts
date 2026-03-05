import type { LucideIcon } from "lucide-react"

export interface ReviewAnnotation {
  id: string
  quote: string
  comment: string
  severity: "suggestion" | "warning" | "issue"
  suggestedFix?: string
}

export interface PhotoSuggestion {
  query: string
  placement: string
  photos: Array<{ id: string; displayTitle: string; storageKey: string; fileUrl: string | null }>
}

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  followUpPrompts?: string[]
  refused?: boolean
  refusalReason?: string
  timestamp: Date
  feedback?: "up" | "down" | null
  chartData?: ChartConfig | null
  svgData?: { svg: string; title: string } | null
  reviewAnnotations?: ReviewAnnotation[]
  photoSuggestions?: PhotoSuggestion[]
  metadata?: Record<string, unknown>
}

export interface ChartConfig {
  type: "bar" | "line" | "pie" | "area"
  title: string
  data: Array<Record<string, string | number>>
  xKey: string
  yKeys: string[]
  colors?: string[]
  yAxisLabel?: string
  showLegend?: boolean
}

export interface ChatTheme {
  name: string
  primary: string
  botGradient: string
  botShadow: string
  userBubbleBg: string
  userBubbleBorder: string
  userBubbleShadow: string
  accentBg: string
  accentBgHover: string
  accentText: string
  accentBorder: string
  accentBgDark: string
  accentBgHoverDark: string
  accentTextDark: string
  accentBorderDark: string
  sendButtonGradient: string
  sendButtonHoverGradient: string
  sendButtonShadow: string
  dotColor: string
}

export interface QuickAction {
  icon: LucideIcon
  label: string
  prompt: string
}

export const CHAT_THEMES = {
  cyan: {
    name: "Proposal Insights",
    primary: "cyan",
    botGradient: "linear-gradient(135deg, #06B6D4 0%, #0891B2 50%, #0E7490 100%)",
    botShadow: "0 4px 12px rgba(6,182,212,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    userBubbleBg: "bg-gradient-to-br from-cyan-50 to-teal-100/80",
    userBubbleBorder: "border-cyan-200/60",
    userBubbleShadow: "shadow-[0_1px_3px_rgba(6,182,212,0.1)]",
    accentBg: "bg-cyan-50",
    accentBgHover: "hover:bg-cyan-100",
    accentText: "text-cyan-700",
    accentBorder: "border-cyan-200",
    accentBgDark: "dark:bg-cyan-900/30",
    accentBgHoverDark: "dark:hover:bg-cyan-900/50",
    accentTextDark: "dark:text-cyan-300",
    accentBorderDark: "dark:border-cyan-700",
    sendButtonGradient: "bg-gradient-to-r from-cyan-500 to-teal-500",
    sendButtonHoverGradient: "hover:from-cyan-600 hover:to-teal-600",
    sendButtonShadow: "shadow-[0_4px_12px_rgba(6,182,212,0.3)]",
    dotColor: "bg-cyan-400",
  },
  violet: {
    name: "Client Success",
    primary: "violet",
    botGradient: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
    botShadow: "0 4px 12px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    userBubbleBg: "bg-gradient-to-br from-violet-50 to-purple-100/80",
    userBubbleBorder: "border-violet-200/60",
    userBubbleShadow: "shadow-[0_1px_3px_rgba(139,92,246,0.1)]",
    accentBg: "bg-violet-50",
    accentBgHover: "hover:bg-violet-100",
    accentText: "text-violet-700",
    accentBorder: "border-violet-200",
    accentBgDark: "dark:bg-violet-900/30",
    accentBgHoverDark: "dark:hover:bg-violet-900/50",
    accentTextDark: "dark:text-violet-300",
    accentBorderDark: "dark:border-violet-700",
    sendButtonGradient: "bg-gradient-to-r from-violet-500 to-purple-500",
    sendButtonHoverGradient: "hover:from-violet-600 hover:to-purple-600",
    sendButtonShadow: "shadow-[0_4px_12px_rgba(139,92,246,0.3)]",
    dotColor: "bg-violet-400",
  },
  indigo: {
    name: "Unified AI",
    primary: "indigo",
    botGradient: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
    botShadow: "0 4px 12px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    userBubbleBg: "bg-gradient-to-br from-indigo-50 to-violet-100/80",
    userBubbleBorder: "border-indigo-200/60",
    userBubbleShadow: "shadow-[0_1px_3px_rgba(99,102,241,0.1)]",
    accentBg: "bg-indigo-50",
    accentBgHover: "hover:bg-indigo-100",
    accentText: "text-indigo-700",
    accentBorder: "border-indigo-200",
    accentBgDark: "dark:bg-indigo-900/30",
    accentBgHoverDark: "dark:hover:bg-indigo-900/50",
    accentTextDark: "dark:text-indigo-300",
    accentBorderDark: "dark:border-indigo-700",
    sendButtonGradient: "bg-gradient-to-r from-indigo-500 to-violet-500",
    sendButtonHoverGradient: "hover:from-indigo-600 hover:to-violet-600",
    sendButtonShadow: "shadow-[0_4px_12px_rgba(99,102,241,0.3)]",
    dotColor: "bg-indigo-400",
  },
  purple: {
    name: "Ask AI",
    primary: "purple",
    botGradient: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 50%, #6D28D9 100%)",
    botShadow: "0 4px 12px rgba(139,92,246,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    userBubbleBg: "bg-gradient-to-br from-blue-50 to-blue-100/80",
    userBubbleBorder: "border-blue-200/60",
    userBubbleShadow: "shadow-[0_1px_3px_rgba(59,130,246,0.1)]",
    accentBg: "bg-purple-50",
    accentBgHover: "hover:bg-purple-100",
    accentText: "text-purple-700",
    accentBorder: "border-purple-200",
    accentBgDark: "dark:bg-purple-900/30",
    accentBgHoverDark: "dark:hover:bg-purple-900/50",
    accentTextDark: "dark:text-purple-300",
    accentBorderDark: "dark:border-purple-700",
    sendButtonGradient: "bg-gradient-to-r from-purple-500 to-blue-500",
    sendButtonHoverGradient: "hover:from-purple-600 hover:to-blue-600",
    sendButtonShadow: "shadow-[0_4px_12px_rgba(139,92,246,0.3)]",
    dotColor: "bg-purple-400",
  },
  sky: {
    name: "AI Companion",
    primary: "sky",
    botGradient: "linear-gradient(135deg, #38BDF8 0%, #0EA5E9 40%, #0D9488 100%)",
    botShadow: "0 4px 12px rgba(14,165,233,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    userBubbleBg: "bg-gradient-to-br from-sky-50 to-teal-50/80",
    userBubbleBorder: "border-sky-200/60",
    userBubbleShadow: "shadow-[0_1px_3px_rgba(14,165,233,0.1)]",
    accentBg: "bg-sky-50",
    accentBgHover: "hover:bg-sky-100",
    accentText: "text-sky-700",
    accentBorder: "border-sky-200",
    accentBgDark: "dark:bg-sky-900/30",
    accentBgHoverDark: "dark:hover:bg-sky-900/50",
    accentTextDark: "dark:text-sky-300",
    accentBorderDark: "dark:border-sky-700",
    sendButtonGradient: "bg-gradient-to-r from-sky-500 to-teal-500",
    sendButtonHoverGradient: "hover:from-sky-600 hover:to-teal-600",
    sendButtonShadow: "shadow-[0_4px_12px_rgba(14,165,233,0.3)]",
    dotColor: "bg-sky-400",
  },
  emerald: {
    name: "Document Studio",
    primary: "emerald",
    botGradient: "linear-gradient(135deg, #10B981 0%, #059669 50%, #047857 100%)",
    botShadow: "0 4px 12px rgba(16,185,129,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    userBubbleBg: "bg-gradient-to-br from-emerald-50 to-teal-100/80",
    userBubbleBorder: "border-emerald-200/60",
    userBubbleShadow: "shadow-[0_1px_3px_rgba(16,185,129,0.1)]",
    accentBg: "bg-emerald-50",
    accentBgHover: "hover:bg-emerald-100",
    accentText: "text-emerald-700",
    accentBorder: "border-emerald-200",
    accentBgDark: "dark:bg-emerald-900/30",
    accentBgHoverDark: "dark:hover:bg-emerald-900/50",
    accentTextDark: "dark:text-emerald-300",
    accentBorderDark: "dark:border-emerald-700",
    sendButtonGradient: "bg-gradient-to-r from-emerald-500 to-teal-500",
    sendButtonHoverGradient: "hover:from-emerald-600 hover:to-teal-600",
    sendButtonShadow: "shadow-[0_4px_12px_rgba(16,185,129,0.3)]",
    dotColor: "bg-emerald-400",
  },
  amber: {
    name: "AI Humanizer",
    primary: "amber",
    botGradient: "linear-gradient(135deg, #F59E0B 0%, #D97706 50%, #B45309 100%)",
    botShadow: "0 4px 12px rgba(245,158,11,0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
    userBubbleBg: "bg-gradient-to-br from-amber-50 to-orange-100/80",
    userBubbleBorder: "border-amber-200/60",
    userBubbleShadow: "shadow-[0_1px_3px_rgba(245,158,11,0.1)]",
    accentBg: "bg-amber-50",
    accentBgHover: "hover:bg-amber-100",
    accentText: "text-amber-700",
    accentBorder: "border-amber-200",
    accentBgDark: "dark:bg-amber-900/30",
    accentBgHoverDark: "dark:hover:bg-amber-900/50",
    accentTextDark: "dark:text-amber-300",
    accentBorderDark: "dark:border-amber-700",
    sendButtonGradient: "bg-gradient-to-r from-amber-500 to-orange-500",
    sendButtonHoverGradient: "hover:from-amber-600 hover:to-orange-600",
    sendButtonShadow: "shadow-[0_4px_12px_rgba(245,158,11,0.3)]",
    dotColor: "bg-amber-400",
  },
} satisfies Record<string, ChatTheme>
