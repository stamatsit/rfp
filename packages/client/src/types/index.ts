// Shared types for RFP & Proposals

export type ItemStatus = "Approved" | "Draft"

export interface Topic {
  id: string
  name: string
  displayName: string
  createdAt: number
}

export interface AnswerItem {
  id: string
  question: string
  answer: string
  topicId: string
  subtopic?: string
  status: ItemStatus
  tags: string[]
  fingerprint: string
  createdAt: number
  updatedAt: number
  // Joined fields
  topic?: Topic
  linkedPhotosCount?: number
}

export interface PhotoAsset {
  id: string
  displayTitle: string
  topicId: string
  status: ItemStatus
  tags: string[]
  description?: string
  storageKey: string
  originalFilename: string
  fileSize?: number
  mimeType?: string
  createdAt: number
  updatedAt: number
  // Joined fields
  topic?: Topic
  linkedAnswersCount?: number
}

export interface LinkAnswerPhoto {
  answerItemId: string
  photoAssetId: string
  createdAt: number
  createdBy: string
}

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

export interface AuditLogEntry {
  id: string
  actionType: AuditActionType
  entityType: AuditEntityType
  entityId?: string
  details?: Record<string, unknown>
  actor: string
  createdAt: number
}

// Import types
export interface ImportIssue {
  row: number
  type: "missing_required" | "collision" | "invalid_format"
  field?: string
  message: string
}

export interface ImportPreview {
  totalRows: number
  previewRows: Array<{
    row: number
    question: string
    answer: string
    category: string
    subcategory?: string
    tags?: string[]
  }>
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
}

export interface SearchResult {
  answers: AnswerItem[]
  photos: PhotoAsset[]
  totalAnswers: number
  totalPhotos: number
}

// AI types
export interface AISource {
  id: string
  question: string
  answer: string
}

export interface AIResponse {
  response: string
  sources: AISource[]
  refused: boolean
  refusalReason?: string
}
