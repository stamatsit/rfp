/**
 * API client for RFP & Proposals backend
 */

import type { ImportPreview, ImportResult, ImportIssue } from "@/types"
import { addCsrfHeader } from "./csrfToken"

const API_BASE = import.meta.env.VITE_API_URL || "/api"

// Default fetch options to include credentials for session auth
const fetchWithCredentials = async (url: string, options: RequestInit = {}): Promise<Response> => {
  // Add CSRF token for state-changing requests
  const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(options.method?.toUpperCase() || "GET")

  const headers = needsCsrf
    ? await addCsrfHeader(options.headers)
    : options.headers

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  })
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(response.status, errorData.error || `Request failed with status ${response.status}`)
  }
  return response.json()
}

// API response types (server returns slightly different shape)
interface ApiPreviewResponse {
  filename: string
  totalRows: number
  previewRows: Array<{
    row: number
    question: string
    answer: string
    category: string
    subcategory?: string
    tags?: string[]
  }>
  issues: Array<{
    row: number
    type: string
    field?: string
    message: string
  }>
  newCount: number
  updateCount: number
}

interface ApiImportResponse {
  success: boolean
  filename: string
  imported: number
  updated: number
  skipped: number
  issues: Array<{
    row: number
    type: string
    field?: string
    message: string
  }>
}

// Helper to convert API issues to typed issues
function toTypedIssues(issues: ApiPreviewResponse["issues"]): ImportIssue[] {
  return issues.map(issue => ({
    row: issue.row,
    type: issue.type as ImportIssue["type"],
    field: issue.field,
    message: issue.message,
  }))
}

/**
 * Import API
 */
