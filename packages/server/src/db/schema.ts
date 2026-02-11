import { pgTable, text, integer, timestamp, primaryKey, jsonb, uuid, boolean, index } from "drizzle-orm/pg-core"

// Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  avatarUrl: text("avatar_url"),
  hasCompletedTour: boolean("has_completed_tour").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
})

// Topics (controlled vocabulary)
export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(), // normalized (lowercase, trimmed)
  displayName: text("display_name").notNull(), // original casing for UI
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Answer Items (current state)
export const answerItems = pgTable("answer_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  subtopic: text("subtopic"),
  status: text("status", { enum: ["Approved", "Draft"] }).notNull().default("Approved"),
  tags: jsonb("tags").$type<string[]>().default([]),
  fingerprint: text("fingerprint").notNull().unique(), // for upsert deduplication
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  topicIdIdx: index("idx_answer_items_topic_id").on(table.topicId),
  statusIdx: index("idx_answer_items_status").on(table.status),
  updatedAtIdx: index("idx_answer_items_updated_at").on(table.updatedAt),
  topicStatusIdx: index("idx_answer_items_topic_status").on(table.topicId, table.status),
}))

// Answer Item Versions (history)
export const answerItemVersions = pgTable("answer_item_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  answerItemId: uuid("answer_item_id").notNull().references(() => answerItems.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  topicId: uuid("topic_id").notNull(),
  subtopic: text("subtopic"),
  status: text("status", { enum: ["Approved", "Draft"] }).notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default("local"),
})

// Photo Assets (current state)
export const photoAssets = pgTable("photo_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayTitle: text("display_title").notNull(),
  topicId: uuid("topic_id").notNull().references(() => topics.id),
  status: text("status", { enum: ["Approved", "Draft"] }).notNull().default("Approved"),
  tags: jsonb("tags").$type<string[]>().default([]),
  description: text("description"),
  storageKey: text("storage_key").notNull().unique(), // UUID-based, never changes
  originalFilename: text("original_filename").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  topicIdIdx: index("idx_photo_assets_topic_id").on(table.topicId),
  statusIdx: index("idx_photo_assets_status").on(table.status),
  updatedAtIdx: index("idx_photo_assets_updated_at").on(table.updatedAt),
  topicStatusIdx: index("idx_photo_assets_topic_status").on(table.topicId, table.status),
}))

// Photo Asset Versions (history)
export const photoAssetVersions = pgTable("photo_asset_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  photoAssetId: uuid("photo_asset_id").notNull().references(() => photoAssets.id, { onDelete: "cascade" }),
  displayTitle: text("display_title").notNull(),
  topicId: uuid("topic_id").notNull(),
  status: text("status", { enum: ["Approved", "Draft"] }).notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  description: text("description"),
  versionNumber: integer("version_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default("local"),
})

// Links between Answers and Photos
export const linksAnswerPhoto = pgTable(
  "links_answer_photo",
  {
    answerItemId: uuid("answer_item_id").notNull().references(() => answerItems.id, { onDelete: "cascade" }),
    photoAssetId: uuid("photo_asset_id").notNull().references(() => photoAssets.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default("local"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.answerItemId, table.photoAssetId] }),
  })
)

// Saved Documents (RFPs/Proposals)
export const savedDocuments = pgTable("saved_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type", { enum: ["RFP", "Proposal", "Other"] }).notNull().default("RFP"),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  pageCount: integer("page_count"),
  extractedText: text("extracted_text").notNull(),
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Proposals (synced from Excel - Proposal Summary, ALL 5 sheets)
export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: timestamp("date", { withTimezone: true }),
  ce: text("ce"), // Client Executive / Account Executive
  client: text("client"), // Made nullable - some rows may not have client names
  projectType: text("project_type"),
  rfpNumber: text("rfp_number"),
  won: text("won", { enum: ["Yes", "No", "Pending", "Cancelled"] }),
  schoolType: text("school_type"), // e.g., "Community College", "University"
  affiliation: text("affiliation"), // e.g., "Public", "Private", "Faith-Based"
  servicesOffered: jsonb("services_offered").$type<string[]>().default([]), // Array of service names where X was marked
  documentLinks: jsonb("document_links").$type<Record<string, string>>(), // Links to proposal docs
  fingerprint: text("fingerprint").notNull().unique(), // for upsert deduplication
  sourceRow: integer("source_row"), // Original Excel row number
  // NEW: Multi-sheet support and full data capture
  sheetName: text("sheet_name"), // Which sheet: Research, Creative & Brand, Digital Marketing, Website Redesign, PR
  category: text("category"), // Normalized: research, creative, digital, website, pr
  rawData: jsonb("raw_data").$type<Record<string, string>>(), // ALL cells from the row as key-value pairs
  presentationDate: timestamp("presentation_date", { withTimezone: true }),
  estimatedLaunchDate: timestamp("estimated_launch_date", { withTimezone: true }),
  actualLaunchDate: timestamp("actual_launch_date", { withTimezone: true }),
  cmsType: text("cms_type"), // For website proposals: WordPress, Drupal, etc.
  websiteLink: text("website_link"), // Link to the actual website
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("idx_proposals_category").on(table.category),
  wonIdx: index("idx_proposals_won").on(table.won),
  dateIdx: index("idx_proposals_date").on(table.date),
  ceIdx: index("idx_proposals_ce").on(table.ce),
  clientIdx: index("idx_proposals_client").on(table.client),
  wonDateIdx: index("idx_proposals_won_date").on(table.won, table.date),
}))

