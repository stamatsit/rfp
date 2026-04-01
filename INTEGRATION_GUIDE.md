# Integration Guide: Sentry, TanStack Query, Vercel AI SDK, Meilisearch

> **Status**: Phase 1 — Not Started
> **Last Updated**: 2026-03-05
> **Estimated Total Effort**: ~40-60 hours across all 4 phases

---

## Table of Contents

- [Phase 1: Sentry (Error Monitoring)](#phase-1-sentry-error-monitoring) — ~4-6 hours
- [Phase 2: TanStack Query (Data Fetching)](#phase-2-tanstack-query-data-fetching) — ~12-16 hours
- [Phase 3: Vercel AI SDK (Streaming)](#phase-3-vercel-ai-sdk-streaming) — ~12-16 hours
- [Phase 4: Meilisearch (Search Engine)](#phase-4-meilisearch-search-engine) — ~12-16 hours

Each phase is **independent** — they can be done in any order. Phase 1 (Sentry) is recommended first because it gives you visibility into errors that the other phases might introduce.

---

## Phase 1: Sentry (Error Monitoring)

**Why**: The app currently has zero error reporting beyond `console.error`. The `ErrorBoundary` component (`packages/client/src/components/ErrorBoundary.tsx`) catches render errors but only displays a reload button — no telemetry is sent anywhere. Server-side errors in 12 AI streaming endpoints, 19 route groups, and the 7,564-line `api/index.ts` monolith are completely invisible in production.

**Goal**: Full-stack error monitoring with Sentry — client React errors, server Express errors, and streaming endpoint failures all captured with context.

### Step 1.1: Install Dependencies

```bash
# Client
cd packages/client
npm install @sentry/react

# Server (local dev)
cd packages/server
npm install @sentry/node

# Root (for Vercel serverless — api/index.ts)
cd /path/to/project
npm install @sentry/node
```

### Step 1.2: Create Sentry Project

1. Go to https://sentry.io → Create project → Platform: **React** (for client) and **Node.js** (for server)
2. Or create a single project with platform **React** (Sentry auto-detects Node.js errors)
3. Copy the DSN — you'll need it for both client and server
4. Add to environment variables:

```bash
# .env (local dev)
VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Vercel (production)
vercel env add VITE_SENTRY_DSN
vercel env add SENTRY_DSN
```

**Important**: `VITE_` prefix is required for client-side env vars (Vite exposes these to the browser). The server uses `SENTRY_DSN` without the prefix.

### Step 1.3: Client-Side Setup

**Create `packages/client/src/lib/sentry.ts`:**

```typescript
import * as Sentry from "@sentry/react"

export function initSentry() {
  if (!import.meta.env.VITE_SENTRY_DSN) return

  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.DEV ? "development" : "production",
    release: `rfp-proposals@${import.meta.env.VITE_APP_VERSION || "0.0.0"}`,

    // Performance — sample 20% of transactions in production
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,

    // Session replay — capture 10% of sessions, 100% of error sessions
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,    // We're an internal app, no PII concerns
        blockAllMedia: false,
      }),
      Sentry.reactRouterV6BrowserTracingIntegration({
        useEffect: undefined, // We'll set this up in the router
      }),
    ],

    // Don't send errors in development unless explicitly enabled
    enabled: import.meta.env.PROD || import.meta.env.VITE_SENTRY_DEV === "true",

    // Filter out noise
    ignoreErrors: [
      "ResizeObserver loop",         // Chrome bug, harmless
      "AbortError",                  // User cancelled fetch
      "Failed to fetch",             // Network errors (offline)
      "Load failed",                 // Safari network errors
      "Non-Error promise rejection", // Usually third-party
    ],

    beforeSend(event) {
      // Strip any session tokens from the event
      if (event.request?.cookies) {
        delete event.request.cookies["rfp-session"]
      }
      return event
    },
  })
}

/**
 * Set the current user context for Sentry.
 * Call this after login / on auth context change.
 */
export function setSentryUser(user: { id: string; email: string; name?: string } | null) {
  if (user) {
    Sentry.setUser({ id: user.id, email: user.email, username: user.name })
  } else {
    Sentry.setUser(null)
  }
}

/**
 * Capture a manual error with extra context.
 * Use this in catch blocks where you want Sentry to know about the error
 * but don't want to crash the UI.
 */
export function captureError(error: unknown, context?: Record<string, unknown>) {
  console.error(error)
  if (context) {
    Sentry.setContext("extra", context)
  }
  Sentry.captureException(error)
}
```

**Modify `packages/client/src/main.tsx`** (or wherever ReactDOM.createRoot is called):

```typescript
// ADD at the very top of the file, before any other imports:
import { initSentry } from "./lib/sentry"
initSentry()

// ... rest of existing imports
import { createRoot } from "react-dom/client"
import App from "./App"
// etc.
```

### Step 1.4: Integrate with ErrorBoundary

**Modify `packages/client/src/components/ErrorBoundary.tsx`:**

The current ErrorBoundary only logs to `console.error`. Add Sentry reporting.

```typescript
// ADD this import at the top:
import * as Sentry from "@sentry/react"

// CHANGE the componentDidCatch method (line 23-25):
componentDidCatch(error: Error, info: React.ErrorInfo) {
  console.error("ErrorBoundary caught:", error, info.componentStack)
  Sentry.captureException(error, {
    contexts: {
      react: { componentStack: info.componentStack },
    },
  })
}
```

### Step 1.5: Integrate with Auth Context

**Modify `packages/client/src/contexts/AuthContext.tsx`:**

Find where the user state is set after login/logout and add:

```typescript
import { setSentryUser } from "@/lib/sentry"

// After successful login (where you set the user state):
setSentryUser({ id: user.id, email: user.email, name: user.name })

// On logout:
setSentryUser(null)
```

### Step 1.6: Integrate with API Client

**Modify `packages/client/src/lib/api.ts`:**

The `handleResponse` function (line 36-42) currently throws `ApiError` silently. Add Sentry breadcrumbs:

```typescript
import * as Sentry from "@sentry/react"

// CHANGE handleResponse (lines 36-42):
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const error = new ApiError(
      response.status,
      errorData.error || `Request failed with status ${response.status}`
    )

    // Add breadcrumb for non-auth errors (401s are expected on session expiry)
    if (response.status !== 401) {
      Sentry.addBreadcrumb({
        category: "api",
        message: `${response.status} ${response.url}`,
        level: response.status >= 500 ? "error" : "warning",
        data: { status: response.status, url: response.url },
      })
    }

    // Capture 5xx errors as exceptions (server bugs)
    if (response.status >= 500) {
      Sentry.captureException(error, {
        tags: { api_status: response.status },
        extra: { url: response.url, errorData },
      })
    }

    throw error
  }
  return response.json()
}
```

**Add breadcrumbs to `fetchSSE`** (line 2103):

```typescript
// Inside fetchSSE, in the error callback handling:
// AFTER the line: if (!response.ok) { ... throw new Error(...) }
// ADD:
Sentry.addBreadcrumb({
  category: "sse",
  message: `SSE error: ${response.status} ${endpoint}`,
  level: "error",
})
```

### Step 1.7: Integrate with useChat Hook

**Modify `packages/client/src/hooks/useChat.ts`:**

The `useChat` hook has two error paths that currently only `console.error`. These are the most critical errors to capture since they represent AI service failures.

```typescript
import { captureError } from "@/lib/sentry"

// CHANGE line 287 (catch block for stream failure):
// FROM: console.error("Stream failed:", err)
// TO:
captureError(err, {
  endpoint: streamEndpoint,
  page,
  queryLength: queryText.length,
  conversationHistoryLength: conversationHistory.length,
})

// CHANGE line 339 (catch block for non-streaming failure):
// FROM: console.error("Query failed:", err)
// TO:
captureError(err, {
  endpoint,
  page,
  queryLength: queryText.length,
})
```

### Step 1.8: Server-Side Setup (Local Dev Server)

**Create `packages/server/src/lib/sentry.ts`:**

```typescript
import * as Sentry from "@sentry/node"

export function initSentry() {
  if (!process.env.SENTRY_DSN) return

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

    integrations: [
      Sentry.expressIntegration(),
    ],

    // Don't capture expected errors
    ignoreErrors: [
      "ECONNRESET",
      "EPIPE",
    ],

    beforeSend(event) {
      // Strip sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.cookie
        delete event.request.headers.authorization
      }
      return event
    },
  })
}

export function sentryErrorHandler() {
  return Sentry.expressErrorHandler()
}

export { Sentry }
```

**Modify `packages/server/src/index.ts`** (the Express app entry point):

```typescript
// ADD at the very top, before all other imports:
import { initSentry, sentryErrorHandler, Sentry } from "./lib/sentry.js"
initSentry()

// ... existing Express setup ...

// ADD Sentry request handler AFTER app creation, BEFORE routes:
app.use(Sentry.expressIntegration().setupExpressErrorHandler(app))
// Or if using the older pattern:
// Sentry.setupExpressErrorHandler(app)

// ADD error handler AFTER all routes, BEFORE app.listen:
app.use(sentryErrorHandler())
```

### Step 1.9: Server-Side Setup (Vercel Serverless — api/index.ts)

This is the production entry point. The 7,564-line `api/index.ts` handles ALL API routes as a single serverless function.

**Add at the very top of `api/index.ts`** (before line 1):

```typescript
import * as Sentry from "@sentry/node"

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: "production",
    tracesSampleRate: 0.2,
    integrations: [],  // No Express integration in serverless
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.cookie
      }
      return event
    },
  })
}
```

**Wrap the main handler function.** Find the default export function at the bottom of `api/index.ts` and wrap it:

```typescript
// FIND the existing: export default async function handler(req, res) { ... }
// WRAP with Sentry:

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // ... existing handler code ...
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: req.url, method: req.method },
    })
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" })
    }
  }
}
```

**Add Sentry captures to streaming error handlers.** Search for all `event: error` writes in `api/index.ts` and add `Sentry.captureException` before them. There are approximately 10-12 streaming endpoints in the file. Pattern to find:

```
res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
```

Before each of these, add:

```typescript
Sentry.captureException(error, { tags: { endpoint: "name-of-endpoint" } })
```

### Step 1.10: Add Source Maps (Production)

For readable stack traces in Sentry, upload source maps during build.

```bash
npm install @sentry/vite-plugin --save-dev
```

**Modify `packages/client/vite.config.ts`:**

```typescript
import { sentryVitePlugin } from "@sentry/vite-plugin"

export default defineConfig({
  build: {
    sourcemap: true, // Required for Sentry
  },
  plugins: [
    react(),
    // ADD after react():
    sentryVitePlugin({
      org: "your-sentry-org",
      project: "rfp-proposals",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: ["./dist/**/*.map"], // Don't serve maps publicly
      },
    }),
  ],
})
```

**Add to Vercel env vars:**

```bash
printf 'your-sentry-auth-token' | vercel env add SENTRY_AUTH_TOKEN production
```

### Step 1.11: Verify Installation

After deploying:

1. Open browser console and run: `throw new Error("Sentry test from client")`
2. Hit a non-existent API endpoint: `fetch("/api/nonexistent")`
3. Check Sentry dashboard — both errors should appear within 30 seconds
4. Verify user context shows up (log in first, then trigger error)
5. Check that session cookies are NOT in the event payload

### Files Modified (Phase 1 Summary)

| File | Change |
|------|--------|
| `packages/client/src/lib/sentry.ts` | **NEW** — Sentry init + helpers |
| `packages/client/src/main.tsx` | Add `initSentry()` call |
| `packages/client/src/components/ErrorBoundary.tsx` | Add `Sentry.captureException` |
| `packages/client/src/contexts/AuthContext.tsx` | Add `setSentryUser` calls |
| `packages/client/src/lib/api.ts` | Add breadcrumbs + error capture |
| `packages/client/src/hooks/useChat.ts` | Replace `console.error` with `captureError` |
| `packages/client/vite.config.ts` | Add source map plugin |
| `packages/server/src/lib/sentry.ts` | **NEW** — Server Sentry init |
| `packages/server/src/index.ts` | Add Sentry middleware |
| `api/index.ts` | Add Sentry init + wrap handler + streaming error captures |
| `package.json` | Add `@sentry/node` dependency |
| `packages/client/package.json` | Add `@sentry/react`, `@sentry/vite-plugin` dependencies |
| `packages/server/package.json` | Add `@sentry/node` dependency |

---

## Phase 2: TanStack Query (Data Fetching & Caching)

**Why**: The app currently uses raw `useState` + `useEffect` + `fetch` for all data loading. Every page independently manages loading/error/data states. There is zero caching — navigating away and back re-fetches everything. No request deduplication — if two components need the same data, two requests fire. The `api.ts` file (2,200+ lines) has well-structured API functions but no caching layer on top.

**Goal**: Replace all GET request patterns with TanStack Query for automatic caching, deduplication, background refetching, and optimistic updates. Mutations (POST/PUT/DELETE) get proper loading states and cache invalidation.

### Step 2.1: Install Dependencies

```bash
cd packages/client
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### Step 2.2: Create Query Client Provider

**Create `packages/client/src/lib/queryClient.ts`:**

```typescript
import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data stays fresh for 2 minutes — no refetch during this window
      staleTime: 2 * 60 * 1000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests twice with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      // Refetch when window regains focus (user returns to tab)
      refetchOnWindowFocus: true,
      // Don't refetch on component remount if data is still fresh
      refetchOnMount: true,
    },
    mutations: {
      // Don't retry mutations by default
      retry: 0,
    },
  },
})
```

**Modify `packages/client/src/App.tsx`:**

```typescript
// ADD imports:
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { queryClient } from "@/lib/queryClient"