export const importApi = {
  /**
   * Preview an Excel file upload
   */
  async preview(file: File): Promise<ImportPreview & { filename: string }> {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetchWithCredentials(`${API_BASE}/import/preview`, {
      method: "POST",
      body: formData,
    })

    const data = await handleResponse<ApiPreviewResponse>(response)
    return {
      ...data,
      issues: toTypedIssues(data.issues),
    }
  },

  /**
   * Execute an Excel file import
   */
  async execute(file: File): Promise<ImportResult & { filename: string }> {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetchWithCredentials(`${API_BASE}/import/execute`, {
      method: "POST",
      body: formData,
    })

    const data = await handleResponse<ApiImportResponse>(response)
    return {
      ...data,
      issues: toTypedIssues(data.issues),
    }
  },

  /**
   * Preview using sample file (dev only)
   */
  async previewSample(filePath: string): Promise<ImportPreview & { filename: string }> {
    const response = await fetchWithCredentials(`${API_BASE}/import/preview-sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    })

    const data = await handleResponse<ApiPreviewResponse>(response)
    return {
      ...data,
      issues: toTypedIssues(data.issues),
    }
  },

  /**
   * Execute using sample file (dev only)
   */
  async executeSample(filePath: string): Promise<ImportResult & { filename: string }> {
    const response = await fetchWithCredentials(`${API_BASE}/import/execute-sample`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath }),
    })

    const data = await handleResponse<ApiImportResponse>(response)
    return {
      ...data,
      issues: toTypedIssues(data.issues),
    }
  },
}

/**
 * Topics API
 */
export const topicsApi = {
  async getAll() {
    const response = await fetchWithCredentials(`${API_BASE}/topics`)
    return handleResponse<Array<{
      id: string
      name: string
      displayName: string
      createdAt: string
      updatedAt: string
    }>>(response)
  },
}

/**
 * Health API
 */
export const healthApi = {
  async check() {
    const response = await fetchWithCredentials(`${API_BASE}/health`)
    return handleResponse<{
      status: string
      timestamp: string
      version: string
    }>(response)
  },
}

/**
 * Photos API
 */
export interface PhotoUploadMetadata {
  title?: string
  topicId: string
  status?: "Approved" | "Draft"
  tags?: string
  description?: string
}

export interface PhotoResponse {
  id: string
  displayTitle: string
  topicId: string
  status: "Approved" | "Draft"
  tags: string[]
  description?: string
  storageKey: string
  originalFilename: string
  fileSize?: number
  mimeType?: string
  createdAt: string
  updatedAt: string
  linkedAnswersCount?: number
  usageCount: number
  lastUsedAt: string | null
  fileUrl?: string | null // Pre-signed URL from server (avoids per-image API calls)
}

export const photosApi = {
  /**
   * Get all photos with optional filters
   */
  async getAll(filters?: {
    topicId?: string
    status?: "Approved" | "Draft"
    limit?: number
    offset?: number
  }): Promise<PhotoResponse[]> {
    const params = new URLSearchParams()
    if (filters?.topicId) params.set("topicId", filters.topicId)
    if (filters?.status) params.set("status", filters.status)
    if (filters?.limit) params.set("limit", filters.limit.toString())
    if (filters?.offset) params.set("offset", filters.offset.toString())

    const query = params.toString()
    const response = await fetchWithCredentials(`${API_BASE}/photos${query ? `?${query}` : ""}`)
    return handleResponse<PhotoResponse[]>(response)
  },

  /**
   * Get a single photo by ID
   */
  async getById(id: string): Promise<PhotoResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/photos/${id}`)
    return handleResponse<PhotoResponse>(response)
  },

  /**
   * Upload photos with metadata
   */
  async upload(
    files: File[],
    metadata: PhotoUploadMetadata[]
  ): Promise<{ success: boolean; uploaded: number; photos: PhotoResponse[] }> {
    const formData = new FormData()

    for (const file of files) {
      formData.append("files", file)
    }

    formData.append("metadata", JSON.stringify(metadata))

    const response = await fetchWithCredentials(`${API_BASE}/photos/upload`, {
      method: "POST",
      body: formData,
    })

    return handleResponse(response)
  },

  /**
   * Update a photo's metadata
   */
  async update(
    id: string,
    data: {
      displayTitle?: string
      topicId?: string
      status?: "Approved" | "Draft"
      tags?: string[]
      description?: string
    }
  ): Promise<PhotoResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/photos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<PhotoResponse>(response)
  },

  /**
   * Rename a photo
   */
  async rename(id: string, title: string): Promise<PhotoResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/photos/${id}/rename`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    return handleResponse<PhotoResponse>(response)
  },

  /**
   * Get the download URL for a photo
   */
  getDownloadUrl(id: string): string {
    return `${API_BASE}/photos/${id}/download`
  },

  /**
   * Get the display URL for a photo by storage key
   */
  getFileUrl(storageKey: string): string {
    return `${API_BASE}/photos/file/${storageKey}`
  },

  /**
   * Delete a photo
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithCredentials(`${API_BASE}/photos/${id}`, {
      method: "DELETE",
    })
    return handleResponse(response)
  },
}

/**
 * Search API
 */
export interface AnswerResponse {
  id: string
  question: string
  answer: string
  topicId: string
  subtopic?: string
  status: "Approved" | "Draft"
  tags: string[]
  fingerprint: string
  usageCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
  linkedPhotosCount?: number
}

export interface AnswerWithLinkedPhotos extends AnswerResponse {
  linkedPhotos: PhotoResponse[]
}

export interface PhotoWithLinkedAnswers extends PhotoResponse {
  linkedAnswers: AnswerResponse[]
}

export interface SearchResult {
  answers: AnswerResponse[]
  photos: PhotoResponse[]
  totalAnswers: number
  totalPhotos: number
}

export const searchApi = {
  /**
   * Search both answers and photos
   */
  async search(params: {
    q?: string
    type?: "all" | "answers" | "photos"
    topicId?: string
    status?: "Approved" | "Draft"
    limit?: number
    offset?: number
  }): Promise<SearchResult> {
    const searchParams = new URLSearchParams()
    if (params.q) searchParams.set("q", params.q)
    if (params.type) searchParams.set("type", params.type)
    if (params.topicId) searchParams.set("topicId", params.topicId)
    if (params.status) searchParams.set("status", params.status)
    if (params.limit) searchParams.set("limit", params.limit.toString())
    if (params.offset) searchParams.set("offset", params.offset.toString())

    const query = searchParams.toString()
    const response = await fetchWithCredentials(`${API_BASE}/search${query ? `?${query}` : ""}`)
    return handleResponse<SearchResult>(response)
  },

  /**
   * Search answers only
   */
  async searchAnswers(params: {
    q?: string
    topicId?: string
    status?: "Approved" | "Draft"
    limit?: number
  }): Promise<AnswerResponse[]> {
    const searchParams = new URLSearchParams()
    if (params.q) searchParams.set("q", params.q)
    if (params.topicId) searchParams.set("topicId", params.topicId)
    if (params.status) searchParams.set("status", params.status)
    if (params.limit) searchParams.set("limit", params.limit.toString())

    const query = searchParams.toString()
    const response = await fetchWithCredentials(`${API_BASE}/search/answers${query ? `?${query}` : ""}`)
    return handleResponse<AnswerResponse[]>(response)
  },

  /**
   * Search photos only
   */
  async searchPhotos(params: {
    q?: string
    topicId?: string
    status?: "Approved" | "Draft"
    limit?: number
  }): Promise<PhotoResponse[]> {
    const searchParams = new URLSearchParams()
    if (params.q) searchParams.set("q", params.q)
    if (params.topicId) searchParams.set("topicId", params.topicId)
    if (params.status) searchParams.set("status", params.status)
    if (params.limit) searchParams.set("limit", params.limit.toString())

    const query = searchParams.toString()
    const response = await fetchWithCredentials(`${API_BASE}/search/photos${query ? `?${query}` : ""}`)
    return handleResponse<PhotoResponse[]>(response)
  },

  /**
   * Get a single answer with linked photos
   */
  async getAnswer(id: string): Promise<AnswerWithLinkedPhotos> {
    const response = await fetchWithCredentials(`${API_BASE}/search/answers/${id}`)
    return handleResponse<AnswerWithLinkedPhotos>(response)
  },

  /**
   * Get a single photo with linked answers
   */
  async getPhoto(id: string): Promise<PhotoWithLinkedAnswers> {
    const response = await fetchWithCredentials(`${API_BASE}/search/photos/${id}`)
    return handleResponse<PhotoWithLinkedAnswers>(response)
  },

  /**
   * Log a copy event for an answer
   */
  async logCopy(answerId: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/search/answers/${answerId}/copy`, {
      method: "POST",
    })
  },

  /**
   * Link an answer to a photo
   */
  async link(answerId: string, photoId: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/search/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerId, photoId }),
    })
    await handleResponse(response)
  },

  /**
   * Unlink an answer from a photo
   */
  async unlink(answerId: string, photoId: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/search/link`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerId, photoId }),
    })
    await handleResponse(response)
  },

  /**
   * Get photos linked to an answer
   */
  async getLinkedPhotos(answerId: string): Promise<PhotoResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/search/answers/${answerId}/photos`)
    return handleResponse<PhotoResponse[]>(response)
  },

  /**
   * Get answers linked to a photo
   */
  async getLinkedAnswers(photoId: string): Promise<AnswerResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/search/photos/${photoId}/answers`)
    return handleResponse<AnswerResponse[]>(response)
  },
}

/**
 * Answers API
 */
export interface CreateAnswerData {
  question: string
  answer: string
  topicId: string
  subtopic?: string
  status?: "Approved" | "Draft"
  tags?: string[]
}

export interface UpdateAnswerData {
  question?: string
  answer?: string
  topicId?: string
  subtopic?: string
  status?: "Approved" | "Draft"
  tags?: string[]
}

export interface AnswerVersion {
  id: string
  answerItemId: string
  question: string
  answer: string
  topicId: string
  subtopic?: string
  status: "Approved" | "Draft"
  tags: string[]
  versionNumber: number
  createdAt: string
  createdBy: string
  forkedToId?: string | null
}

export const answersApi = {
  /**
   * Get all answers (uses search API with no query)
   */
  async getAll(): Promise<AnswerResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/search/answers`)
    return handleResponse<AnswerResponse[]>(response)
  },

  /**
   * Get a single answer by ID
   */
  async getById(id: string): Promise<AnswerResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/search/answers/${id}`)
    return handleResponse<AnswerResponse>(response)
  },

  /**
   * Create a new answer entry
   */
  async create(data: CreateAnswerData): Promise<AnswerResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<AnswerResponse>(response)
  },

  /**
   * Update an existing answer
   */
  async update(id: string, data: UpdateAnswerData): Promise<AnswerResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/answers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<AnswerResponse>(response)
  },

  /**
   * Delete an answer
   */
  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchWithCredentials(`${API_BASE}/answers/${id}`, {
      method: "DELETE",
    })
    return handleResponse(response)
  },

  /**
   * Get version history for an answer
   */
  async getVersions(id: string): Promise<AnswerVersion[]> {
    const response = await fetchWithCredentials(`${API_BASE}/answers/${id}/versions`)
    return handleResponse<AnswerVersion[]>(response)
  },

  /**
   * Fork an answer — creates a new entry with edited content and records the
   * fork event in the original's version history.
   */
  async fork(sourceId: string, data: CreateAnswerData): Promise<AnswerResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/answers/${sourceId}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<AnswerResponse>(response)
  },
}

/**
 * AI API
 */
export interface AIQueryResponse {
  response: string
  sources: Array<{
    id: string
    question: string
    answer: string
  }>
  photos: Array<{
    id: string
    displayTitle: string
    description: string | null
    storageKey: string
    fileUrl?: string
  }>
  refused: boolean
  refusalReason?: string
}

export interface AIStatusResponse {
  configured: boolean
  model: string | null
  message: string
}

export type AdaptationType = "shorten" | "expand" | "bullets" | "formal" | "casual" | "custom"

export interface AIAdaptResponse {
  adaptedContent: string
  originalContent: string
  instruction: string
  refused: boolean
  refusalReason?: string
}

/**
 * RFP API
 */
export interface ExtractedImage {
  dataUrl: string
  name: string
  width: number
  height: number
  pageNumber?: number
  contentType: string
  sizeBytes: number
}

export interface RFPExtractResponse {
  text: string
  filename: string
  pageCount?: number
  images?: ExtractedImage[]
}

export interface RFPStatusResponse {
  available: boolean
  supportedFormats: string[]
  maxFileSize: string
}

export interface ScanFlag {
  id: string
  severity: "high" | "medium" | "low"
  category: string
  title: string
  excerpt: string
  position?: number
  dismissed: boolean
  note?: string
  criterionId?: string
}

export interface ScanCriterion {
  id: string
  userId: string
  label: string
  description?: string | null
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ScanCriterionSnapshot {
  id: string
  label: string
  description?: string
}

export interface ScanResponse {
  documentId: string
  flags: ScanFlag[]
  summary: string
  scannedAt: string
}

export interface SavedDocument {
  id: string
  name: string
  type: "RFP" | "Proposal" | "Other"
  originalFilename: string
  mimeType?: string
  fileSize?: number
  pageCount?: number
  extractedText: string
  notes?: string
  tags: string[]
  userId?: string
  uploaderName?: string
  scanResults?: ScanFlag[]
  scanCriteria?: ScanCriterionSnapshot[]
  scanSummary?: string
  scannedAt?: string
  createdAt: string
  updatedAt: string
}

export interface SaveDocumentInput {
  name: string
  type?: "RFP" | "Proposal" | "Other"
  originalFilename: string
  mimeType?: string
  fileSize?: number
  pageCount?: number
  extractedText: string
  notes?: string
  tags?: string[]
}

export interface ListDocumentsResponse {
  documents: SavedDocument[]
  total: number
}

export const rfpApi = {
  /**
   * Extract text from an uploaded RFP document (PDF, DOCX, DOC, TXT)
   */
  async extract(file: File): Promise<RFPExtractResponse> {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetchWithCredentials(`${API_BASE}/rfp/extract`, {
      method: "POST",
      body: formData,
    })
    return handleResponse<RFPExtractResponse>(response)
  },

  /**
   * Check RFP service status and supported formats
   */
  async getStatus(): Promise<RFPStatusResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/status`)
    return handleResponse<RFPStatusResponse>(response)
  },

  /**
   * Save a document
   */
  async saveDocument(data: SaveDocumentInput): Promise<SavedDocument> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<SavedDocument>(response)
  },

  /**
   * List saved documents
   */
  async listDocuments(params?: {
    type?: "RFP" | "Proposal" | "Other"
    search?: string
    limit?: number
    offset?: number
  }): Promise<ListDocumentsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.type) searchParams.set("type", params.type)
    if (params?.search) searchParams.set("search", params.search)
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.offset) searchParams.set("offset", params.offset.toString())

    const query = searchParams.toString()
    const response = await fetchWithCredentials(`${API_BASE}/rfp/documents${query ? `?${query}` : ""}`)
    return handleResponse<ListDocumentsResponse>(response)
  },

  /**
   * Get a document by ID
   */
  async getDocument(id: string): Promise<SavedDocument> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/documents/${id}`)
    return handleResponse<SavedDocument>(response)
  },

  /**
   * Update a document
   */
  async updateDocument(
    id: string,
    data: { name?: string; type?: "RFP" | "Proposal" | "Other"; notes?: string; tags?: string[] }
  ): Promise<SavedDocument> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<SavedDocument>(response)
  },

  /**
   * Delete a document
   */
  async deleteDocument(id: string): Promise<{ success: boolean }> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/documents/${id}`, {
      method: "DELETE",
    })
    return handleResponse<{ success: boolean }>(response)
  },

  /**
   * AI scan a document for flags
   */
  async scan(data: {
    documentId?: string
    documentText: string
    documentType: "RFP" | "Proposal"
    criteria: ScanCriterionSnapshot[]
    originalFilename?: string
    mimeType?: string
    fileSize?: number
    pageCount?: number
    name?: string
  }): Promise<ScanResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ScanResponse>(response)
  },

  /**
   * Get scan criteria (user custom + system defaults)
   */
  async getScanCriteria(): Promise<{ criteria: ScanCriterion[]; defaults: ScanCriterion[] }> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/scan-criteria`)
    return handleResponse<{ criteria: ScanCriterion[]; defaults: ScanCriterion[] }>(response)
  },

  /**
   * Add a custom scan criterion
   */
  async addScanCriterion(data: { label: string; description?: string }): Promise<ScanCriterion> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/scan-criteria`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ScanCriterion>(response)
  },

  /**
   * Delete a custom scan criterion
   */
  async deleteScanCriterion(id: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/scan-criteria/${id}`, {
      method: "DELETE",
    })
    await handleResponse(response)
  },

  /**
   * Update flags on a document (dismiss, add notes)
   */
  async updateFlags(documentId: string, flags: ScanFlag[]): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/documents/${documentId}/flags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flags }),
    })
    await handleResponse(response)
  },

  /**
   * Save extracted images to the photo library
   */
  async saveImages(
    images: Array<{ dataUrl: string; name: string; contentType: string }>,
    topicId: string,
    documentName: string
  ): Promise<{ success: boolean; saved: number; photos: PhotoResponse[] }> {
    const response = await fetchWithCredentials(`${API_BASE}/rfp/save-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images, topicId, documentName }),
    })
    return handleResponse(response)
  },
}

