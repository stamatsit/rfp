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
      "Find and copy approved Q&A answers and photos instantly. Search across all your content by keyword, topic, or tag.",
    placement: "right",
    spotlightPadding: 8,
  },
  {
    id: "ask-ai",
    targetSelector: '[data-tour="ask-ai"]',
    title: "Ask AI",
    description:
      "Get AI-powered answers drawn from your entire approved content library. Ask questions in plain language and get proposal-ready responses.",
    placement: "right",
    spotlightPadding: 8,
  },
  {
    id: "proposal-insights",
    targetSelector: '[data-tour="proposal-insights"]',
    title: "Proposal Insights",
    description:
      "Analyze your proposal win rates and trends with AI-powered analytics. Spot patterns across years, categories, and teams.",
    placement: "left",
    spotlightPadding: 8,
  },
  {
    id: "case-studies",
    targetSelector: '[data-tour="case-studies"]',
    title: "Client Success",
    description:
      "Browse and format client results, stats, and testimonials. Use AI to find the most relevant case studies for your proposals.",
    placement: "left",
    spotlightPadding: 8,
  },
  {
    id: "document-studio",
    targetSelector: '[data-tour="document-studio"]',
    title: "Document Studio",
    description:
      "Create and edit proposal documents with AI assistance. Export to Word and PDF with professional formatting.",
    placement: "left",
    spotlightPadding: 8,
  },
  {
    id: "settings",
    targetSelector: '[data-tour="settings"]',
    title: "Settings & Profile",
    description:
      "Customize your dashboard tiles, theme, and profile from the user menu.",
    placement: "bottom",
    spotlightPadding: 12,
  },
  {
    id: "complete",
    targetSelector: null,
    title: "You\u2019re all set!",
    description:
      "You\u2019re ready to start using the platform. You can revisit this tour anytime from Settings.",
    placement: "center",
  },
]