// WRAP the App component (around line 144-156):
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  )
}
```

### Step 2.3: Define Query Keys

Query keys are how TanStack Query identifies cached data. Create a centralized key factory to avoid typos and enable targeted invalidation.

**Create `packages/client/src/lib/queryKeys.ts`:**

```typescript
/**
 * Centralized query key factory.
 *
 * Pattern: [domain, entity, ...params]
 * - queryKeys.topics.all()       → ["topics"]
 * - queryKeys.answers.list(opts) → ["answers", "list", { topicId, status }]
 * - queryKeys.answers.detail(id) → ["answers", "detail", id]
 *
 * Invalidation:
 * - queryClient.invalidateQueries({ queryKey: ["answers"] })  → invalidates ALL answer queries
 * - queryClient.invalidateQueries({ queryKey: ["answers", "detail", id] })  → invalidates one
 */

export const queryKeys = {
  topics: {
    all: () => ["topics"] as const,
  },

  answers: {
    all: () => ["answers"] as const,
    list: (filters?: { topicId?: string; status?: string; q?: string }) =>
      ["answers", "list", filters] as const,
    detail: (id: string) => ["answers", "detail", id] as const,
    photos: (id: string) => ["answers", "photos", id] as const,
  },

  photos: {
    all: () => ["photos"] as const,
    list: (filters?: { topicId?: string; status?: string; q?: string }) =>
      ["photos", "list", filters] as const,
    detail: (id: string) => ["photos", "detail", id] as const,
    answers: (id: string) => ["photos", "answers", id] as const,
  },

  search: {
    all: () => ["search"] as const,
    results: (params: { q: string; type?: string; topicId?: string; status?: string }) =>
      ["search", "results", params] as const,
  },

  proposals: {
    all: () => ["proposals"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["proposals", "list", filters] as const,
  },

  conversations: {
    all: () => ["conversations"] as const,
    list: (page: string) => ["conversations", "list", page] as const,
    detail: (id: string) => ["conversations", "detail", id] as const,
  },

  clients: {
    all: () => ["clients"] as const,
    list: () => ["clients", "list"] as const,
    detail: (id: string) => ["clients", "detail", id] as const,
    documents: (id: string) => ["clients", "documents", id] as const,
    brandKit: (id: string) => ["clients", "brandKit", id] as const,
  },

  clientSuccess: {
    all: () => ["clientSuccess"] as const,
    entries: () => ["clientSuccess", "entries"] as const,
    results: () => ["clientSuccess", "results"] as const,
    testimonials: () => ["clientSuccess", "testimonials"] as const,
    awards: () => ["clientSuccess", "awards"] as const,
  },

  studio: {
    documents: () => ["studio", "documents"] as const,
    document: (id: string) => ["studio", "documents", id] as const,
    templates: () => ["studio", "templates"] as const,
  },

  testimonials: {
    all: () => ["testimonials"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["testimonials", "list", filters] as const,
  },
} as const
```

### Step 2.4: Create Query Hooks

Create custom hooks that wrap TanStack Query with your existing API functions. This is the bridge between your current `api.ts` and TanStack Query.

**Create `packages/client/src/hooks/queries/useTopics.ts`:**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { topicsApi } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { toast } from "@/hooks/useToast"

export function useTopics() {
  return useQuery({
    queryKey: queryKeys.topics.all(),
    queryFn: () => topicsApi.list(),
  })
}

export function useCreateTopic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; displayName: string }) =>
      topicsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() })
      toast.success("Topic created")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create topic")
    },
  })
}

export function useUpdateTopic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name: string; displayName: string }) =>
      topicsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() })
      toast.success("Topic updated")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update topic")
    },
  })
}

export function useDeleteTopic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => topicsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() })
      toast.success("Topic deleted")
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete topic")
    },
  })
}
```

**Create `packages/client/src/hooks/queries/useSearch.ts`:**

```typescript
import { useQuery } from "@tanstack/react-query"
import { searchApi } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"

interface SearchParams {
  q: string
  type?: "all" | "answers" | "photos"
  topicId?: string
  status?: "Approved" | "Draft"
  limit?: number
  offset?: number
}

export function useSearch(params: SearchParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.search.results(params),
    queryFn: () => searchApi.search(params),
    enabled: enabled && params.q.length > 0,
    // Search results go stale faster
    staleTime: 30 * 1000,
    // Keep previous data while new search loads (smooth UX)
    placeholderData: (previousData) => previousData,
  })
}

export function useAnswerDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.answers.detail(id!),
    queryFn: () => searchApi.getAnswer(id!),
    enabled: !!id,
  })
}

export function usePhotoDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.photos.detail(id!),
    queryFn: () => searchApi.getPhoto(id!),
    enabled: !!id,
  })
}
```

**Create `packages/client/src/hooks/queries/useConversations.ts`:**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { conversationsApi, type ConversationPage } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { toast } from "@/hooks/useToast"

export function useConversationList(page: ConversationPage) {
  return useQuery({
    queryKey: queryKeys.conversations.list(page),
    queryFn: () => conversationsApi.list(page),
    staleTime: 60 * 1000,
  })
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(id!),
    queryFn: () => conversationsApi.get(id!),
    enabled: !!id,
  })
}