export const aiApi = {
  /**
   * Query the AI with a question
   * AI will only respond using approved library content
   */
  async query(params: {
    query: string
    topicId?: string
    maxSources?: number
  }): Promise<AIQueryResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/ai/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
    return handleResponse<AIQueryResponse>(response)
  },

  /**
   * Check if AI service is configured
   */
  async getStatus(): Promise<AIStatusResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/ai/status`)
    return handleResponse<AIStatusResponse>(response)
  },

  /**
   * Adapt content for specific RFP needs
   * Supports: shorten, expand, bullets, formal, casual, custom
   */
  async adapt(params: {
    content: string
    adaptationType: AdaptationType
    customInstruction?: string
    targetWordCount?: number
    clientName?: string
    industry?: string
  }): Promise<AIAdaptResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/ai/adapt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
    return handleResponse<AIAdaptResponse>(response)
  },

  async adaptBulk(params: {
    items: Array<{ id: string; content: string }>
    adaptationType: AdaptationType
    customInstruction?: string
    targetWordCount?: number
    clientName?: string
    industry?: string
  }): Promise<{ results: Array<AIAdaptResponse & { id: string }> }> {
    const response = await fetchWithCredentials(`${API_BASE}/ai/adapt-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
    return handleResponse<{ results: Array<AIAdaptResponse & { id: string }> }>(response)
  },
}

