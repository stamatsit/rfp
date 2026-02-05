/**
 * API client for RFP & Proposals backend
 */

import type { ImportPreview, ImportResult, ImportIssue } from "@/types"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

// Default fetch options to include credentials for session auth
const fetchWithCredentials = (url: string, options: RequestInit = {}): Promise<Response> => {
  return fetch(url, {
    ...options,
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
}

export const answersApi = {
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
export interface RFPExtractResponse {
  text: string
  filename: string
  pageCount?: number
}

export interface RFPStatusResponse {
  available: boolean
  supportedFormats: string[]
  maxFileSize: string
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
}
