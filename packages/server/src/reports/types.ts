/**
 * ReportData — the complete data model for a generated gap analysis report.
 * Maps 1:1 to every templatable zone in the Stamats gap-analysis template.
 *
 * Sections are additive: missing-optional sections are simply not rendered.
 * Required sections (hero, healthScore, categoryScores, priorities, footer) drive the
 * minimum viable polished report.
 */

export type Severity = "critical" | "high" | "medium" | "low"

export type GradeLetter = "A" | "B" | "C" | "D" | "F"

export type CategoryTone = "critical" | "high" | "medium" | "low" | "accent" | "purple"

/** Identifier used for anchor links and deterministic DOM ids. */
export type CategoryId =
  | "a11y"
  | "seo"
  | "content"
  | "ux"
  | "modern"
  | "trust"
  | "privacy"
  | "performance"
  | "naming"
  | "competitive"
  | "schema"
  | string // allow ad-hoc ids for custom categories

export interface CategoryScore {
  id: CategoryId
  name: string
  /** 0-100 */
  score: number
  /** Count of distinct issues flagged in this category. */
  issueCount: number
  /** Iconography — one of the icons exported from icons.ts. */
  icon: IconName
  /** Visual tone used for background chip + gauge color. */
  tone: CategoryTone
  /** Short right-side tagline on the score card (e.g. "WCAG 2.2 AA"). */
  tagline: string
}

export interface ReportIssue {
  severity: Severity
  title: string
  description: string
}

export interface CategoryDetail {
  id: CategoryId
  /** Section heading. */
  name: string
  /** Subtitle under the heading (e.g., "WCAG 2.2 / ADA compliance"). */
  subtitle: string
  icon: IconName
  tone: CategoryTone
  /** 0-100 */
  score: number
  issueCount: number
  issues: ReportIssue[]
}

export interface ExecSummaryCard {
  /** One of the icons from icons.ts. */
  icon: IconName
  tone: CategoryTone
  title: string
  body: string
}

export interface OpportunityMetric {
  value: string
  label: string
}

export interface Opportunity {
  /** Impact badge text (e.g., "High Impact", "Enrollment Driver", "Quick Win"). */
  impactLabel: string
  tone: CategoryTone
  title: string
  body: string
  metrics: [OpportunityMetric, OpportunityMetric, OpportunityMetric]
}

export interface PriorityItem {
  /** 1-based rank. */
  rank: number
  name: string
  severity: Severity
}

export interface CompetitiveFeature {
  feature: string
  /** Presence on the audited site. */
  subject: boolean
  /** How peers do — short phrase like "Most", "All", "Some". */
  peers: string
}

export interface SeverityCounts {
  critical: number
  high: number
  medium: number
  low: number
}

export interface ScreenshotPair {
  desktop: string
  mobile?: string
  fullPageDownloadUrl?: string
  /** Optional "Early direction sketch" / prototype link shown beneath screenshots. */
  prototypeLink?: { url: string; label: string; body: string }
}

export interface ProgramTag {
  label: string
  /** Visual variant — default, minor, closed, muted. */
  variant?: "default" | "minor" | "closed" | "muted"
}

export interface ProgramCategory {
  icon: IconName
  name: string
  count: number
  tone: CategoryTone
  body: string
  tags: ProgramTag[]
}

/** Industry-agnostic "catalog snapshot" — for education this is programs, for hospitals services, etc. */
export interface CatalogSnapshot {
  sectionLabel: string
  heading: string
  categories: ProgramCategory[]
  /** Optional warning callout about discontinued/stale entries. */
  warning?: {
    heading: string
    body: string
    tags: ProgramTag[]
  }
}

export interface SchemaDeepDive {
  /** Four cards shown in the "Current State" tab. */
  currentState: Array<{
    type: string
    heading: string
    body: string
    present: boolean
  }>
  /** Recommended blocks described on "What's Needed" tab. */
  whatsNeeded: Array<{
    label: string
    heading: string
    body: string
    present: boolean
    note?: string
  }>
  /** JSON-LD code blocks shown in the dedicated tabs. */
  codeBlocks: Array<{
    tabId: string
    tabLabel: string
    introText: string
    /** Pre-formatted JSON-LD code (already escaped for HTML display). */
    code: string
    impact: {
      tone: CategoryTone
      icon: IconName
      body: string
    }
  }>
  /** Four cards on the "Impact" tab. */
  impact: Array<{
    label: string
    tone: CategoryTone
    heading: string
    body: string
  }>
  implementationCallout: {
    heading: string
    body: string
  }
}

export interface HeroFloatTag {
  text: string
  tone: "critical" | "high" | "medium"
}

export interface HeroSection {
  /** Short red pill at top (e.g., "87 issues across 10 categories"). */
  badge: string
  /** Three-line title — first line is plain, second is gradient, third is plain. */
  titleLine1: string
  titleLine2: string
  titleLine3: string
  /** Subtitle paragraph. Supports a single <strong> for the audited URL. */
  subtitle: string
  /** Highlighted URL to bold within the subtitle. */
  subtitleHighlight?: string
  screenshot: string
  /** Up to 3 floating tags positioned around the screenshot. */
  floatTags: HeroFloatTag[]
  stats: Array<{
    number: number
    label: string
    tone: CategoryTone
  }>
}