// ─── Case Studies AI Builder ────────────────────────────────

export interface CaseStudyInsightResponse {
  response: string
  dataUsed: {
    totalCaseStudies: number
    totalTestimonials: number
    totalStats: number
    categoriesSearched: string[]
  }
  followUpPrompts: string[]
  refused: boolean
  refusalReason?: string
}

export const caseStudiesApi = {
  async query(query: string): Promise<CaseStudyInsightResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/ai/case-studies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    return handleResponse<CaseStudyInsightResponse>(response)
  },
}

/**
 * Proposal Insights API
 * COMPLETELY ISOLATED from the Q&A library AI (aiApi)
 */

export interface ProposalInsightResponse {
  response: string
  dataUsed: {
    totalProposals: number
    dateRange: { from: string | null; to: string | null }
    overallWinRate: number
    wonCount: number
    lostCount: number
    pendingCount: number
  }
  followUpPrompts: string[]
  refused: boolean
  refusalReason?: string
}

export interface ProposalSyncStatus {
  configured: boolean
  filePath: string | null
  fileExists: boolean
  lastSync: string | null
  lastSyncStatus: string | null
  totalProposals: number
}

export interface ProposalSyncResult {
  synced: boolean
  message: string
  result?: {
    imported: number
    updated: number
    skipped: number
  }
}

export const proposalInsightsApi = {
  /**
   * Query the Proposal Insights AI
   * This AI ONLY analyzes proposal data - completely separate from the library AI
   */
  async query(query: string): Promise<ProposalInsightResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/proposals/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    return handleResponse<ProposalInsightResponse>(response)
  },

  /**
   * Get sync status for proposal data
   */
  async getSyncStatus(): Promise<ProposalSyncStatus> {
    const response = await fetchWithCredentials(`${API_BASE}/proposals/sync/status`)
    return handleResponse<ProposalSyncStatus>(response)
  },

  /**
   * Manually trigger a sync of proposal data
   */
  async triggerSync(): Promise<ProposalSyncResult> {
    const response = await fetchWithCredentials(`${API_BASE}/proposals/sync/trigger`, {
      method: "POST",
    })
    return handleResponse<ProposalSyncResult>(response)
  },

  /**
   * Get structured proposal metrics for the Library data browser
   */
  async getMetrics(): Promise<ProposalMetrics> {
    const response = await fetchWithCredentials(`${API_BASE}/proposals/metrics`)
    return handleResponse<ProposalMetrics>(response)
  },
}

export interface ProposalMetrics {
  summary: {
    total: number
    won: number
    lost: number
    pending: number
    winRate: number
    dateRange: { from: string | null; to: string | null }
  } | null
  byService: Record<string, { won: number; total: number; rate: number }>
  byCE: Record<string, { won: number; total: number; rate: number }>
  bySchoolType: Record<string, { won: number; total: number; rate: number }>
  byYear: Record<string, { won: number; total: number; rate: number }>
  byAffiliation: Record<string, { won: number; total: number; rate: number }>
  byCategory: Record<string, { won: number; total: number; rate: number }>
}

// ─── Client Success Data API ──────