// Proposal Pipeline (RFP intake/triage log from Proposal Planning Meeting Activity.xlsx)
export const proposalPipeline = pgTable("proposal_pipeline", {
  id: uuid("id").primaryKey().defaultRandom(),
  dateReceived: timestamp("date_received", { withTimezone: true }),
  ce: text("ce"), // Account Executive (e.g., "Becky/Michele", "Becky Morehouse")
  client: text("client"), // School/Institution name
  description: text("description"), // Brief Description of Products/Services
  dueDate: timestamp("due_date", { withTimezone: true }),
  decision: text("decision"), // "Processed" | "Passing" | "Cancelled" | "Reviewing"
  extraInfo: text("extra_info"), // Reason for passing, notes
  followUp: text("follow_up"),
  year: integer("year"), // Which year sheet it came from (2013-2026)
  fingerprint: text("fingerprint").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Proposal Sync Log (tracks file sync status)
export const proposalSyncLog = pgTable("proposal_sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  filePath: text("file_path").notNull(),
  fileMtime: timestamp("file_mtime", { withTimezone: true }).notNull(),
  totalRows: integer("total_rows").notNull(),
  imported: integer("imported").notNull(),
  updated: integer("updated").notNull(),
  skipped: integer("skipped").notNull(),
  status: text("status", { enum: ["success", "partial", "failed"] }).notNull(),
  errorMessage: text("error_message"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
})

// Audit Log
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actionType: text("action_type", {
    enum: ["IMPORT", "EDIT", "RENAME", "DOWNLOAD", "COPY", "LINK", "UNLINK", "AI_REQUEST"],
  }).notNull(),
  entityType: text("entity_type", { enum: ["ANSWER", "PHOTO", "SYSTEM"] }).notNull(),
  entityId: uuid("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>(),
  actor: text("actor").notNull().default("local"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Client Success — user-added entries (merged with hardcoded clientSuccessData on display)
export const clientSuccessEntries = pgTable("client_success_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  client: text("client").notNull(),
  category: text("category", { enum: ["higher-ed", "healthcare", "other"] }).notNull(),
  focus: text("focus").notNull(),
  challenge: text("challenge"),
  solution: text("solution"),
  metrics: jsonb("metrics").$type<{ label: string; value: string }[]>().default([]),
  testimonialQuote: text("testimonial_quote"),
  testimonialAttribution: text("testimonial_attribution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const clientSuccessResults = pgTable("client_success_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  metric: text("metric").notNull(),
  result: text("result").notNull(),
  client: text("client").notNull(),
  numericValue: integer("numeric_value").notNull(),
  direction: text("direction", { enum: ["increase", "decrease"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const clientSuccessTestimonials = pgTable("client_success_testimonials", {
  id: uuid("id").primaryKey().defaultRandom(),
  quote: text("quote").notNull(),
  name: text("name"),
  title: text("title"),
  organization: text("organization").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const clientSuccessAwards = pgTable("client_success_awards", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  year: text("year").notNull(),
  clientOrProject: text("client_or_project").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// AI Conversations (persisted chat history across all AI pages)
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  page: text("page", { enum: ["ask-ai", "case-studies", "proposal-insights", "unified-ai", "studio", "studio-briefing", "studio-review", "general"] }).notNull(),
  title: text("title").notNull(), // Auto-generated from first user message
  messages: jsonb("messages").$type<{ role: "user" | "assistant"; content: string; timestamp: string }[]>().notNull().default([]),
  userId: text("user_id"), // Owner — null for legacy conversations
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_conversations_user_id").on(table.userId),
  pageIdx: index("idx_conversations_page").on(table.page),
  createdAtIdx: index("idx_conversations_created_at").on(table.createdAt),
}))

// ─── Document Studio ───

// Studio Documents
export const studioDocuments = pgTable("studio_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull().default("Untitled"),
  content: text("content").notNull().default(""),
  formatSettings: jsonb("format_settings").$type<Record<string, unknown>>().notNull().default({}),
  mode: text("mode", { enum: ["draft", "final", "template", "archived"] }).notNull().default("draft"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  sourceType: text("source_type", { enum: ["briefing", "manual", "review", "ai-generated"] }).notNull().default("manual"),
  conversationId: uuid("conversation_id"),
  userId: text("user_id").notNull(),
  sharedWith: jsonb("shared_with").$type<Array<{ userId: string; permission: "view" | "edit" }>>().notNull().default([]),
  version: integer("version").notNull().default(1),
  parentId: uuid("parent_id"),
  exportHistory: jsonb("export_history").$type<Array<{ format: string; timestamp: string; filename: string }>>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Studio Document Versions (history for diffs and restore)
export const studioDocumentVersions = pgTable("studio_document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => studioDocuments.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  formatSettings: jsonb("format_settings").$type<Record<string, unknown>>().notNull().default({}),
  changeDescription: text("change_description"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// Studio Templates
export const studioTemplates = pgTable("studio_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  formatSettings: jsonb("format_settings").$type<Record<string, unknown>>().notNull().default({}),
  category: text("category", { enum: ["proposal", "case-study", "report", "presentation", "custom"] }).notNull().default("custom"),
  isSystem: boolean("is_system").notNull().default(false),
  userId: text("user_id"),
  usageCount: integer("usage_count").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Studio Assets (per-user asset bucket)
export const studioAssets = pgTable("studio_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["image", "svg", "chart-snapshot", "document-snippet", "logo", "icon"] }).notNull(),
  data: text("data").notNull(),
  thumbnail: text("thumbnail"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// Type exports for use in services
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Topic = typeof topics.$inferSelect
export type NewTopic = typeof topics.$inferInsert
export type AnswerItem = typeof answerItems.$inferSelect
export type NewAnswerItem = typeof answerItems.$inferInsert
export type AnswerItemVersion = typeof answerItemVersions.$inferSelect
export type NewAnswerItemVersion = typeof answerItemVersions.$inferInsert
export type PhotoAsset = typeof photoAssets.$inferSelect
export type NewPhotoAsset = typeof photoAssets.$inferInsert
export type PhotoAssetVersion = typeof photoAssetVersions.$inferSelect
export type NewPhotoAssetVersion = typeof photoAssetVersions.$inferInsert
export type LinkAnswerPhoto = typeof linksAnswerPhoto.$inferSelect
export type NewLinkAnswerPhoto = typeof linksAnswerPhoto.$inferInsert
export type AuditLogEntry = typeof auditLog.$inferSelect
export type NewAuditLogEntry = typeof auditLog.$inferInsert
export type SavedDocument = typeof savedDocuments.$inferSelect
export type NewSavedDocument = typeof savedDocuments.$inferInsert
export type Proposal = typeof proposals.$inferSelect
export type NewProposal = typeof proposals.$inferInsert
export type ProposalSyncLogEntry = typeof proposalSyncLog.$inferSelect
export type NewProposalSyncLogEntry = typeof proposalSyncLog.$inferInsert
export type ProposalPipelineEntry = typeof proposalPipeline.$inferSelect
export type NewProposalPipelineEntry = typeof proposalPipeline.$inferInsert
export type ClientSuccessEntry = typeof clientSuccessEntries.$inferSelect
export type NewClientSuccessEntry = typeof clientSuccessEntries.$inferInsert
export type ClientSuccessResult = typeof clientSuccessResults.$inferSelect
export type NewClientSuccessResult = typeof clientSuccessResults.$inferInsert
export type ClientSuccessTestimonial = typeof clientSuccessTestimonials.$inferSelect
export type NewClientSuccessTestimonial = typeof clientSuccessTestimonials.$inferInsert
export type ClientSuccessAward = typeof clientSuccessAwards.$inferSelect
export type NewClientSuccessAward = typeof clientSuccessAwards.$inferInsert
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type StudioDocumentRow = typeof studioDocuments.$inferSelect
export type NewStudioDocument = typeof studioDocuments.$inferInsert
export type StudioDocumentVersionRow = typeof studioDocumentVersions.$inferSelect
export type NewStudioDocumentVersion = typeof studioDocumentVersions.$inferInsert
export type StudioTemplateRow = typeof studioTemplates.$inferSelect
export type NewStudioTemplate = typeof studioTemplates.$inferInsert
export type StudioAssetRow = typeof studioAssets.$inferSelect
export type NewStudioAsset = typeof studioAssets.$inferInsert