export function useDeleteConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => conversationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all() })
      toast.success("Conversation deleted")
    },
  })
}
```

**Create `packages/client/src/hooks/queries/useClientSuccess.ts`:**

```typescript
import { useQuery } from "@tanstack/react-query"
import { clientSuccessApi } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"

export function useClientSuccessEntries() {
  return useQuery({
    queryKey: queryKeys.clientSuccess.entries(),
    queryFn: () => clientSuccessApi.getEntries(),
    staleTime: 5 * 60 * 1000, // This data rarely changes
  })
}

export function useClientSuccessResults() {
  return useQuery({
    queryKey: queryKeys.clientSuccess.results(),
    queryFn: () => clientSuccessApi.getResults(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useClientSuccessTestimonials() {
  return useQuery({
    queryKey: queryKeys.clientSuccess.testimonials(),
    queryFn: () => clientSuccessApi.getTestimonials(),
    staleTime: 5 * 60 * 1000,
  })
}

export function useClientSuccessAwards() {
  return useQuery({
    queryKey: queryKeys.clientSuccess.awards(),
    queryFn: () => clientSuccessApi.getAwards(),
    staleTime: 5 * 60 * 1000,
  })
}
```

**Create `packages/client/src/hooks/queries/useStudio.ts`:**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { studioApi } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { toast } from "@/hooks/useToast"

export function useStudioDocuments() {
  return useQuery({
    queryKey: queryKeys.studio.documents(),
    queryFn: () => studioApi.listDocuments(),
  })
}

export function useStudioDocument(id: string | null) {
  return useQuery({
    queryKey: queryKeys.studio.document(id!),
    queryFn: () => studioApi.getDocument(id!),
    enabled: !!id,
  })
}

export function useStudioTemplates() {
  return useQuery({
    queryKey: queryKeys.studio.templates(),
    queryFn: () => studioApi.listTemplates(),
    staleTime: 10 * 60 * 1000, // Templates rarely change
  })
}

export function useCreateStudioDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof studioApi.createDocument>[0]) =>
      studioApi.createDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.studio.documents() })
    },
  })
}

export function useSaveStudioDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Parameters<typeof studioApi.saveDocument>[1]) =>
      studioApi.saveDocument(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.studio.document(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.studio.documents() })
    },
  })
}
```

**Create `packages/client/src/hooks/queries/index.ts`:**

```typescript
export * from "./useTopics"
export * from "./useSearch"
export * from "./useConversations"
export * from "./useClientSuccess"
export * from "./useStudio"
```

### Step 2.5: Migration Strategy (Page by Page)

**DO NOT refactor all pages at once.** Migrate one page at a time. Each page follows this pattern:

#### Before (current pattern):

```typescript
// Typical page pattern (e.g., SearchLibrary.tsx)
const [answers, setAnswers] = useState([])
const [loading, setLoading] = useState(true)
const [error, setError] = useState<string | null>(null)

useEffect(() => {
  setLoading(true)
  searchApi.search({ q: searchQuery, topicId })
    .then(data => {
      setAnswers(data.answers)
      setError(null)
    })
    .catch(err => setError(err.message))
    .finally(() => setLoading(false))
}, [searchQuery, topicId])
```

#### After (TanStack Query):

```typescript
// Same page with TanStack Query
const { data, isLoading, error } = useSearch(
  { q: searchQuery, topicId },
  searchQuery.length > 0
)
const answers = data?.answers ?? []
```

#### Migration order (by complexity, easiest first):

1. **HomePage** (`pages/HomePage.tsx`) — Simple data loading, good starter
2. **ClientPortfolio** (`pages/ClientPortfolio.tsx`) — Multiple data queries, good test of parallel queries
3. **TestimonialManager** (`pages/TestimonialManager.tsx`) — CRUD operations, test mutations
4. **SearchLibrary** (`pages/SearchLibrary.tsx`) — Complex search + filters, test `placeholderData`
5. **DocumentStudio** (`pages/DocumentStudio.tsx`) — Document CRUD, test optimistic updates
6. **CommandPalette** (`components/CommandPalette.tsx`) — Uses conversations list, quick win
7. **AIHub** pages (AskAI, ProposalInsights, etc.) — Already use `useChat`, only need conversation list migration

### Step 2.6: Example Full Page Migration — HomePage

**Current pattern in `HomePage.tsx`** (simplified):

The HomePage likely loads recent conversations, stats, and quick-access data using multiple `useEffect` hooks with `useState`.

**After migration:**

```typescript
import { useTopics } from "@/hooks/queries"
import { useConversationList } from "@/hooks/queries"

function HomePage() {
  // These run in parallel automatically
  const topics = useTopics()
  const recentConversations = useConversationList("ask-ai")

  if (topics.isLoading || recentConversations.isLoading) {
    return <LoadingSkeleton />
  }

  if (topics.error) {
    return <ErrorState message={topics.error.message} retry={topics.refetch} />
  }

  return (
    // ... render with topics.data and recentConversations.data
  )
}
```

### Step 2.7: Handle Mutations with Cache Invalidation

For create/update/delete operations, use mutations with automatic cache invalidation.

**Example — Answer CRUD in SearchLibrary:**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { answersApi } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"

function SearchLibrary() {
  const queryClient = useQueryClient()

  const updateAnswer = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Answer> }) =>
      answersApi.update(id, data),
    onSuccess: (_, variables) => {
      // Invalidate the list and the specific answer
      queryClient.invalidateQueries({ queryKey: queryKeys.answers.all() })
      queryClient.invalidateQueries({ queryKey: queryKeys.search.all() })
      toast.success("Answer updated")
    },
  })

  const deleteAnswer = useMutation({
    mutationFn: (id: string) => answersApi.delete(id),
    onMutate: async (deletedId) => {
      // Optimistic update: remove from list immediately
      await queryClient.cancelQueries({ queryKey: queryKeys.answers.all() })
      // ... update cache optimistically
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.answers.all() })
      toast.success("Answer deleted")
    },
    onError: () => {
      // Rollback optimistic update on failure
      queryClient.invalidateQueries({ queryKey: queryKeys.answers.all() })
      toast.error("Failed to delete answer")
    },
  })

  // Use in JSX:
  // <button onClick={() => updateAnswer.mutate({ id, data })} disabled={updateAnswer.isPending}>
  //   {updateAnswer.isPending ? "Saving..." : "Save"}
  // </button>
}
```

### Step 2.8: Integrate with useChat (Conversation List Only)

The `useChat` hook manages its own conversation list with `refreshConversationList()`. Replace this with TanStack Query while keeping the streaming logic unchanged.

**In `useChat.ts`, replace the conversation list state:**

```typescript
// REMOVE these lines:
// const [conversationList, setConversationList] = useState<ConversationSummary[]>([])
// const refreshConversationList = useCallback(async () => { ... }, [page])
// useEffect(() => { if (page) refreshConversationList() }, [page])

