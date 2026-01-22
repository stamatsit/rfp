// Shared types for RFP & Proposals Server

export type ItemStatus = "Approved" | "Draft"

export type AuditActionType =
  | "IMPORT"
  | "EDIT"
  | "RENAME"
  | "DOWNLOAD"
  | "COPY"
  | "LINK"
  | "UNLINK"
  | "AI_REQUEST"

export type AuditEntityType = "ANSWER" | "PHOTO" | "SYSTEM"

// Import types
export interface ImportIssue {
  row: number
  type: "missing_required" | "collision" | "invalid_format"
  field?: string
  message: string
}

export interface ImportPreviewRow {
  row: number
  question: string
  answer: string
  category: string
  subcategory?: string
  tags?: string[]
}

export interface ImportPreview {
  totalRows: number
  previewRows: ImportPreviewRow[]
  issues: ImportIssue[]
  newCount: number
  updateCount: number
}

export interface ImportResult {
  success: boolean
  imported: number
  updated: number
  skipped: number
  issues: ImportIssue[]
}

// Search types
export type SearchItemType = "all" | "answers" | "photos"

export interface SearchFilters {
  type: SearchItemType
  topicId?: string
  status?: ItemStatus
  query?: string
  limit?: number
  offset?: number
}

// AI types
export interface AISource {
  id: string
  question: string
  answer: string
}

export interface AIRequest {
  query: string
  formatInstructions?: string
  includePhotos?: boolean
}

export interface AIResponse {
  response: string
  sources: AISource[]
  refused: boolean
  refusalReason?: string
}