export interface ClientSuccessEntryResponse {
  id: string
  client: string
  category: "higher-ed" | "healthcare" | "other"
  focus: string
  challenge: string | null
  solution: string | null
  metrics: { label: string; value: string }[]
  testimonialQuote: string | null
  testimonialAttribution: string | null
  usageCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ClientSuccessResultResponse {
  id: string
  metric: string
  result: string
  client: string
  numericValue: number
  direction: "increase" | "decrease"
  usageCount: number
  lastUsedAt: string | null
  createdAt: string
}

export interface ClientSuccessTestimonialResponse {
  id: string
  quote: string
  name: string | null
  title: string | null
  organization: string
  source: string | null
  status: "approved" | "draft" | "hidden"
  sector: "higher-ed" | "healthcare" | "other" | null
  tags: string[]
  usageCount: number
  lastUsedAt: string | null
  featured: boolean
  addedBy: string | null
  approvedBy: string | null
  approvedAt: string | null
  fingerprint: string | null
  notes: string | null
  testimonialDate: string | null
  createdAt: string
  updatedAt: string
}

export interface TestimonialListResponse {
  testimonials: ClientSuccessTestimonialResponse[]
  total: number
}

export interface TestimonialFinderMatch {
  testimonialId: string
  quote: string
  name: string | null
  title: string | null
  organization: string
  sector: string | null
  relevanceReason: string
}

export interface TestimonialFinderResponse {
  matches: TestimonialFinderMatch[]
  totalSearched: number
  tokensUsed: number
  error?: string
}

export interface ClientSuccessAwardResponse {
  id: string
  name: string
  year: string
  clientOrProject: string
  companyName: string | null
  issuingAgency: string | null
  category: string | null
  awardLevel: string | null
  submissionStatus: "client-submission" | "stamats-submission" | "other" | null
  badgeStorageKey: string | null
  notes: string | null
  usageCount: number
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export const clientSuccessApi = {
  // Entries
  async getEntries(): Promise<ClientSuccessEntryResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/entries`)
    return handleResponse<ClientSuccessEntryResponse[]>(response)
  },
  async createEntry(data: {
    client: string; category: string; focus: string;
    challenge?: string; solution?: string;
    metrics?: { label: string; value: string }[];
    testimonialQuote?: string; testimonialAttribution?: string;
  }): Promise<ClientSuccessEntryResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/entries`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    })
    return handleResponse<ClientSuccessEntryResponse>(response)
  },
  async deleteEntry(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/entries/${id}`, { method: "DELETE" })
  },
  async incrementEntryUsage(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/entries/${id}/usage`, { method: "PATCH" })
  },

  // Results
  async getResults(): Promise<ClientSuccessResultResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/results`)
    return handleResponse<ClientSuccessResultResponse[]>(response)
  },
  async createResult(data: {
    metric: string; result: string; client: string; numericValue: number; direction: string;
  }): Promise<ClientSuccessResultResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/results`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    })
    return handleResponse<ClientSuccessResultResponse>(response)
  },
  async deleteResult(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/results/${id}`, { method: "DELETE" })
  },
  async incrementResultUsage(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/results/${id}/usage`, { method: "PATCH" })
  },

  // Testimonials (legacy — use testimonialsApi for full CRUD)
  async getTestimonials(): Promise<TestimonialListResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials`)
    return handleResponse<TestimonialListResponse>(response)
  },

  // Awards
  async getAwards(): Promise<ClientSuccessAwardResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards`)
    return handleResponse<ClientSuccessAwardResponse[]>(response)
  },
  async createAward(data: {
    name: string; year: string; clientOrProject: string;
  }): Promise<ClientSuccessAwardResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
    })
    return handleResponse<ClientSuccessAwardResponse>(response)
  },
  async deleteAward(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/awards/${id}`, { method: "DELETE" })
  },
  async incrementAwardUsage(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/awards/${id}/usage`, { method: "PATCH" })
  },
}

// ─── Awards API (Full CRUD + badge upload) ──────────

export const awardsApi = {
  async list(): Promise<ClientSuccessAwardResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards`)
    return handleResponse<ClientSuccessAwardResponse[]>(response)
  },

  async create(data: {
    name: string
    year: string
    companyName?: string
    issuingAgency?: string
    category?: string
    awardLevel?: string
    submissionStatus?: "client-submission" | "stamats-submission" | "other"
    notes?: string
  }): Promise<ClientSuccessAwardResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ClientSuccessAwardResponse>(response)
  },

  async update(id: string, data: {
    name: string
    year: string
    companyName?: string
    issuingAgency?: string
    category?: string
    awardLevel?: string
    submissionStatus?: "client-submission" | "stamats-submission" | "other" | null
    notes?: string
  }): Promise<ClientSuccessAwardResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ClientSuccessAwardResponse>(response)
  },

  async delete(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/awards/${id}`, { method: "DELETE" })
  },

  async incrementUsage(id: string): Promise<ClientSuccessAwardResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards/${id}/usage`, { method: "PATCH" })
    return handleResponse<ClientSuccessAwardResponse>(response)
  },

  async uploadBadge(id: string, file: File): Promise<ClientSuccessAwardResponse> {
    const formData = new FormData()
    formData.append("badge", file)
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards/${id}/badge`, {
      method: "POST",
      body: formData,
    })
    return handleResponse<ClientSuccessAwardResponse>(response)
  },

  async deleteBadge(id: string): Promise<ClientSuccessAwardResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/awards/${id}/badge`, { method: "DELETE" })
    return handleResponse<ClientSuccessAwardResponse>(response)
  },

  getBadgeUrl(storageKey: string): string {
    return `${API_BASE}/photos/file/${storageKey}`
  },
}

// ─── Testimonials API (Full CRUD + AI Finder) ──────

export const testimonialsApi = {
  async list(params?: {
    status?: "approved" | "draft" | "hidden"
    sector?: "higher-ed" | "healthcare" | "other"
    search?: string
    sort?: "recent" | "most-used" | "org-asc" | "shortest" | "longest"
    limit?: number
    offset?: number
    featured?: boolean
  }): Promise<TestimonialListResponse> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set("status", params.status)
    if (params?.sector) searchParams.set("sector", params.sector)
    if (params?.search) searchParams.set("search", params.search)
    if (params?.sort) searchParams.set("sort", params.sort)
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.offset) searchParams.set("offset", params.offset.toString())
    if (params?.featured) searchParams.set("featured", "true")
    const query = searchParams.toString()
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials${query ? `?${query}` : ""}`)
    return handleResponse<TestimonialListResponse>(response)
  },

  async getById(id: string): Promise<ClientSuccessTestimonialResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials/${id}`)
    return handleResponse<ClientSuccessTestimonialResponse>(response)
  },

  async create(data: {
    quote: string
    name?: string
    title?: string
    organization: string
    source?: string
    sector?: "higher-ed" | "healthcare" | "other"
    tags?: string[]
    notes?: string
    testimonialDate?: string | null
  }): Promise<ClientSuccessTestimonialResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ClientSuccessTestimonialResponse>(response)
  },

  async update(id: string, data: {
    quote: string
    name?: string
    title?: string
    organization: string
    source?: string
    sector?: "higher-ed" | "healthcare" | "other" | null
    tags?: string[]
    notes?: string
    testimonialDate?: string | null
  }): Promise<ClientSuccessTestimonialResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ClientSuccessTestimonialResponse>(response)
  },

  async updateStatus(id: string, status: "approved" | "draft" | "hidden"): Promise<ClientSuccessTestimonialResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    return handleResponse<ClientSuccessTestimonialResponse>(response)
  },

  async incrementUsage(id: string): Promise<ClientSuccessTestimonialResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials/${id}/usage`, {
      method: "PATCH",
    })
    return handleResponse<ClientSuccessTestimonialResponse>(response)
  },

  async toggleFeatured(id: string): Promise<ClientSuccessTestimonialResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials/${id}/featured`, {
      method: "PATCH",
    })
    return handleResponse<ClientSuccessTestimonialResponse>(response)
  },

  async bulkUpdateStatus(ids: string[], status: "approved" | "draft" | "hidden"): Promise<{ updated: number; testimonials: ClientSuccessTestimonialResponse[] }> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/testimonials/bulk-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    })
    return handleResponse<{ updated: number; testimonials: ClientSuccessTestimonialResponse[] }>(response)
  },

  async delete(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/testimonials/${id}`, { method: "DELETE" })
  },

  async findWithAI(description: string, filters?: { sector?: string; limit?: number }): Promise<TestimonialFinderResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/ai/testimonial-finder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, ...filters }),
    })
    return handleResponse<TestimonialFinderResponse>(response)
  },
}

