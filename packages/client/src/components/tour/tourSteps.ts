export interface TourStep {
  id: string
  /** CSS selector to find the target element, or null for centered (no spotlight) */
  targetSelector: string | null
  title: string
  description: string
  /** Preferred tooltip placement relative to the target */
  placement: "top" | "bottom" | "left" | "right" | "center"
  /** Spotlight padding around the element in px */
  spotlightPadding?: number
}

export const tourSteps: TourStep[] = [
  {
    id: "welcome",
    targetSelector: null,
    title: "Welcome to Stamats",
    description:
      "Your AI-powered content library for proposals, client results, and approved content. Let\u2019s take a quick tour of what you can do.",
    placement: "center",
  },
  {
    id: "search-library",
    targetSelector: '[data-tour="search-library"]',
    title: "Search Library",
    description:
      "Your starting point for finding content. Search across all Q&A answers and photos by keyword, topic, or tag \u2014 then copy what you need straight into your proposals.",
    placement: "right",
    spotlightPadding: 8,
  },
  {
    id: "ask-ai",
    targetSelector: '[data-tour="ask-ai"]',
    title: "Ask AI",
    description:
      "Chat with AI that knows your entire content library. Ask questions in plain language and get proposal-ready answers drawn from your approved Q&A content. Think of it as a conversation with your library.",
    placement: "right",
    spotlightPadding: 8,
  },
  {
    id: "proposal-insights",
    targetSelector: '[data-tour="proposal-insights"]',
    title: "Proposal Insights",
    description:
      "Different from Ask AI \u2014 this analyzes your proposal win rates and trends. Use it to spot patterns across years, categories, and teams so you can focus on what\u2019s winning.",
    placement: "left",
    spotlightPadding: 8,
  },
  {
    id: "case-studies",
    targetSelector: '[data-tour="case-studies"]',
    title: "Client Success",
    description:
      "Different from both \u2014 this is focused on client results, stats, and testimonials. Use AI to find the most relevant case studies for a specific proposal or audience.",
    placement: "left",
    spotlightPadding: 8,
  },
  {
    id: "unified-ai",
    targetSelector: '[data-tour="unified-ai"]',
    title: "Unified AI",
    description:
      "The power tool that combines everything. Cross-references proposals, client results, and library content in a single AI conversation. Enable it from Home Screen settings if it\u2019s not visible.",
    placement: "left",
    spotlightPadding: 8,
  },
  {
    id: "import-data",
    targetSelector: '[data-tour="import-data"]',
    title: "Import Data",
    description:
      "Bulk-load Q&A content from Excel spreadsheets. This is how you populate the library \u2014 upload once, search and reuse across every proposal.",
    placement: "right",
    spotlightPadding: 8,
  },
  {
    id: "new-entry",
    targetSelector: '[data-tour="new-entry"]',
    title: "New Entry",
    description:
      "Manually add individual answers to the library. Great for one-off content that didn\u2019t come from a spreadsheet import.",
    placement: "right",
    spotlightPadding: 8,
  },
  {
    id: "photo-library",
    targetSelector: '[data-tour="photo-library"]',
    title: "Photo Library",
    description:
      "Upload, tag, and manage proposal images. Photos are searchable alongside Q&A content so you can find everything in one place.",
    placement: "left",
    spotlightPadding: 8,
  },
  {
    id: "settings",
    targetSelector: '[data-tour="settings"]',
    title: "Settings & Profile",
    description:
      "Customize your dashboard \u2014 rearrange tiles, change your theme, adjust AI behavior, and manage your account. You can also re-enable this tour from here.",
    placement: "bottom",
    spotlightPadding: 12,
  },
  {
    id: "complete",
    targetSelector: null,
    title: "You\u2019re all set!",
    description:
      "You\u2019re ready to start using the platform. You can revisit this tour anytime from Settings \u2192 General \u2192 Guided Tour.",
    placement: "center",
  },
]