// INSTEAD, import and use in the consuming component:
// The useChat hook should NOT manage conversation list anymore.
// Each page that uses useChat should independently call:
// const { data: conversationList } = useConversationList(page)
```

**However**, this is a deeper refactor. A simpler approach is to keep `useChat` as-is and add TanStack Query alongside it for non-chat data fetching. The conversation list in `useChat` can be migrated later.

### Step 2.9: DevTools

TanStack Query DevTools are already included in Step 2.2. They appear as a floating panel in development mode (bottom-left of the screen). Use them to:

- See all cached queries and their states
- Manually invalidate queries to test refetching
- Inspect query data, timing, and stale status
- Debug cache hit/miss behavior

### Files Modified (Phase 2 Summary)

| File | Change |
|------|--------|
| `packages/client/package.json` | Add `@tanstack/react-query`, `@tanstack/react-query-devtools` |
| `packages/client/src/lib/queryClient.ts` | **NEW** — Query client config |
| `packages/client/src/lib/queryKeys.ts` | **NEW** — Centralized query keys |
| `packages/client/src/hooks/queries/useTopics.ts` | **NEW** — Topics query hooks |
| `packages/client/src/hooks/queries/useSearch.ts` | **NEW** — Search query hooks |
| `packages/client/src/hooks/queries/useConversations.ts` | **NEW** — Conversation query hooks |
| `packages/client/src/hooks/queries/useClientSuccess.ts` | **NEW** — Client success query hooks |
| `packages/client/src/hooks/queries/useStudio.ts` | **NEW** — Studio document query hooks |
| `packages/client/src/hooks/queries/index.ts` | **NEW** — Barrel export |
| `packages/client/src/App.tsx` | Wrap with `QueryClientProvider` |
| Various pages (migrated one at a time) | Replace `useState`/`useEffect` with query hooks |

---

## Phase 3: Vercel AI SDK (Streaming Infrastructure)

**Why**: The app has 12 AI services, all using the same hand-rolled streaming pattern:
- **Server**: Each service calls `streamCompletion()` from `packages/server/src/services/utils/streamHelper.ts` which manually sets SSE headers, writes `event: metadata`, streams `data: { token }` chunks, then writes `event: done` with parsed structured data
- **Client**: The `fetchSSE()` function in `packages/client/src/lib/api.ts` (line 2103) manually reads the response body with `ReadableStream`, parses SSE protocol lines, and dispatches to callbacks
- **Hook**: The `useChat` hook in `packages/client/src/hooks/useChat.ts` manages all streaming state with `useState` + `requestAnimationFrame` batching

This works but is fragile, hard to test, and doesn't handle edge cases well (reconnection, backpressure, partial JSON chunks). The Vercel AI SDK provides a battle-tested abstraction for exactly this pattern.

**Goal**: Replace the custom SSE infrastructure with Vercel AI SDK's `streamText()` (server) and `useChat()` (client), while preserving the app's custom protocol extensions (metadata, follow-up prompts, chart data, SVG data, photo suggestions, deck data, action events).

### IMPORTANT: Compatibility Assessment

The Vercel AI SDK's `useChat()` hook is designed for simple chat UIs. This app's `useChat` hook has **significant custom functionality** that the SDK doesn't cover:

- Conversation persistence (save/load/delete/rename via API)
- Custom SSE events (metadata, action, chart data, SVG data, deck data, photo suggestions)
- Follow-up prompt parsing from response text
- requestAnimationFrame token batching
- `copiedId`, `showDataContext`, feedback tracking

**Recommended approach**: Use the Vercel AI SDK **server-side only** (for `streamText()`) and keep your custom client-side hook. The server-side value is much higher — it replaces manual OpenAI streaming, token counting, and SSE formatting with a clean abstraction.

### Step 3.1: Install Dependencies

```bash
# Root (for api/index.ts serverless)
npm install ai @ai-sdk/openai

# Server (for local dev)
cd packages/server
npm install ai @ai-sdk/openai

# Client (optional — only if you want useChat from the SDK)
cd packages/client
npm install ai
```

### Step 3.2: Create AI Provider

**Create `packages/server/src/lib/aiProvider.ts`:**

```typescript
import { createOpenAI } from "@ai-sdk/openai"

let provider: ReturnType<typeof createOpenAI> | null = null

export function getAIProvider() {
  if (!provider) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required")
    }
    provider = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return provider
}

/**
 * Get the default model.
 * Central place to change the model for all AI services.
 */
export function getModel(modelId = "gpt-4o") {
  return getAIProvider()(modelId)
}
```

This replaces the 12 copies of the lazy-initialized OpenAI client pattern:

```typescript
// BEFORE (repeated in every AI service):
let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

// AFTER (in every AI service):
import { getModel } from "../lib/aiProvider.js"
```

### Step 3.3: Create New Stream Helper

Replace `streamCompletion()` with a Vercel AI SDK version that maintains your custom protocol.

**Create `packages/server/src/services/utils/streamHelperV2.ts`:**

```typescript
import { streamText, type CoreMessage } from "ai"
import type { Response } from "express"
import { getModel } from "../../lib/aiProvider.js"
import {
  parseFollowUpPrompts,
  parsePhotoSuggestions,
  parseChartData,
  parseSVGData,
  parseDeckData,
  parseActionData,
} from "./streamHelper.js"  // Reuse existing parsers

export interface StreamOptionsV2 {
  messages: CoreMessage[]
  temperature?: number
  maxTokens?: number
  metadata: Record<string, unknown>
  /** Custom follow-up prompt parser. Falls back to default if not provided. */
  parseFollowUps?: (response: string) => { cleanResponse: string; prompts: string[] }
  /** Custom review annotation parser (for studio review mode). */
  parseReviewAnnotations?: (response: string) => {
    cleanResponse: string
    annotations: Array<{ id: string; quote: string; comment: string; severity: string; suggestedFix?: string }>
  }
  /** Resolve photo suggestions from parsed markers. */
  resolvePhotoSuggestions?: (suggestions: Array<{ query: string; placement: string }>) => Promise<Array<{
    query: string
    placement: string
    photos: Array<{ id: string; displayTitle: string; storageKey: string; fileUrl: string | null }>
  }>>
  res: Response
  /** Model override (defaults to gpt-4o) */
  model?: string
}

/**
 * Stream a completion using Vercel AI SDK.
 *
 * Maintains the same SSE protocol as the original streamCompletion():
 * - event: metadata  (sent first)
 * - data: { token }  (each chunk)
 * - event: action     (if AI requested settings changes)
 * - event: done       (sent last with cleanResponse, followUpPrompts, etc.)
 * - event: error      (on failure)
 */
export async function streamCompletionV2({
  messages,
  temperature = 0.4,
  maxTokens = 4000,
  metadata,
  parseFollowUps,
  parseReviewAnnotations,
  resolvePhotoSuggestions,
  res,
  model: modelId,
}: StreamOptionsV2): Promise<void> {
  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  // Send metadata first
  res.write(`event: metadata\ndata: ${JSON.stringify(metadata)}\n\n`)

  try {
    const model = getModel(modelId)

    const result = streamText({
      model,
      messages,
      temperature,
      maxTokens,
    })

    let fullResponse = ""

    // Stream tokens to client
    for await (const textPart of result.textStream) {
      fullResponse += textPart
      res.write(`data: ${JSON.stringify({ token: textPart })}\n\n`)
    }

    // Parse structured data from the complete response
    let processedResponse = fullResponse
    let reviewAnnotations: Array<{
      id: string; quote: string; comment: string; severity: string; suggestedFix?: string
    }> | undefined

    if (parseReviewAnnotations) {
      const annotationResult = parseReviewAnnotations(processedResponse)
      processedResponse = annotationResult.cleanResponse
      if (annotationResult.annotations.length > 0) {
        reviewAnnotations = annotationResult.annotations
      }
    }

    // Reuse existing parsers from streamHelper.ts
    const { cleanResponse: photoClean, suggestions: rawPhotoSuggestions } =
      parsePhotoSuggestions(processedResponse)
    const followUpParser = parseFollowUps || defaultParseFollowUps
    const { cleanResponse, prompts } = followUpParser(photoClean)
    const { cleanText: chartClean, chartData } = parseChartData(cleanResponse)
    const { cleanText: svgClean, svgData } = parseSVGData(chartClean)
    const { cleanText: deckClean, deckData } = parseDeckData(svgClean)
    const { cleanText: finalResponse, actions } = parseActionData(deckClean)

    // Resolve photo suggestions
    let photoSuggestions: Array<{
      query: string; placement: string
      photos: Array<{ id: string; displayTitle: string; storageKey: string; fileUrl: string | null }>
    }> | undefined
    if (resolvePhotoSuggestions && rawPhotoSuggestions.length > 0) {
      try {
        const resolved = await resolvePhotoSuggestions(rawPhotoSuggestions)
        if (resolved.length > 0) photoSuggestions = resolved
      } catch {
        // Photo resolution failed — skip
      }
    }

    // Send action event if AI requested settings changes
    if (actions.length > 0) {
      res.write(`event: action\ndata: ${JSON.stringify({ actions })}\n\n`)
    }

    // Send done event
    res.write(
      `event: done\ndata: ${JSON.stringify({
        cleanResponse: finalResponse,
        followUpPrompts: prompts,
        ...(chartData ? { chartData } : {}),
        ...(svgData ? { svgData } : {}),
        ...(reviewAnnotations ? { reviewAnnotations } : {}),
        ...(photoSuggestions ? { photoSuggestions } : {}),
        ...(deckData ? { deckData } : {}),
      })}\n\n`
    )

    res.end()
  } catch (error) {
    console.error("Stream error:", error)
    const message = error instanceof Error ? error.message : "Streaming failed"
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  }
}

/**
 * Default follow-up prompt parser.
 * Matches: FOLLOW_UP_PROMPTS: ["prompt1", "prompt2"]
 */
function defaultParseFollowUps(response: string): { cleanResponse: string; prompts: string[] } {
  const match = response.match(/FOLLOW_UP_PROMPTS:\s*(\[[\s\S]*?\])\s*$/m)
  if (match?.[1]) {
    try {
      const prompts = JSON.parse(match[1]) as string[]
      const cleanResponse = response.replace(/FOLLOW_UP_PROMPTS:\s*\[[\s\S]*?\]\s*$/m, "").trim()
      return { cleanResponse, prompts }
    } catch {
      // Malformed
    }
  }
  return { cleanResponse: response, prompts: [] }
}
```

### Step 3.4: Migrate AI Services (One at a Time)

Each AI service follows the same pattern. Here's how to migrate one:

#### Example: `proposalAIService.ts`

**Before:**

```typescript
import OpenAI from "openai"
import { streamCompletion, truncateHistory } from "./utils/streamHelper.js"