// ─── Clients API (user-added clients, merged with hardcoded namedClients) ──────

export interface ClientResponse {
  id: string
  name: string
  sector: "higher-ed" | "healthcare" | "other"
  notes: string | null
  createdAt: string
  updatedAt: string
}

export const clientsApi = {
  async list(): Promise<ClientResponse[]> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/clients`)
    return handleResponse<ClientResponse[]>(response)
  },
  async create(data: { name: string; sector: "higher-ed" | "healthcare" | "other"; notes?: string }): Promise<ClientResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ClientResponse>(response)
  },
  async update(id: string, data: { name: string; sector: "higher-ed" | "healthcare" | "other"; notes?: string }): Promise<ClientResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/clients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ClientResponse>(response)
  },
  async delete(id: string): Promise<void> {
    await fetchWithCredentials(`${API_BASE}/client-success/clients/${id}`, { method: "DELETE" })
  },
}

// ─── Client Portfolio API ──────────────────────

export interface ClientProfileApiResponse {
  caseStudies: ClientSuccessEntryResponse[]
  results: ClientSuccessResultResponse[]
  testimonials: ClientSuccessTestimonialResponse[]
  awards: ClientSuccessAwardResponse[]
  proposals: {
    id: string
    date: string | null
    ce: string | null
    client: string | null
    projectType: string | null
    won: "Yes" | "No" | "Pending" | "Cancelled" | null
    category: string | null
    servicesOffered: string[]
    sheetName: string | null
  }[]
}

export interface LinkedQaAnswer {
  linkId: string
  linkedBy: string | null
  linkedAt: string
  answerId: string
  question: string
  answer: string
  status: string
  topic: string | null
  tags: string[]
  usageCount: number
}

export interface ClientWinRate {
  won: number
  total: number
  lost: number
  pending: number
  rate: number
  lastProposalDate: string | null
}

export const clientPortfolioApi = {
  async getClientProfile(clientName: string): Promise<ClientProfileApiResponse> {
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/client-profile/${encodeURIComponent(clientName)}`
    )
    return handleResponse<ClientProfileApiResponse>(response)
  },
  async generateBrief(clientName: string, clientContext: Record<string, unknown>): Promise<{ markdown: string }> {
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/client-brief/${encodeURIComponent(clientName)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientContext }) }
    )
    return handleResponse<{ markdown: string }>(response)
  },
  async getWinRates(): Promise<Record<string, ClientWinRate>> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/client-win-rates`)
    return handleResponse<Record<string, ClientWinRate>>(response)
  },
  async gapAnalysis(_clientName: string, clientContext: unknown): Promise<{ markdown: string }> {
    const response = await fetchWithCredentials(`${API_BASE}/ai/client-gap-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientContext }),
    })
    return handleResponse<{ markdown: string }>(response)
  },
}

