# PHASE 2: Data Layer + Schema Report

**Date:** January 21, 2026
**Status:** COMPLETE

---

## Summary

Phase 2 successfully implemented the complete data layer with:
- Supabase/Postgres connection verified and working
- All database tables created via migration
- Full CRUD services for Topics, Answers, Photos, and Links
- Versioning system for answers and photos
- Audit logging for all actions
- 14 passing tests

---

## Database Setup

### Connection Details
- **Provider:** Supabase (Postgres)
- **Project:** jniqzpkxngxsirwcxzcn
- **Connection:** Direct (port 5432)

### Tables Created
| Table | Purpose |
|-------|---------|
| `topics` | Controlled vocabulary for categories |
| `answer_items` | Current state of Q&A entries |
| `answer_item_versions` | Version history for answers |
| `photo_assets` | Current state of photos |
| `photo_asset_versions` | Version history for photos |
| `links_answer_photo` | Many-to-many links |
| `audit_log` | Action tracking |

### Indexes
- Full-text search (GIN) on answers and photos
- Topic ID indexes for filtering
- Fingerprint index for fast upsert lookups

---

## Services Implemented

### 1. Topic Service (`topicService.ts`)
| Function | Description |
|----------|-------------|
| `getAllTopics()` | List all topics ordered by name |
| `getTopicById(id)` | Get single topic |
| `getTopicByName(name)` | Find by normalized name |
| `createTopic(displayName)` | Create new topic |
| `upsertTopic(displayName)` | Create or return existing |
| `upsertTopics(names[])` | Batch upsert |

### 2. Answer Service (`answerService.ts`)
| Function | Description |
|----------|-------------|
| `getAnswers(filters)` | List with topic/status filters |
| `getAnswerById(id)` | Get with linked photos count |
| `getAnswerByFingerprint(fp)` | Lookup for upsert |
| `createAnswer(data)` | Create + version 1 |
| `updateAnswer(id, data)` | Update + new version |
| `upsertAnswer(data, row)` | Import upsert with collision detection |
| `searchAnswers(query, filters)` | Full-text search |
| `getAnswerVersions(id)` | Get version history |

### 3. Photo Service (`photoService.ts`)
| Function | Description |
|----------|-------------|
| `getPhotos(filters)` | List with topic/status filters |
| `getPhotoById(id)` | Get with linked answers count |
| `createPhoto(data)` | Create with stable storage_key |
| `updatePhoto(id, data)` | Update metadata + new version |
| `renamePhoto(id, title)` | **Rename without changing storage_key** |
| `searchPhotos(query, filters)` | Full-text search |
| `getPhotoVersions(id)` | Get version history |
| `recordDownload(id)` | Log download for audit |

### 4. Link Service (`linkService.ts`)
| Function | Description |
|----------|-------------|
| `linkAnswerToPhoto(a, p)` | Create link |
| `unlinkAnswerFromPhoto(a, p)` | Remove link |
| `getLinkedPhotos(answerId)` | Get photos for answer |
| `getLinkedAnswers(photoId)` | Get answers for photo |
| `linkExists(a, p)` | Check if linked |

### 5. Audit Service (`auditService.ts`)
| Function | Description |
|----------|-------------|
| `logAudit(params)` | Generic audit log |
| `logImport(details)` | Log import action |
| `logEdit(type, id, changes)` | Log edit with diff |
| `logRename(id, old, new)` | Log photo rename |
| `logDownload(id)` | Log photo download |
| `logCopy(id)` | Log answer copy |
| `logLink(a, p)` | Log link creation |
| `logUnlink(a, p)` | Log link removal |
| `logAIRequest(details)` | Log AI query |

---

## Utility Functions (`lib/utils.ts`)

| Function | Description |
|----------|-------------|
| `normalizeText(text)` | Lowercase, trim, collapse spaces |
| `normalizeTopicName(name)` | Create URL-safe slug |
| `normalizeTags(tags[])` | Dedupe and lowercase |
| `parseTagsString(str)` | Parse comma-separated tags |
| `generateFingerprint(q, t)` | SHA256 hash for upsert |
| `calculateSimilarity(a, b)` | Jaccard similarity |
| `isMateriallyDifferent(a, b)` | Collision detection |
| `generateStorageKey()` | UUID for photo storage |
| `sanitizeFilenameForDisplay(f)` | Clean filename for title |

---

## Key Integrity Features

### 1. Fingerprint-Based Upsert
```
Fingerprint = SHA256(normalized_question | normalized_topic)[0:16]
```
- Unique per question+topic combination
- Used during import to detect duplicates
- If fingerprint exists but content differs significantly → collision warning

### 2. Rename Integrity
```typescript
// renamePhoto() ONLY changes displayTitle
// storageKey remains unchanged
photo.displayTitle = "New Name"  // ✓ Changes
photo.storageKey = "abc-123..."  // ✗ Never changes
```

### 3. Version History
- Every edit creates a new version record
- Original content preserved
- Version numbers are sequential per entity

### 4. Audit Trail
- All actions logged with timestamp
- Entity type and ID tracked
- Details stored as JSONB for flexibility

---

## Test Results

```
 ✓ Utility Functions > should normalize topic names
 ✓ Utility Functions > should normalize tags
 ✓ Utility Functions > should generate deterministic fingerprints
 ✓ Topic Service > should create and retrieve topics
 ✓ Topic Service > should return existing topic on upsert
 ✓ Topic Service > should find topic by name
 ✓ Topic Service > should list all topics
 ✓ Answer Service > should create an answer with version 1
 ✓ Answer Service > should find answer by fingerprint
 ✓ Answer Service > should upsert answer (update existing)
 ✓ Photo Service > should create a photo with version 1
 ✓ Photo Service > should rename photo without changing storage key
 ✓ Link Service > should link answer to photo and retrieve linked items
 ✓ Link Service > should unlink answer from photo

Test Files  1 passed (1)
     Tests  14 passed (14)
```

---

## Files Created/Modified

### New Files
```
packages/server/src/lib/utils.ts
packages/server/src/services/auditService.ts
packages/server/src/services/topicService.ts
packages/server/src/services/answerService.ts
packages/server/src/services/photoService.ts
packages/server/src/services/linkService.ts
packages/server/src/services/index.ts
packages/server/src/__tests__/services.test.ts
packages/server/vitest.config.ts
packages/server/.env
```

### Modified Files
```
packages/server/src/routes/topics.ts (using service layer)
```

---

## What's Next: PHASE 3

Phase 3 will implement the Excel Import pipeline:
1. Parse `/Users/ericyerke/Desktop/Spreadsheets/Loopio-jan-26.xlsx`
2. Extract and upsert topics from Category column
3. Upsert answers using fingerprint strategy
4. Surface issues (missing fields, collisions)
5. Import Wizard UI integration
6. Tests for validation and upsert behavior

---

**PHASE 2 COMPLETE. Ready for PHASE 3 approval.**