let openaiClient: OpenAI | null = null
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

export async function streamProposalQuery(
  query: string,
  conversationHistory: Array<{ role: string; content: string }>,
  res: Response,
  responseLength?: string,
  clientFilter?: string,
) {
  const openai = getOpenAI()
  if (!openai) { /* error handling */ }

  // ... load data, build system prompt ...

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: query },
  ]

  await streamCompletion({
    openai,
    messages,
    temperature: 0.4,
    maxTokens: 4000,
    metadata: { dataUsed: { proposalCount, categories } },
    parseFollowUpPrompts,
    res,
  })
}
```

**After:**

```typescript
import { streamCompletionV2 } from "./utils/streamHelperV2.js"
import type { CoreMessage } from "ai"

export async function streamProposalQuery(
  query: string,
  conversationHistory: Array<{ role: string; content: string }>,
  res: Response,
  responseLength?: string,
  clientFilter?: string,
) {
  // ... load data, build system prompt (UNCHANGED) ...

  const messages: CoreMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: query },
  ]

  await streamCompletionV2({
    messages,
    temperature: 0.4,
    maxTokens: 4000,
    metadata: { dataUsed: { proposalCount, categories } },
    parseFollowUps: parseFollowUpPrompts,
    res,
  })
}
```

**Changes per service:**
1. Remove `import OpenAI` and lazy-init pattern
2. Change `import { streamCompletion }` to `import { streamCompletionV2 }`
3. Change `OpenAI.ChatCompletionMessageParam[]` to `CoreMessage[]`
4. Remove `openai` from the `streamCompletionV2` call (it's handled internally)
5. Rename `parseFollowUpPrompts` param to `parseFollowUps`

### Step 3.5: Migration Order for All 12 Services

Migrate in order of risk (lowest traffic first):

| # | Service | File | Route |
|---|---------|------|-------|
| 1 | Companion AI | `companionAIService.ts` | `/companion/stream` |
| 2 | Client AI | `clientAIService.ts` | `/ai/client-chat/stream` |
| 3 | Testimonial AI | `testimonialAIService.ts` | `/testimonials/extract` |
| 4 | Case Study AI | `caseStudyAIService.ts` | `/ai/case-studies/stream` |
| 5 | Proposal AI | `proposalAIService.ts` | `/proposals/stream` |
| 6 | Unified AI | `unifiedAIService.ts` | `/unified-ai/stream` |
| 7 | AI Service | `aiService.ts` | `/ai/stream` |
| 8 | Briefing AI | `briefingAIService.ts` | `/studio/briefing/stream` |
| 9 | Document AI | `documentAIService.ts` | `/studio/chat/stream` |
| 10 | Pitch Deck AI | `pitchDeckAIService.ts` | `/pitch-deck/stream` |
| 11 | Meeting AI | `meetingAIService.ts` | `/meetings/analyze` |
| 12 | Humanizer AI | `humanizerAIService.ts` | `/humanizer/stream` |

### Step 3.6: Migrate api/index.ts (Vercel Serverless)

The `api/index.ts` file (7,564 lines) duplicates all server code for Vercel. It has its own streaming implementations that don't use `streamHelper.ts`.

**Strategy**: After migrating all services in `packages/server/`, you need to mirror those changes in `api/index.ts`. Since `api/index.ts` is a monolith, search for all occurrences of:

```typescript
const stream = await openai.chat.completions.create({ ... stream: true })
```

And replace with the Vercel AI SDK equivalent. There are approximately 10-12 such blocks.

**For each streaming block in `api/index.ts`:**

```typescript
// BEFORE:
import OpenAI from "openai"
// ... somewhere in a handler:
const openai = getOpenAI()
const stream = await openai.chat.completions.create({
  model: "gpt-4o",
  messages,
  temperature: 0.4,
  max_tokens: 4000,
  stream: true,
})

let fullResponse = ""
for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta?.content
  if (token) {
    fullResponse += token
    res.write(`data: ${JSON.stringify({ token })}\n\n`)
  }
}

// AFTER:
import { streamText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

// At module level:
const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! })

// In the handler:
const result = streamText({
  model: openaiProvider("gpt-4o"),
  messages,
  temperature: 0.4,
  maxTokens: 4000,
})

let fullResponse = ""
for await (const textPart of result.textStream) {
  fullResponse += textPart
  res.write(`data: ${JSON.stringify({ token: textPart })}\n\n`)
}
```

### Step 3.7: Client-Side Changes

**No client-side changes are needed** if you keep the existing `fetchSSE()` and `useChat` hook. The SSE protocol is identical — the server still sends the same events in the same format.

If you later want to adopt the Vercel AI SDK's `useChat()` hook on the client, you would need to:
1. Implement a custom `StreamData` encoder on the server to send metadata/follow-ups/charts via the SDK's data channel
2. Replace `fetchSSE()` with the SDK's built-in streaming
3. Reimplement conversation persistence, feedback, copy, etc.

This is a much larger effort and is **not recommended** until the current custom protocol stabilizes.

### Step 3.8: Keep the Old streamHelper.ts

Do NOT delete `streamHelper.ts` immediately. Keep it as a fallback:

```typescript
// In streamHelperV2.ts, add at the top:
export { streamCompletion } from "./streamHelper.js"
// This allows gradual migration — services can import either version
```

Delete `streamHelper.ts` only after all 12 services and `api/index.ts` have been migrated and tested.

### Files Modified (Phase 3 Summary)

| File | Change |
|------|--------|
| `package.json` | Add `ai`, `@ai-sdk/openai` |
| `packages/server/package.json` | Add `ai`, `@ai-sdk/openai` |
| `packages/server/src/lib/aiProvider.ts` | **NEW** — Centralized AI provider |
| `packages/server/src/services/utils/streamHelperV2.ts` | **NEW** — V2 stream helper using AI SDK |
| All 12 AI service files | Replace OpenAI imports + streamCompletion calls |
| `api/index.ts` | Replace ~12 streaming blocks with AI SDK |
| `packages/client/package.json` | Add `ai` (optional, only if adopting client SDK later) |

---

## Phase 4: Meilisearch (Search Engine)

**Why**: The app currently uses PostgreSQL full-text search (`to_tsvector`/`to_tsquery` with the `english` dictionary). This is implemented in `packages/server/src/services/answerService.ts` (line 459). It works but has significant limitations:

- **No typo tolerance** — searching "enrollmnt" won't match "enrollment"
- **No fuzzy matching** — partial words don't match well
- **No faceted filtering** — can't combine text search with structured filters efficiently
- **No relevance tuning** — can't boost question matches over answer matches
- **Slow on large datasets** — PostgreSQL FTS re-scans every query
- **No instant search** — each keystroke triggers a full SQL query
- **No synonym support** — "uni" doesn't match "university"

The current search covers only `answer_items` (question + answer columns). Proposals, client success entries, testimonials, and documents are NOT searchable through the main search.

**Goal**: Deploy Meilisearch as a dedicated search engine, index all searchable content, and provide sub-50ms instant search with typo tolerance and faceted filtering.

### Step 4.1: Choose Deployment Strategy

Meilisearch needs to run as a separate process. Options:

#### Option A: Meilisearch Cloud (Recommended for Vercel)

Since the app runs on Vercel (serverless), you can't run Meilisearch as a sidecar. Use Meilisearch Cloud:

1. Go to https://cloud.meilisearch.com
2. Create a project (free tier: 100K documents, 10K searches/month)
3. Get your **Host URL** and **API Keys** (admin + search)

```bash
# Add to .env and Vercel:
MEILISEARCH_HOST=https://ms-xxxxx.meilisearch.io
MEILISEARCH_ADMIN_KEY=your-admin-api-key
MEILISEARCH_SEARCH_KEY=your-search-api-key
```

#### Option B: Self-Hosted (for local dev or dedicated server)

```bash
# Docker
docker run -d -p 7700:7700 \
  -e MEILI_MASTER_KEY='your-master-key' \
  -v meili_data:/meili_data \
  getmeili/meilisearch:latest

# Or Homebrew (macOS)
brew install meilisearch
meilisearch --master-key='your-master-key'
```

For local dev, use Option B. For production on Vercel, use Option A.

### Step 4.2: Install Dependencies

```bash
# Server
cd packages/server
npm install meilisearch

# Root (for api/index.ts)
cd /path/to/project
npm install meilisearch

# Client (for direct search — optional, see Step 4.8)
cd packages/client
npm install meilisearch
```

### Step 4.3: Create Meilisearch Client

**Create `packages/server/src/lib/meilisearch.ts`:**

```typescript
import { MeiliSearch } from "meilisearch"

let client: MeiliSearch | null = null

export function getMeiliClient(): MeiliSearch | null {
  if (!process.env.MEILISEARCH_HOST || !process.env.MEILISEARCH_ADMIN_KEY) {
    return null
  }
  if (!client) {
    client = new MeiliSearch({
      host: process.env.MEILISEARCH_HOST,
      apiKey: process.env.MEILISEARCH_ADMIN_KEY,
    })
  }
  return client
}