export const clientQaApi = {
  async list(clientName: string): Promise<LinkedQaAnswer[]> {
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/qa-links/${encodeURIComponent(clientName.toLowerCase())}`
    )
    return handleResponse<LinkedQaAnswer[]>(response)
  },
  async listByAnswers(answerIds: string[]): Promise<Record<string, string[]>> {
    if (answerIds.length === 0) return {}
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/qa-links/by-answers?ids=${answerIds.join(",")}`
    )
    return handleResponse<Record<string, string[]>>(response)
  },
  async link(clientName: string, answerId: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/qa-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName: clientName.toLowerCase(), answerId }),
    })
    await handleResponse<unknown>(response)
  },
  async unlink(linkId: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/qa-links/${linkId}`, { method: "DELETE" })
    await handleResponse<unknown>(response)
  },
}

// ─── Client Documents API ──────────────────────────────────────────

export interface ClientDocument {
  id: string
  clientName: string
  title: string
  docType: string
  storageKey: string
  originalFilename: string
  fileSize: number | null
  mimeType: string | null
  summary: string | null
  keyPoints: string[] | null
  uploadedBy: string | null
  createdAt: string
}

export const clientDocumentsApi = {
  async list(clientName: string): Promise<ClientDocument[]> {
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/documents/${encodeURIComponent(clientName.toLowerCase())}`
    )
    return handleResponse<ClientDocument[]>(response)
  },

  async upload(clientName: string, file: File, title: string, docType: string): Promise<ClientDocument> {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("clientName", clientName.toLowerCase())
    formData.append("title", title)
    formData.append("docType", docType)
    const response = await fetchWithCredentials(`${API_BASE}/client-success/documents`, {
      method: "POST",
      body: formData,
    })
    return handleResponse<ClientDocument>(response)
  },

  async download(id: string, filename: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/documents/${id}/download`)
    if (!response.ok) throw new Error("Download failed")
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  },

  async patch(id: string, data: { title?: string; docType?: string }): Promise<ClientDocument> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ClientDocument>(response)
  },

  async delete(id: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/documents/${id}`, { method: "DELETE" })
    await handleResponse<unknown>(response)
  },

  async getText(id: string): Promise<{ extractedText: string | null }> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/documents/${id}/text`)
    return handleResponse<{ extractedText: string | null }>(response)
  },

  async getSummary(id: string): Promise<{ summary: string | null; keyPoints: string[] | null }> {
    const response = await fetchWithCredentials(`${API_BASE}/client-success/documents/${id}/summary`)
    return handleResponse<{ summary: string | null; keyPoints: string[] | null }>(response)
  },
}

// ─── Client Brand Kit API ──────────────────────────────────────────

export interface ClientBrandKit {
  id: string
  clientName: string
  websiteUrl: string | null
  scrapedAt: string | null
  logoStorageKey: string | null
  logoUrl: string | null
  primaryColor: string | null
  secondaryColor: string | null
  accentColor: string | null
  backgroundColor: string | null
  textColor: string | null
  rawColors: string[] | null
  primaryFont: string | null
  secondaryFont: string | null
  fontStack: string | null
  tone: string | null
  styleNotes: string | null
  scrapeStatus: "pending" | "success" | "partial" | "failed" | null
  scrapeError: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export const clientBrandKitApi = {
  async get(clientName: string): Promise<ClientBrandKit | null> {
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/brand-kit/${encodeURIComponent(clientName.toLowerCase())}`
    )
    return handleResponse<ClientBrandKit | null>(response)
  },

  async scrape(clientName: string, websiteUrl: string): Promise<ClientBrandKit> {
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/brand-kit/${encodeURIComponent(clientName.toLowerCase())}/scrape`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl }),
      }
    )
    return handleResponse<ClientBrandKit>(response)
  },

  async update(clientName: string, data: Partial<ClientBrandKit>): Promise<ClientBrandKit> {
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/brand-kit/${encodeURIComponent(clientName.toLowerCase())}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }
    )
    return handleResponse<ClientBrandKit>(response)
  },

  async uploadLogo(clientName: string, file: File): Promise<ClientBrandKit> {
    const formData = new FormData()
    formData.append("logo", file)
    const response = await fetchWithCredentials(
      `${API_BASE}/client-success/brand-kit/${encodeURIComponent(clientName.toLowerCase())}/logo`,
      { method: "POST", body: formData }
    )
    return handleResponse<ClientBrandKit>(response)
  },
}

// ─── Unified AI API (Cross-Referential AI) ──────

export interface UnifiedAIResponse {
  response: string
  dataUsed: {
    proposals: { count: number; winRate: number; relevantClients: string[] }
    caseStudies: { count: number; clients: string[]; testimonials: number }
    library: { answers: number; photos: number; topics: string[] }
  }
  crossReferenceInsights: string[]
  followUpPrompts: string[]
  refused: boolean
  refusalReason?: string
}

export interface UnifiedAIStats {
  proposals: { count: number; winRate: number }
  caseStudies: { count: number; testimonials: number }
  library: { answers: number; photos: number }
}

export const unifiedAIApi = {
  /**
   * Query the Unified AI — cross-references all data sources
   */
  async query(query: string): Promise<UnifiedAIResponse> {
    const response = await fetchWithCredentials(`${API_BASE}/unified-ai/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    })
    return handleResponse<UnifiedAIResponse>(response)
  },

  /**
   * Get stats for the status bar
   */
  async getStats(): Promise<UnifiedAIStats> {
    const response = await fetchWithCredentials(`${API_BASE}/unified-ai/stats`)
    return handleResponse<UnifiedAIStats>(response)
  },
}

// ─── Conversations (Chat History) ─────────────────────────────────

export type ConversationPage = "ask-ai" | "case-studies" | "proposal-insights" | "unified-ai" | "studio" | "studio-review" | "general" | "companion" | "humanizer"

export interface ConversationSummary {
  id: string
  page: ConversationPage
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ConversationFull {
  id: string
  page: ConversationPage
  title: string
  messages: { role: "user" | "assistant"; content: string; timestamp: string }[]
  createdAt: string
  updatedAt: string
}

export const conversationsApi = {
  async list(page?: ConversationPage): Promise<ConversationSummary[]> {
    const params = page ? `?page=${page}` : ""
    const response = await fetchWithCredentials(`${API_BASE}/conversations${params}`)
    return handleResponse<ConversationSummary[]>(response)
  },

  async get(id: string): Promise<ConversationFull> {
    const response = await fetchWithCredentials(`${API_BASE}/conversations/${id}`)
    return handleResponse<ConversationFull>(response)
  },

  async create(data: { page: ConversationPage; title: string; messages?: ConversationFull["messages"] }): Promise<ConversationFull> {
    const response = await fetchWithCredentials(`${API_BASE}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ConversationFull>(response)
  },

  async update(id: string, data: { title?: string; messages?: ConversationFull["messages"] }): Promise<ConversationFull> {
    const response = await fetchWithCredentials(`${API_BASE}/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<ConversationFull>(response)
  },

  async delete(id: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/conversations/${id}`, {
      method: "DELETE",
    })
    if (!response.ok) throw new ApiError(response.status, "Failed to delete conversation")
  },

  async generateTitle(id: string, messages: Array<{ role: string; content: string }>): Promise<{ title: string }> {
    const response = await fetchWithCredentials(`${API_BASE}/conversations/${id}/generate-title`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    })
    return handleResponse<{ title: string }>(response)
  },
}

// ─── Studio API (Documents, Templates, Assets) ─────────────────────────────────

export const studioApi = {
  // Documents
  async listDocuments(params?: { mode?: string; search?: string; sourceType?: string }): Promise<unknown[]> {
    const query = new URLSearchParams()
    if (params?.mode) query.set("mode", params.mode)
    if (params?.search) query.set("search", params.search)
    if (params?.sourceType) query.set("sourceType", params.sourceType)
    const qs = query.toString() ? `?${query.toString()}` : ""
    const response = await fetchWithCredentials(`${API_BASE}/studio/documents${qs}`)
    return handleResponse<unknown[]>(response)
  },

  async getDocument(id: string): Promise<unknown> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/documents/${id}`)
    return handleResponse<unknown>(response)
  },

  async createDocument(data: Record<string, unknown>): Promise<unknown> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<unknown>(response)
  },

