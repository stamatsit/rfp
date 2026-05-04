// URL Scanner types

export type Severity = "error" | "warning" | "info"
export type Category = "headings" | "images" | "landmarks" | "forms" | "performance" | "contrast" | "security" | "structure"

export interface ScanOptions {
  wcagLevel?: "A" | "AA" | "AAA"
  timeout?: number
}

export interface ScanIssue {
  ruleId: string
  category: Category
  severity: Severity
  message: string
  element?: string
  selector?: string
  line?: number
  suggestion?: string
  wcagCriteria?: string
  wcagLevel?: "A" | "AA" | "AAA"
}

export interface HeadingNode {
  level: number
  text: string
  line?: number
  issues: string[]
}

export interface CategoryScore {
  category: Category
  score: number
  errors: number
  warnings: number
  infos: number
}

export interface ScanSummary {
  topPriorities: string[]
  whatsWorking: string[]
}

export interface SiteStructure {
  internalLinks: Array<{ href: string; text: string; count: number }>
  externalLinks: Array<{ href: string; text: string; count: number }>
  navigation: Array<{ href: string; text: string }>  // links found inside <nav>
  pageHierarchy: {
    title?: string
    headingCount: number
    hasHeader: boolean
    hasNav: boolean
    hasMain: boolean
    hasFooter: boolean
    hasAside: boolean
    hasBreadcrumb: boolean
    navLinkCount: number
    sections: Array<{ tag: string; id?: string; ariaLabel?: string }>
  }
}

export interface ScanReport {
  url: string
  scannedAt: string
  fetchTimeMs: number
  htmlSize: number
  domElements: number
  overallScore: number
  categoryScores: CategoryScore[]
  summary: ScanSummary
  issues: ScanIssue[]
  headingTree: HeadingNode[]
  meta: {
    title?: string
    description?: string
    lang?: string
    charset?: string
    viewport?: string
    ogTags: Record<string, string>
    canonical?: string
  }
  securityHeaders: {
    grade: string
    headers: Record<string, { present: boolean; value?: string }>
  }
  siteStructure: SiteStructure
}