export interface ClientInfo {
  /** Display name shown in titles, footer, and brand bar. */
  name: string
  /** Fully-qualified URL that was audited. */
  auditedUrl: string
  /** Optional short URL for display (e.g., "coe.edu/academics/majors-areas-study"). */
  auditedUrlDisplay?: string
  /** Optional legal/short institution name for meta tags. */
  shortName?: string
}

export interface ConsultingFirm {
  /** Firm name (e.g., "Stamats"). */
  name: string
  /** Logo path (relative to report output or absolute URL). */
  logoUrl: string
}

export interface HealthScoreSection {
  /** 0-100 */
  score: number
  grade: GradeLetter
  /** Short sentence under the grade badge. */
  body: string
  /** Overall score heading (e.g., "Page scores 18 out of 100"). */
  heading: string
  /** Subtitle paragraph explaining the scoring rubric. */
  subtitle: string
  /** Peer grades shown in two-column grid. */
  subGrades: Array<{
    name: string
    score: number
    grade: GradeLetter
  }>
}

export interface SeveritySection {
  heading: string
  subtitle: string
  counts: SeverityCounts
}

export interface CompetitiveSection {
  heading: string
  subtitle: string
  /** Column header for the subject site (e.g., "Coe"). */
  subjectColumnLabel: string
  features: CompetitiveFeature[]
  warning: {
    heading: string
    body: string
  }
}

export interface PrioritiesSection {
  heading: string
  subtitle: string
  items: PriorityItem[]
}

export interface ExecutiveSummarySection {
  heading: string
  subtitle: string
  cards: ExecSummaryCard[]
}

export interface OpportunitiesSection {
  heading: string
  subtitle: string
  items: Opportunity[]
}

export interface ScreenshotsSection {
  heading: string
  subtitle: string
  images: ScreenshotPair
  /** Up to two callouts beneath the screenshots. */
  callouts?: Array<{
    heading: string
    bodyHtml: string // may contain links (already escaped)
  }>
}

export interface CategoryScoresSection {
  heading: string
  subtitle: string
  categories: CategoryScore[]
}

export interface CategoryDetailsSection {
  categories: CategoryDetail[]
}

/** Report assistant seed — used to power the floating chat widget. */
export interface ReportAssistant {
  /** Initial bot greeting. */
  greeting: string
  /** Pattern-matched Q&A pairs. Each entry fires when any regex in `patterns` matches. */
  responses: Array<{
    /** Regex pattern strings (case-insensitive). */
    patterns: string[]
    /** Answer — may contain **bold** markers. */
    answer: string
  }>
  /** Fallback response when nothing matches. */
  fallback: string
  /** Example chips in the intro popup. */
  exampleChips: Array<{ label: string; query: string }>
  /** Title of the intro popup. */
  introTitle: string
  /** Body of the intro popup (supports a single <strong>). */
  introBody: string
}

/** Meta/head-level information. */
export interface ReportMeta {
  /** Page title. */
  title: string
  /** Meta description. */
  description: string
  /** Open Graph description (falls back to `description` if omitted). */
  ogDescription?: string
  /** Twitter description (falls back to `description` if omitted). */
  twitterDescription?: string
  /** ISO date the report was published. */
  datePublished: string
  /** Human-readable display date (e.g., "March 30, 2026"). */
  dateDisplay: string
  /** Arbitrary additional JSON-LD blocks to inject in <head>. Already-serialized strings. */
  jsonLdBlocks?: string[]
}

export interface StickyNavLink {
  href: string
  label: string
}

export interface ReportData {
  client: ClientInfo
  firm: ConsultingFirm
  meta: ReportMeta
  /** Sticky nav link list (top-to-bottom). */
  nav: StickyNavLink[]
  hero: HeroSection
  healthScore: HealthScoreSection
  executiveSummary: ExecutiveSummarySection
  severity: SeveritySection
  categoryScores: CategoryScoresSection
  screenshots?: ScreenshotsSection
  catalog?: CatalogSnapshot
  opportunities: OpportunitiesSection
  categoryDetails: CategoryDetailsSection
  schemaDeepDive?: SchemaDeepDive
  competitive: CompetitiveSection
  priorities: PrioritiesSection
  assistant: ReportAssistant
  /** Footer text — supports "Confidential" line override. */
  footer?: {
    confidentiality?: string
  }
}

/** Complete list of icon names known to the icon registry. Keep in sync with icons.ts. */
export type IconName =
  | "eye"
  | "search"
  | "file"
  | "bar-chart"
  | "sparkle"
  | "shield"
  | "trophy"
  | "zap"
  | "edit"
  | "layout"
  | "cap"
  | "book"
  | "stethoscope"
  | "external"
  | "target"
  | "check"
  | "x"
  | "desktop"
  | "mobile"
  | "chat"
  | "chevron-down"
  | "arrow-up"
  | "send"
  | "link"
