import { pgTable, text, integer, timestamp, primaryKey, jsonb, uuid } from "drizzle-orm/pg-core"

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
})

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
})

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

// Type exports for use in services
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
