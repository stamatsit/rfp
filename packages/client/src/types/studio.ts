import type { ChartConfig } from "./chat"

// ─── Core Modes ───
export type StudioMode = "editor" | "review"
export type DocumentStatus = "draft" | "final" | "template" | "archived"
export type DocumentSource = "briefing" | "manual" | "review" | "ai-generated"
export type TemplateCategory = "proposal" | "case-study" | "report" | "presentation" | "custom"
export type AssetType = "image" | "svg" | "chart-snapshot" | "document-snippet" | "logo" | "icon"
export type SaveStatus = "saving" | "saved" | "unsaved" | "error"
export type ColumnLayout = "single" | "two-column" | "sidebar"
export type HeaderStyle = "none" | "minimal" | "branded"

// ─── Letterhead ───
export type LetterheadMode = "none" | "full-image" | "logo-text"

export interface LetterheadTextFields {
  companyName: string
  tagline: string
  address: string
  phone: string
  email: string
  website: string
}

export interface LetterheadConfig {
  mode: LetterheadMode
  fullImageData: string | null     // base64 data URL
  fullImageHeight: number          // px render height
  logoData: string | null          // base64 data URL
  logoWidth: number                // px render width
  textFields: LetterheadTextFields
  alignment: "left" | "center" | "right"
  showDivider: boolean
  dividerColor: string             // empty = use colorAccent
}

export const DEFAULT_LETTERHEAD_TEXT: LetterheadTextFields = {
  companyName: "",
  tagline: "",
  address: "",
  phone: "",
  email: "",
  website: "",
}

export const DEFAULT_LETTERHEAD_HEADER: LetterheadConfig = {
  mode: "none",
  fullImageData: null,
  fullImageHeight: 80,
  logoData: null,
  logoWidth: 48,
  textFields: { ...DEFAULT_LETTERHEAD_TEXT },
  alignment: "left",
  showDivider: true,
  dividerColor: "",
}

export const DEFAULT_LETTERHEAD_FOOTER: LetterheadConfig = {
  mode: "none",
  fullImageData: null,
  fullImageHeight: 60,
  logoData: null,
  logoWidth: 48,
  textFields: { ...DEFAULT_LETTERHEAD_TEXT },
  alignment: "center",
  showDivider: true,
  dividerColor: "",
}

// ─── Format Settings ───
export interface FormatSettings {
  fontFamily: string
  fontSize: string
  layout: "standard" | "wide" | "compact" | "presentation"
  lineHeight: "tight" | "normal" | "relaxed"
  paragraphSpacing: "compact" | "normal" | "generous"
  sectionSpacing: "tight" | "normal" | "breathable"
  pageMargins: "narrow" | "normal" | "wide"
  columnLayout: ColumnLayout
  textAlign: "left" | "center" | "right"
  headerStyle: HeaderStyle
  showPageNumbers: boolean
  showFooter: boolean
  colorAccent: string
  letterheadHeader: LetterheadConfig
  letterheadFooter: LetterheadConfig
}

export const DEFAULT_FORMAT_SETTINGS: FormatSettings = {
  fontFamily: "Inter",
  fontSize: "15px",
  layout: "standard",
  lineHeight: "normal",
  paragraphSpacing: "normal",
  sectionSpacing: "normal",
  pageMargins: "normal",
  columnLayout: "single",
  textAlign: "left",
  headerStyle: "minimal",
  showPageNumbers: true,
  showFooter: false,
  colorAccent: "#10B981",
  letterheadHeader: { ...DEFAULT_LETTERHEAD_HEADER },
  letterheadFooter: { ...DEFAULT_LETTERHEAD_FOOTER },
}

// ─── Documents ───
export interface StudioDocument {
  id: string
  title: string
  content: string
  formatSettings: FormatSettings
  mode: DocumentStatus
  sourceType: DocumentSource
  conversationId: string | null
  userId: string
  tags: string[]
  version: number
  parentId: string | null
  sharedWith: SharedUser[]
  exportHistory: ExportRecord[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface SharedUser {
  userId: string
  permission: "view" | "edit"
}

export interface ExportRecord {
  format: "pdf" | "docx" | "svg" | "markdown" | "html"
  timestamp: string
  filename: string
}

// ─── Templates ───
export interface StudioTemplate {
  id: string
  name: string
  description: string | null
  content: string
  formatSettings: FormatSettings
  category: TemplateCategory
  isSystem: boolean
  userId: string | null
  usageCount: number
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ─── Assets ───
export interface StudioAsset {
  id: string
  userId: string
  name: string
  type: AssetType
  data: string
  thumbnail: string | null
  mimeType: string | null
  fileSize: number | null
  tags: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ─── SVG from AI ───
export interface SVGData {
  svg: string
  title: string
  description?: string
}

// ─── Content Blocks ───
export interface DocumentBlock {
  id: string
  content: string
  source: "user" | "ai-generated" | "briefing" | "template"
  timestamp: Date
  chartData?: ChartConfig
  svgData?: SVGData
}

// ─── Version History ───
export interface DocumentVersion {
  id: string
  documentId: string
  version: number
  title: string
  content: string
  formatSettings: FormatSettings
  changeDescription: string | null
  createdBy: string
  createdAt: string
}