  async updateDocument(id: string, data: Record<string, unknown>): Promise<unknown> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<unknown>(response)
  },

  async deleteDocument(id: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/documents/${id}`, { method: "DELETE" })
    if (!response.ok) throw new ApiError(response.status, "Failed to delete document")
  },

  // Templates
  async listTemplates(category?: string): Promise<unknown[]> {
    const qs = category ? `?category=${category}` : ""
    const response = await fetchWithCredentials(`${API_BASE}/studio/templates${qs}`)
    return handleResponse<unknown[]>(response)
  },

  async createTemplate(data: Record<string, unknown>): Promise<unknown> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<unknown>(response)
  },

  async deleteTemplate(id: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/templates/${id}`, { method: "DELETE" })
    if (!response.ok) throw new ApiError(response.status, "Failed to delete template")
  },

  // Assets
  async listAssets(params?: { type?: string; search?: string }): Promise<unknown[]> {
    const query = new URLSearchParams()
    if (params?.type) query.set("type", params.type)
    if (params?.search) query.set("search", params.search)
    const qs = query.toString() ? `?${query.toString()}` : ""
    const response = await fetchWithCredentials(`${API_BASE}/studio/assets${qs}`)
    return handleResponse<unknown[]>(response)
  },

  async createAsset(data: Record<string, unknown>): Promise<unknown> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<unknown>(response)
  },

  async updateAsset(id: string, data: Record<string, unknown>): Promise<unknown> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    return handleResponse<unknown>(response)
  },

  async deleteAsset(id: string): Promise<void> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/assets/${id}`, { method: "DELETE" })
    if (!response.ok) throw new ApiError(response.status, "Failed to delete asset")
  },

  // Document versions
  async listVersions(documentId: string): Promise<unknown[]> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/documents/${documentId}/versions`)
    return handleResponse<unknown[]>(response)
  },

  // Sharing
  async updateSharing(documentId: string, sharedWith: Array<{ userId: string; permission: "view" | "edit" }>): Promise<unknown> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/documents/${documentId}/share`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sharedWith }),
    })
    return handleResponse<unknown>(response)
  },

  // File extraction
  async extractDocument(file: File): Promise<{ text: string; filename: string; pageCount?: number; isRFP?: boolean }> {
    const formData = new FormData()
    formData.append("file", file)
    const response = await fetchWithCredentials(`${API_BASE}/studio/extract-document`, {
      method: "POST",
      body: formData,
    })
    return handleResponse<{ text: string; filename: string; pageCount?: number; isRFP?: boolean }>(response)
  },

  // RFP Checklist
  async generateChecklist(rfpText: string): Promise<{ items: Array<{ id: string; category: string; requirement: string; priority: "high" | "medium" | "low" }> }> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/checklist/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfpText }),
    })
    return handleResponse(response)
  },

  async checkCompliance(documentContent: string, checklistItems: Array<{ id: string; category: string; requirement: string; priority: string }>): Promise<{ results: Array<{ id: string; status: "met" | "partial" | "missing"; note: string }> }> {
    const response = await fetchWithCredentials(`${API_BASE}/studio/checklist/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentContent, checklistItems }),
    })
    return handleResponse(response)
  },
}

// ─── SSE Streaming Utility ─────────────────────────────────

export interface FetchSSECallbacks {
  onMetadata?: (data: Record<string, unknown>) => void
  onToken?: (token: string) => void
  onDone?: (data: { cleanResponse: string; followUpPrompts: string[]; chartData?: Record<string, unknown>; svgData?: { svg: string; title: string } | null; reviewAnnotations?: Array<{ id: string; quote: string; comment: string; severity: string; suggestedFix?: string }>; photoSuggestions?: Array<{ query: string; placement: string; photos: Array<{ id: string; displayTitle: string; storageKey: string; fileUrl: string | null }> }>; metadata?: Record<string, unknown> }) => void
  onError?: (error: string) => void
  onAction?: (actions: Array<{ key: string; value: unknown; label: string }>) => void
}

/**
 * Stream a POST request via Server-Sent Events.
 * Parses the SSE protocol: metadata, token data, done, error events.
 */
export async function fetchSSE(
  endpoint: string,
  body: Record<string, unknown>,
  callbacks: FetchSSECallbacks,
  signal?: AbortSignal
): Promise<void> {
  // Add CSRF token to streaming POST requests (CRITICAL SECURITY FIX)
  const headers = await addCsrfHeader({ "Content-Type": "application/json" })

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.error || `Request failed with status ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6)
        try {
          const parsed = JSON.parse(raw)
          if (currentEvent === "metadata") {
            callbacks.onMetadata?.(parsed)
          } else if (currentEvent === "done") {
            callbacks.onDone?.(parsed)
          } else if (currentEvent === "error") {
            callbacks.onError?.(parsed.error || "Stream error")
          } else if (currentEvent === "action") {
            if (parsed.actions) callbacks.onAction?.(parsed.actions)
          } else {
            // Default data event = token
            if (parsed.token) callbacks.onToken?.(parsed.token)
          }
        } catch {
          // Non-JSON data line, ignore
        }
        currentEvent = ""
      }
    }
  }
}

// ─── Account API (avatar, password) ─────────────────────────

export const accountApi = {
  async uploadAvatar(croppedBlob: Blob): Promise<{ success: boolean; avatarUrl: string }> {
    // Convert blob to base64 data URL for JSON transport (works in both local and serverless)
    const reader = new FileReader()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(croppedBlob)
    })
    const response = await fetchWithCredentials(`${API_BASE}/auth/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataUrl }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Upload failed")
    }
    return response.json()
  },

  async deleteAvatar(): Promise<{ success: boolean }> {
    const response = await fetchWithCredentials(`${API_BASE}/auth/avatar`, {
      method: "DELETE",
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Delete failed")
    }
    return response.json()
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
    const response = await fetchWithCredentials(`${API_BASE}/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Failed to change password")
    }
    return response.json()
  },

  async completeTour(): Promise<{ success: boolean }> {
    const response = await fetchWithCredentials(`${API_BASE}/auth/complete-tour`, {
      method: "POST",
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Failed to complete tour")
    }
    return response.json()
  },

  async resetTour(): Promise<{ success: boolean }> {
    const response = await fetchWithCredentials(`${API_BASE}/auth/reset-tour`, {
      method: "POST",
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Failed to reset tour")
    }
    return response.json()
  },

  getAvatarUrl(userId: string): string {
    return `${API_BASE}/auth/avatar/${userId}`
  },
}

// ─── Feedback API ────────────────────────────────────────

export const feedbackApi = {
  async submit(data: { messageId: string; score: string; page: string; query: string }): Promise<{ success: boolean }> {
    const response = await fetchWithCredentials(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || "Failed to submit feedback")
    }
    return response.json()
  },
}