/**
 * Get the search-only client (uses limited API key).
 * Safe to expose to the frontend if needed.
 */
export function getSearchClient(): MeiliSearch | null {
  if (!process.env.MEILISEARCH_HOST || !process.env.MEILISEARCH_SEARCH_KEY) {
    return null
  }
  return new MeiliSearch({
    host: process.env.MEILISEARCH_HOST,
    apiKey: process.env.MEILISEARCH_SEARCH_KEY,
  })
}

// Index names
export const INDEXES = {
  ANSWERS: "answers",
  PROPOSALS: "proposals",
  TESTIMONIALS: "testimonials",
  CLIENT_SUCCESS: "client_success",
  DOCUMENTS: "studio_documents",
} as const
```

### Step 4.4: Create Index Configuration

**Create `packages/server/src/services/searchIndexService.ts`:**

```typescript
import { getMeiliClient, INDEXES } from "../lib/meilisearch.js"

/**
 * Configure Meilisearch indexes with proper settings.
 * Run this once on first setup, or after schema changes.
 */
export async function configureIndexes(): Promise<void> {
  const meili = getMeiliClient()
  if (!meili) {
    console.warn("Meilisearch not configured — skipping index setup")
    return
  }

  // ─── Answers Index ─────────────────────────────────────────
  const answersIndex = meili.index(INDEXES.ANSWERS)

  await answersIndex.updateSettings({
    // Fields to search in, ordered by priority
    searchableAttributes: [
      "question",    // Most important — match questions first
      "answer",      // Then answer text
      "subtopic",    // Then category info
      "tags",        // Then tags
    ],

    // Fields returned in search results
    displayedAttributes: [
      "id", "question", "answer", "topicId", "topicName",
      "subtopic", "status", "tags", "createdAt", "updatedAt",
      "usageCount", "linkedPhotosCount",
    ],

    // Fields available for filtering (WHERE clauses)
    filterableAttributes: [
      "topicId", "topicName", "status", "tags", "subtopic",
    ],

    // Fields available for sorting
    sortableAttributes: [
      "createdAt", "updatedAt", "usageCount",
    ],

    // Ranking rules (order matters)
    rankingRules: [
      "words",       // Number of matching words
      "typo",        // Fewer typos = better
      "proximity",   // Words closer together = better
      "attribute",   // Priority of the matched attribute (question > answer > tags)
      "sort",        // User-requested sort
      "exactness",   // Exact matches beat fuzzy
    ],

    // Typo tolerance settings
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: {
        oneTypo: 4,    // Allow 1 typo for words >= 4 chars
        twoTypos: 8,   // Allow 2 typos for words >= 8 chars
      },
      disableOnAttributes: [], // Enable typo tolerance on all searchable attributes
    },

    // Synonyms for domain-specific terms
    synonyms: {
      "uni": ["university"],
      "university": ["uni", "institution", "school"],
      "enrollment": ["enrolment", "admissions"],
      "roi": ["return on investment"],
      "seo": ["search engine optimization"],
      "ppc": ["pay per click"],
      "ux": ["user experience"],
      "branding": ["brand", "brand identity"],
      "higher ed": ["higher education"],
      "healthcare": ["health care"],
      "website": ["web site", "site"],
    },

    // Pagination
    pagination: {
      maxTotalHits: 1000,
    },
  })

  // ─── Proposals Index ───────────────────────────────────────
  const proposalsIndex = meili.index(INDEXES.PROPOSALS)

  await proposalsIndex.updateSettings({
    searchableAttributes: [
      "clientName",
      "projectTitle",
      "description",
      "category",
      "services",
    ],
    filterableAttributes: ["category", "status", "year", "won"],
    sortableAttributes: ["year", "createdAt"],
    synonyms: {
      "web": ["website", "digital"],
      "creative": ["design", "branding"],
      "pr": ["public relations"],
    },
  })

  // ─── Testimonials Index ────────────────────────────────────
  const testimonialsIndex = meili.index(INDEXES.TESTIMONIALS)

  await testimonialsIndex.updateSettings({
    searchableAttributes: [
      "quote",
      "clientName",
      "contactName",
      "contactTitle",
      "sector",
    ],
    filterableAttributes: ["sector", "status", "clientName"],
    sortableAttributes: ["createdAt"],
  })

  // ─── Client Success Index ─────────────────────────────────
  const clientSuccessIndex = meili.index(INDEXES.CLIENT_SUCCESS)

  await clientSuccessIndex.updateSettings({
    searchableAttributes: [
      "clientName",
      "title",
      "description",
      "results",
      "sector",
    ],
    filterableAttributes: ["sector", "category", "clientName"],
    sortableAttributes: ["year"],
  })

  // ─── Studio Documents Index ────────────────────────────────
  const documentsIndex = meili.index(INDEXES.DOCUMENTS)

  await documentsIndex.updateSettings({
    searchableAttributes: [
      "title",
      "content",
      "type",
    ],
    filterableAttributes: ["type", "createdBy"],
    sortableAttributes: ["updatedAt", "createdAt"],
  })

  console.log("Meilisearch indexes configured successfully")
}
```

### Step 4.5: Create Indexing Service

**Create `packages/server/src/services/searchSyncService.ts`:**

```typescript
import { getMeiliClient, INDEXES } from "../lib/meilisearch.js"
import { db } from "../db/index.js"
import { answerItems, topics, studioDocuments } from "../db/schema.js"
import { eq, sql } from "drizzle-orm"

/**
 * Full reindex of all content into Meilisearch.
 * Run this once to populate indexes, then use incremental sync.
 */
export async function fullReindex(): Promise<{
  answers: number
  proposals: number
  testimonials: number
  clientSuccess: number
  documents: number
}> {
  const meili = getMeiliClient()
  if (!meili || !db) {
    throw new Error("Meilisearch or database not available")
  }

  const stats = { answers: 0, proposals: 0, testimonials: 0, clientSuccess: 0, documents: 0 }

  // ─── Index Answers ─────────────────────────────────────────
  console.log("Indexing answers...")
  const allAnswers = await db.execute(sql`
    SELECT
      a.id, a.question, a.answer, a.topic_id, a.subtopic,
      a.status, a.tags, a.created_at, a.updated_at,
      a.usage_count, t.display_name as topic_name,
      COALESCE(COUNT(l.photo_asset_id), 0)::int as linked_photos_count
    FROM answer_items a
    LEFT JOIN topics t ON a.topic_id = t.id
    LEFT JOIN links_answer_photo l ON a.id = l.answer_item_id
    GROUP BY a.id, t.display_name
  `)

  const answerDocs = (allAnswers as unknown as Array<Record<string, unknown>>).map(row => ({
    id: row.id as string,
    question: row.question as string,
    answer: row.answer as string,
    topicId: (row.topic_id ?? row.topicId) as string,
    topicName: (row.topic_name ?? row.topicName) as string | null,
    subtopic: row.subtopic as string | null,
    status: row.status as string,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags as string) : (row.tags || []),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
    usageCount: row.usage_count ?? row.usageCount ?? 0,
    linkedPhotosCount: row.linked_photos_count ?? row.linkedPhotosCount ?? 0,
  }))

  if (answerDocs.length > 0) {
    await meili.index(INDEXES.ANSWERS).addDocuments(answerDocs, { primaryKey: "id" })
    stats.answers = answerDocs.length
  }

  // ─── Index Studio Documents ────────────────────────────────
  console.log("Indexing studio documents...")
  const allDocs = await db.execute(sql`
    SELECT id, title, content, type, created_by, created_at, updated_at
    FROM studio_documents
    WHERE content IS NOT NULL AND LENGTH(content) > 0
  `)

  const docDocs = (allDocs as unknown as Array<Record<string, unknown>>).map(row => ({
    id: row.id as string,
    title: row.title as string,
    content: (row.content as string).slice(0, 10000), // Limit content length for search
    type: row.type as string,
    createdBy: row.created_by ?? row.createdBy,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  }))

  if (docDocs.length > 0) {
    await meili.index(INDEXES.DOCUMENTS).addDocuments(docDocs, { primaryKey: "id" })
    stats.documents = docDocs.length
  }

  // ─── Index Client Success Data ─────────────────────────────
  // This comes from the hardcoded clientSuccessData.ts
  // Import and index it:
  try {
    const { clientSuccessData } = await import("../data/clientSuccessData.js")

    if (clientSuccessData.testimonials?.length) {
      const testimonialDocs = clientSuccessData.testimonials.map((t: any, i: number) => ({
        id: t.id || `testimonial-${i}`,
        quote: t.quote,
        clientName: t.clientName,
        contactName: t.contactName,
        contactTitle: t.contactTitle,
        sector: t.sector,
        status: t.status || "Approved",
        createdAt: t.createdAt || new Date().toISOString(),
      }))
      await meili.index(INDEXES.TESTIMONIALS).addDocuments(testimonialDocs, { primaryKey: "id" })
      stats.testimonials = testimonialDocs.length
    }

    if (clientSuccessData.entries?.length) {
      const entryDocs = clientSuccessData.entries.map((e: any, i: number) => ({
        id: e.id || `entry-${i}`,
        clientName: e.clientName,
        title: e.title,
        description: e.description,
        results: e.results?.join("; ") || "",
        sector: e.sector,
        category: e.category,
        year: e.year,
      }))
      await meili.index(INDEXES.CLIENT_SUCCESS).addDocuments(entryDocs, { primaryKey: "id" })
      stats.clientSuccess = entryDocs.length
    }
  } catch (err) {
    console.error("Failed to index client success data:", err)
  }

  console.log("Full reindex complete:", stats)
  return stats
}

