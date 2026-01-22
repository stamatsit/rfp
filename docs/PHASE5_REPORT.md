# PHASE 5 REPORT: Search + Linking

## Summary

Phase 5 implements the search functionality and answer-photo linking system, allowing users to search the library, view items with their linked content, and create/remove links between answers and photos.

## Deliverables

### 1. Search API Routes (`packages/server/src/routes/search.ts`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/search` | GET | Search both answers and photos |
| `/api/search/answers` | GET | Search answers only |
| `/api/search/photos` | GET | Search photos only |
| `/api/search/answers/:id` | GET | Get answer with linked photos |
| `/api/search/photos/:id` | GET | Get photo with linked answers |
| `/api/search/answers/:id/copy` | POST | Log a copy event |
| `/api/search/link` | POST | Link answer to photo |
| `/api/search/link` | DELETE | Unlink answer from photo |
| `/api/search/answers/:id/photos` | GET | Get photos linked to answer |
| `/api/search/photos/:id/answers` | GET | Get answers linked to photo |

**Search Features:**
- Full-text search using PostgreSQL `to_tsvector` / `to_tsquery`
- Filter by type (answers/photos/all)
- Filter by topic
- Filter by status (Approved/Draft)
- Configurable result limit

### 2. Search API Client (`packages/client/src/lib/api.ts`)

Added `searchApi` object with methods:

```typescript
searchApi.search(params)          // Combined search
searchApi.searchAnswers(params)   // Answers only
searchApi.searchPhotos(params)    // Photos only
searchApi.getAnswer(id)           // Answer with linked photos
searchApi.getPhoto(id)            // Photo with linked answers
searchApi.logCopy(answerId)       // Log copy event
searchApi.link(answerId, photoId) // Create link
searchApi.unlink(answerId, photoId) // Remove link
searchApi.getLinkedPhotos(answerId) // Get linked photos
searchApi.getLinkedAnswers(photoId) // Get linked answers
```

### 3. Updated SearchLibrary Page

**Replaced mock data with real API:**
- Loads topics from database on mount
- Performs search via `/api/search` endpoint
- Filter changes trigger new search
- Enter key in search box triggers search

**Implemented linking UI:**
- Answer detail modal shows linked photos
- Photo detail modal shows linked answers
- "Link Photos" / "Link Answers" buttons open picker dialog
- Unlink buttons (hover reveal) on linked items
- Link counts update in real-time after link/unlink

**Detail Modals:**
- Full answer text with copy button
- Photo display with download button
- Topic and status badges
- Linked items grid with thumbnails
- Hover-to-reveal unlink buttons

**Link Picker Dialog:**
- Lists available items to link
- Photo thumbnails or answer titles
- Click to create link
- Auto-closes and refreshes after linking

### 4. Features

**Full-Text Search:**
- Uses PostgreSQL full-text search indexes
- Prefix matching (e.g., "web" matches "website")
- Searches question + answer text for answers
- Searches title + description for photos

**Link Management:**
- Many-to-many relationships preserved
- Audit logging on link/unlink
- Idempotent link creation (no duplicates)
- Count updates reflected in search results

**Copy Tracking:**
- Copy button logs audit event
- Tracks which answers are being copied

## Files Changed

### Server
- `src/routes/search.ts` - **NEW** - Complete search and link API
- `src/routes/index.ts` - Updated to mount search router

### Client
- `src/lib/api.ts` - Added searchApi with all methods
- `src/pages/SearchLibrary.tsx` - Complete rewrite with real API

## API Request/Response Examples

### Search Request
```
GET /api/search?q=website&type=answers&topicId=abc123&limit=20
```

### Search Response
```json
{
  "answers": [...],
  "photos": [...],
  "totalAnswers": 15,
  "totalPhotos": 8
}
```

### Link Request
```
POST /api/search/link
Content-Type: application/json
{ "answerId": "abc", "photoId": "xyz" }
```

### Get Linked Photos
```
GET /api/search/answers/abc123/photos
```

## UI Features

### Search Page
- Large search input with icon
- Type filter dropdown (All/Answers/Photos)
- Topic filter dropdown (loaded from DB)
- Loading spinner during search
- Result count display
- Answer cards with copy/view buttons
- Photo cards with download/view buttons
- Empty state with helpful message

### Answer Detail Modal
- Question as title
- Topic and status badges
- Full answer text in styled box
- Copy Answer button
- Linked Photos grid with:
  - Photo thumbnails
  - Title overlay
  - Unlink button (hover)
- Link Photos button opens picker

### Photo Detail Modal
- Photo title
- Large photo preview
- Topic and status badges
- Description (if present)
- Download button
- Linked Answers list with:
  - Question preview
  - Answer snippet
  - Unlink button (hover)
- Link Answers button opens picker

## Testing

- Server compiles without errors
- Client compiles without errors
- Search returns real data from database
- Links can be created and removed
- Link counts update correctly

## AI Panel Note

The AI panel UI remains but shows a placeholder message. AI integration (Phase 6) will connect this to the actual AI service.

## Next Phase

**PHASE 6: AI Retrieval + Guardrails** will implement:
- AI query endpoint with OpenAI integration
- Retrieval-only pattern (no generation from AI knowledge)
- Source citation for all responses
- Refusal logic for unapproved content
- Wire AI panel to real endpoint

---

*Phase 5 completed on 2026-01-21*
*Search and linking fully functional*
*All pages now connected to real APIs*