/**
 * Incrementally sync a single answer to Meilisearch.
 * Call this after creating/updating an answer.
 */
export async function syncAnswer(answerId: string): Promise<void> {
  const meili = getMeiliClient()
  if (!meili || !db) return

  const rows = await db.execute(sql`
    SELECT
      a.id, a.question, a.answer, a.topic_id, a.subtopic,
      a.status, a.tags, a.created_at, a.updated_at,
      a.usage_count, t.display_name as topic_name,
      COALESCE(COUNT(l.photo_asset_id), 0)::int as linked_photos_count
    FROM answer_items a
    LEFT JOIN topics t ON a.topic_id = t.id
    LEFT JOIN links_answer_photo l ON a.id = l.answer_item_id
    WHERE a.id = ${answerId}
    GROUP BY a.id, t.display_name
  `)

  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return

  await meili.index(INDEXES.ANSWERS).addDocuments([{
    id: row.id as string,
    question: row.question as string,
    answer: row.answer as string,
    topicId: (row.topic_id ?? row.topicId) as string,
    topicName: (row.topic_name ?? row.topicName) as string | null,
    subtopic: row.subtopic as string | null,
    status: row.status as string,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags as string) : (row.tags || []),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
    usageCount: row.usage_count ?? row.usageCount ?? 0,
    linkedPhotosCount: row.linked_photos_count ?? row.linkedPhotosCount ?? 0,
  }], { primaryKey: "id" })
}

/**
 * Remove a document from the search index.
 * Call this after deleting an answer.
 */
export async function removeFromIndex(index: string, id: string): Promise<void> {
  const meili = getMeiliClient()
  if (!meili) return
  await meili.index(index).deleteDocument(id)
}

/**
 * Sync a studio document to the search index.
 */
export async function syncStudioDocument(docId: string): Promise<void> {
  const meili = getMeiliClient()
  if (!meili || !db) return

  const rows = await db.execute(sql`
    SELECT id, title, content, type, created_by, created_at, updated_at
    FROM studio_documents WHERE id = ${docId}
  `)

  const row = (rows as unknown as Array<Record<string, unknown>>)[0]
  if (!row) return

  await meili.index(INDEXES.DOCUMENTS).addDocuments([{
    id: row.id as string,
    title: row.title as string,
    content: ((row.content as string) || "").slice(0, 10000),
    type: row.type as string,
    createdBy: row.created_by ?? row.createdBy,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  }], { primaryKey: "id" })
}
```

### Step 4.6: Create Search API Route

**Create `packages/server/src/routes/meiliSearch.ts`:**

```typescript
import { Router, type Request, type Response } from "express"
import { getMeiliClient, INDEXES } from "../lib/meilisearch.js"
import { configureIndexes } from "../services/searchIndexService.js"
import { fullReindex } from "../services/searchSyncService.js"

const router = Router()

/**
 * GET /api/meili/search
 * Unified search across all indexes
 */
router.get("/search", async (req: Request, res: Response) => {
  const meili = getMeiliClient()
  if (!meili) {
    return res.status(503).json({ error: "Search service not available" })
  }

  try {
    const {
      q = "",
      index,
      filter,
      sort,
      limit = "20",
      offset = "0",
      facets,
    } = req.query

    const query = (q as string).trim()
    const searchLimit = parseInt(limit as string, 10)
    const searchOffset = parseInt(offset as string, 10)

    // If a specific index is requested, search just that one
    if (index && typeof index === "string") {
      const results = await meili.index(index).search(query, {
        limit: searchLimit,
        offset: searchOffset,
        filter: filter as string | undefined,
        sort: sort ? [sort as string] : undefined,
        facets: facets ? (facets as string).split(",") : undefined,
        attributesToHighlight: ["question", "answer", "title", "quote"],
        highlightPreTag: "<mark>",
        highlightPostTag: "</mark>",
        showMatchesPosition: true,
      })

      return res.json(results)
    }

    // Multi-index search (search across all indexes simultaneously)
    const results = await meili.multiSearch({
      queries: [
        {
          indexUid: INDEXES.ANSWERS,
          q: query,
          limit: searchLimit,
          attributesToHighlight: ["question", "answer"],
          highlightPreTag: "<mark>",
          highlightPostTag: "</mark>",
        },
        {
          indexUid: INDEXES.TESTIMONIALS,
          q: query,
          limit: 5,
          attributesToHighlight: ["quote", "clientName"],
          highlightPreTag: "<mark>",
          highlightPostTag: "</mark>",
        },
        {
          indexUid: INDEXES.CLIENT_SUCCESS,
          q: query,
          limit: 5,
          attributesToHighlight: ["clientName", "title", "description"],
          highlightPreTag: "<mark>",
          highlightPostTag: "</mark>",
        },
        {
          indexUid: INDEXES.DOCUMENTS,
          q: query,
          limit: 5,
          attributesToHighlight: ["title"],
          highlightPreTag: "<mark>",
          highlightPostTag: "</mark>",
        },
      ],
    })

    res.json({
      query,
      results: results.results.map(r => ({
        index: r.indexUid,
        hits: r.hits,
        totalHits: r.estimatedTotalHits,
        processingTimeMs: r.processingTimeMs,
      })),
    })
  } catch (error) {
    console.error("Meilisearch error:", error)
    res.status(500).json({ error: "Search failed" })
  }
})

/**
 * POST /api/meili/reindex
 * Trigger a full reindex (admin only)
 */
router.post("/reindex", async (_req: Request, res: Response) => {
  try {
    await configureIndexes()
    const stats = await fullReindex()
    res.json({ success: true, stats })
  } catch (error) {
    console.error("Reindex failed:", error)
    res.status(500).json({ error: "Reindex failed" })
  }
})

/**
 * GET /api/meili/stats
 * Get index statistics
 */
router.get("/stats", async (_req: Request, res: Response) => {
  const meili = getMeiliClient()
  if (!meili) {
    return res.status(503).json({ error: "Search service not available" })
  }

  try {
    const stats = await meili.getStats()
    res.json(stats)
  } catch (error) {
    console.error("Stats failed:", error)
    res.status(500).json({ error: "Failed to get stats" })
  }
})

export default router
```

### Step 4.7: Register Route and Add Sync Hooks

**Modify `packages/server/src/routes/index.ts`:**

```typescript
// ADD import:
import meiliSearchRouter from "./meiliSearch.js"

// ADD route (after other routes):
app.use("/api/meili", requireAuth, meiliSearchRouter)
```

**Add sync hooks to answer CRUD operations.**

Modify `packages/server/src/routes/answers.ts` (or wherever answers are created/updated/deleted):

```typescript
import { syncAnswer, removeFromIndex, INDEXES } from "../services/searchSyncService.js"

// After creating an answer:
// await syncAnswer(newAnswer.id)  // Fire-and-forget

// After updating an answer:
// syncAnswer(updatedAnswer.id).catch(console.error)

// After deleting an answer:
// removeFromIndex(INDEXES.ANSWERS, deletedId).catch(console.error)
```

Similarly for studio documents and any other indexed content.

### Step 4.8: Client-Side Integration

**Option A: Search through your API (recommended)**

Keep all search requests going through your Express API. The client doesn't need the Meilisearch SDK.

**Create `packages/client/src/hooks/queries/useMeiliSearch.ts`:**

```typescript
import { useQuery } from "@tanstack/react-query"

const API_BASE = import.meta.env.VITE_API_URL || "/api"

interface MeiliSearchParams {
  q: string
  index?: string
  filter?: string
  sort?: string
  limit?: number
  offset?: number
}

interface MeiliSearchResult {
  query: string
  results: Array<{
    index: string
    hits: Array<Record<string, unknown>>
    totalHits: number
    processingTimeMs: number
  }>
}

async function searchMeili(params: MeiliSearchParams): Promise<MeiliSearchResult> {
  const searchParams = new URLSearchParams()
  if (params.q) searchParams.set("q", params.q)
  if (params.index) searchParams.set("index", params.index)
  if (params.filter) searchParams.set("filter", params.filter)
  if (params.sort) searchParams.set("sort", params.sort)
  if (params.limit) searchParams.set("limit", String(params.limit))
  if (params.offset) searchParams.set("offset", String(params.offset))

  const response = await fetch(`${API_BASE}/meili/search?${searchParams}`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error("Search failed")
  return response.json()
}

export function useMeiliSearch(params: MeiliSearchParams, enabled = true) {
  return useQuery({
    queryKey: ["meili", "search", params],
    queryFn: () => searchMeili(params),
    enabled: enabled && params.q.length > 0,
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev, // Keep previous results while loading
  })
}
```

**Option B: Direct client-side search (faster, but exposes search key)**

Install `meilisearch` on the client and search directly. Faster because it skips your API server. The search-only API key is safe to expose (it can only read, not write).

```typescript
// packages/client/src/lib/meiliClient.ts
import { MeiliSearch } from "meilisearch"

export const meili = new MeiliSearch({
  host: import.meta.env.VITE_MEILISEARCH_HOST,
  apiKey: import.meta.env.VITE_MEILISEARCH_SEARCH_KEY,
})
```

### Step 4.9: Upgrade SearchLibrary to Use Meilisearch

The `SearchLibrary.tsx` page (3,250 lines) is the primary search UI. To integrate Meilisearch:

1. Find where it calls `searchApi.search()` or fetches from `/api/search`
2. Replace with `useMeiliSearch()` hook or direct Meilisearch calls
3. Add instant search (debounced to 150ms instead of on-submit)
4. Display highlighted results using the `_formatted` field from Meilisearch
5. Add faceted filters using Meilisearch's built-in facet counts

**Key changes:**

```typescript
// BEFORE:
const [results, setResults] = useState([])
useEffect(() => {
  searchApi.search({ q: query, topicId }).then(data => setResults(data.answers))
}, [query, topicId])

// AFTER:
const { data: searchResults, isLoading } = useMeiliSearch(
  { q: debouncedQuery, index: "answers", filter: topicId ? `topicId = "${topicId}"` : undefined },
  debouncedQuery.length > 0
)
const results = searchResults?.results[0]?.hits ?? []
```

### Step 4.10: Upgrade CommandPalette to Use Meilisearch

The `CommandPalette.tsx` component can benefit from multi-index search — when the user types, search across answers, documents, conversations, and routes simultaneously:

```typescript
const { data } = useMeiliSearch({ q: searchTerm })

// data.results will contain hits from ALL indexes:
// - answers: matching Q&A entries
// - documents: matching studio documents
// - testimonials: matching testimonials
// - client_success: matching case studies
```

### Step 4.11: Fallback Strategy

Keep the PostgreSQL full-text search as a fallback. If Meilisearch is unavailable (env vars not set, service down), fall back to the existing `searchAnswers()` function.

```typescript
// In search route handler:
const meili = getMeiliClient()
if (meili) {
  // Use Meilisearch
  const results = await meili.index("answers").search(query, { ... })
  return res.json(results)
} else {
  // Fallback to PostgreSQL FTS
  const results = await searchAnswers(query, filters)
  return res.json({ answers: results })
}
```

### Step 4.12: Initial Setup Script

**Create `packages/server/src/scripts/setupMeilisearch.ts`:**

```typescript
import "dotenv/config"
import { configureIndexes } from "../services/searchIndexService.js"
import { fullReindex } from "../services/searchSyncService.js"

async function main() {
  console.log("Setting up Meilisearch...")
  console.log(`Host: ${process.env.MEILISEARCH_HOST}`)

  console.log("\n1. Configuring indexes...")
  await configureIndexes()

  console.log("\n2. Running full reindex...")
  const stats = await fullReindex()

  console.log("\n--- Setup Complete ---")
  console.log(`Answers indexed: ${stats.answers}`)
  console.log(`Proposals indexed: ${stats.proposals}`)
  console.log(`Testimonials indexed: ${stats.testimonials}`)
  console.log(`Client success entries indexed: ${stats.clientSuccess}`)
  console.log(`Documents indexed: ${stats.documents}`)
}

main().catch(console.error)
```

**Add script to `packages/server/package.json`:**

```json
{
  "scripts": {
    "meili:setup": "tsx src/scripts/setupMeilisearch.ts"
  }
}
```

Run with: `npm run meili:setup -w @rfp-proposals/server`

### Step 4.13: Add to api/index.ts (Vercel)

For the Vercel serverless function, add the Meilisearch search endpoint. In `api/index.ts`, find the route handler switch/if-else block and add:

```typescript
// Add near other route handlers:
if (path === "/api/meili/search" && method === "GET") {
  const meili = getMeiliClientVercel()
  if (!meili) return res.status(503).json({ error: "Search not available" })

  const { q, index, filter, sort, limit, offset } = req.query
  // ... same search logic as the Express route ...
}
```

### Files Modified (Phase 4 Summary)

| File | Change |
|------|--------|
| `packages/server/package.json` | Add `meilisearch` |
| `package.json` | Add `meilisearch` (for api/index.ts) |
| `packages/server/src/lib/meilisearch.ts` | **NEW** — Meilisearch client |
| `packages/server/src/services/searchIndexService.ts` | **NEW** — Index configuration |
| `packages/server/src/services/searchSyncService.ts` | **NEW** — Sync service |
| `packages/server/src/routes/meiliSearch.ts` | **NEW** — Search API route |
| `packages/server/src/routes/index.ts` | Register meili route |
| `packages/server/src/scripts/setupMeilisearch.ts` | **NEW** — Setup script |
| `packages/server/src/routes/answers.ts` | Add sync hooks on CRUD |
| `packages/client/src/hooks/queries/useMeiliSearch.ts` | **NEW** — Search query hook |
| `packages/client/src/pages/SearchLibrary.tsx` | Replace PostgreSQL search with Meilisearch |
| `packages/client/src/components/CommandPalette.tsx` | Add multi-index search |
| `api/index.ts` | Add Meilisearch route handler |

---

## Environment Variables Summary

All new env vars needed across all 4 phases:

```bash
# .env (local development)
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx          # Phase 1
SENTRY_DSN=https://xxx@sentry.io/xxx                # Phase 1
SENTRY_AUTH_TOKEN=sntrys_xxx                         # Phase 1 (build only)
MEILISEARCH_HOST=http://localhost:7700               # Phase 4
MEILISEARCH_ADMIN_KEY=your-admin-key                 # Phase 4
MEILISEARCH_SEARCH_KEY=your-search-key               # Phase 4
VITE_MEILISEARCH_HOST=http://localhost:7700           # Phase 4 (if using Option B)
VITE_MEILISEARCH_SEARCH_KEY=your-search-key           # Phase 4 (if using Option B)

# Vercel (production) — use: printf 'value' | vercel env add NAME production
VITE_SENTRY_DSN                                       # Phase 1
SENTRY_DSN                                            # Phase 1
SENTRY_AUTH_TOKEN                                      # Phase 1
MEILISEARCH_HOST                                       # Phase 4
MEILISEARCH_ADMIN_KEY                                  # Phase 4
MEILISEARCH_SEARCH_KEY                                 # Phase 4
```

No new env vars needed for Phase 2 (TanStack Query) or Phase 3 (Vercel AI SDK — uses existing `OPENAI_API_KEY`).

---

## Dependency Summary

```bash
# Phase 1: Sentry
npm install @sentry/node                                  # root + server
npm install @sentry/react @sentry/vite-plugin --save-dev  # client

# Phase 2: TanStack Query
npm install @tanstack/react-query @tanstack/react-query-devtools  # client

# Phase 3: Vercel AI SDK
npm install ai @ai-sdk/openai                             # root + server + client

# Phase 4: Meilisearch
npm install meilisearch                                   # root + server (+ client if Option B)
```

---

## Verification Checklist

### Phase 1 (Sentry)
- [ ] Client errors appear in Sentry dashboard with stack traces
- [ ] Server errors appear with route context
- [ ] Streaming endpoint failures are captured
- [ ] User context (email) appears on error events
- [ ] Session cookies are NOT in event payload
- [ ] Source maps produce readable stack traces in production
- [ ] ErrorBoundary reports to Sentry before showing reload button

### Phase 2 (TanStack Query)
- [ ] DevTools panel visible in development (bottom-left)
- [ ] Navigating away and back does NOT re-fetch fresh data
- [ ] Two components requesting same data fire only ONE request
- [ ] Mutations show loading state on buttons
- [ ] Cache invalidates correctly after create/update/delete
- [ ] Background refetch on window focus works
- [ ] Error states display correctly with retry button

### Phase 3 (Vercel AI SDK)
- [ ] All 12 streaming endpoints still work identically
- [ ] Follow-up prompts still parse correctly
- [ ] Chart data, SVG data, deck data still render
- [ ] Photo suggestions still resolve
- [ ] Action events (settings changes) still work
- [ ] Token batching and smooth streaming unchanged
- [ ] Conversation persistence unchanged
- [ ] Abort (stop generating) still works

### Phase 4 (Meilisearch)
- [ ] `npm run meili:setup` completes without errors
- [ ] Search returns results within 50ms
- [ ] Typo tolerance works ("enrollmnt" finds "enrollment")
- [ ] Filtering by topic/status works
- [ ] Multi-index search returns results from all content types
- [ ] CommandPalette shows cross-content results
- [ ] New/updated answers appear in search within seconds
- [ ] Deleted answers disappear from search
- [ ] PostgreSQL fallback works when Meilisearch is unavailable
