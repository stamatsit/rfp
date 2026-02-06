# App Upgrades Plan

> Reference doc for 6 features to elevate the data app. Come back to this anytime.

---

## Features Selected

| # | Feature | Effort | What it does |
|---|---------|--------|-------------|
| 1 | SSE Streaming | Large | Tokens stream in real-time as GPT-4o generates them (typewriter effect) |
| 2 | Chat Session Persistence | Medium | AI remembers previous messages in a conversation |
| 3 | Thumbs Up/Down Feedback | Small | Per-message feedback on assistant responses |
| 5 | shadcn Chat Components | Large | Auto-resize textarea, scroll-to-bottom, proper markdown rendering |
| 6 | AI Chart Generation | Large | Inline charts (bar/line/pie) rendered from AI-detected data patterns |
| 7 | Full Chat Component Library | Large | Message branching, retry/regenerate, keyboard shortcuts, better loading |

---

## Implementation Order

```
Phase 1: Shared Infrastructure (enables everything else)
  Step A: useChat hook + shared types + refactor ProposalInsights as reference
  Step B: Chat component library (Features 5+7)
  Step C: Refactor remaining 3 pages to use new components

Phase 2: Core Features
  Step D: SSE Streaming (Feature 1)
  Step E: Chat Session Persistence (Feature 2)

Phase 3: Enhancements
  Step F: Thumbs Up/Down Feedback (Feature 3)
  Step G: AI-Powered Chart Generation (Feature 6)
```

---

## Phase 1: Shared Infrastructure

### Step A — useChat Hook + Types

**Problem:** All 4 chat pages (ProposalInsights, CaseStudies, UnifiedAI, AskAI) duplicate ~400 lines of identical logic: message state, submit handlers, loading state, copy-to-clipboard, scroll, input handling.

**Solution:** Extract a custom `useChat` hook.

**New files:**
- `packages/client/src/types/chat.ts`
- `packages/client/src/hooks/useChat.ts`

**Hook API:**
```ts
useChat({ endpoint, parseResult, buildBody? }) => {
  messages, inputValue, setInputValue, isLoading, isStreaming,
  handleSubmit, handleCopy, copiedId, handleFeedback, handleRetry,
  abortStream, messagesEndRef, inputRef, conversationId
}
```

**ChatMessage interface** (future-ready):
```ts
interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  followUpPrompts?: string[]
  refused?: boolean
  refusalReason?: string
  timestamp: Date
  feedback?: "up" | "down" | null       // Feature 3
  chartData?: ChartConfig | null         // Feature 6
  metadata?: Record<string, unknown>     // Page-specific (dataUsed, sources, etc.)
  branches?: ChatMessage[]               // Feature 7
  activeBranchIndex?: number             // Feature 7
}
```

**ChatTheme interface** — eliminates hardcoded colors across 4 files:
```ts
interface ChatTheme {
  name: string
  primary: string        // "cyan" | "violet" | "indigo" | "blue"
  botGradient: string    // CSS gradient for bot avatar
  accentBg: string       // "bg-cyan-50" etc.
  accentText: string     // "text-cyan-500" etc.
  accentBorder: string   // "border-cyan-200" etc.
  sendButton: string     // Tailwind gradient classes
}
```

**Migration:** Refactor `ProposalInsights.tsx` first (~500 lines → ~150 lines), then replicate to other pages.

### Step B — Chat Component Library

**New files in `packages/client/src/components/chat/`:**

| Component | Description |
|-----------|-------------|
| `ChatContainer.tsx` | Layout: status bar slot + scrollable message area + sticky footer |
| `ChatMessage.tsx` | User/assistant/error messages. Copy, feedback, follow-ups, charts, branches |
| `ChatInput.tsx` | Auto-resizing textarea (min 44px, max 200px). Enter to send, Shift+Enter newline, Escape cancel |
| `MarkdownRenderer.tsx` | Lightweight custom parser: bold, italic, headings, lists, code blocks, inline code, tables. React elements output, DOMPurify safety net |
| `ScrollToBottom.tsx` | Floating button via IntersectionObserver. Appears when scrolled >100px up. Unread badge |
| `LoadingIndicator.tsx` | Phase-based: "Preparing..." → "Analyzing..." → "Generating..." → "Almost there..." |
| `index.ts` | Barrel export |

**Keyboard shortcuts** (in useChat hook):
- `Cmd+Enter` / `Ctrl+Enter` — send message
- `Escape` — cancel streaming or blur input
- `Cmd+Shift+R` — retry last message

**Message branching** (Feature 7): `< 1/3 >` arrows when a message has branches. Retry creates a new branch instead of replacing.

### Step C — Refactor Remaining Pages

Refactor `CaseStudies.tsx`, `UnifiedAI.tsx`, `AskAI.tsx`. Each page keeps only: theme config, quick actions array, status bar JSX, page-specific data context panel.

---

## Phase 2: Core Features

### Step D — SSE Streaming (Feature 1)

**Server — add streaming function to each service:**
```ts
// Example: proposalAIService.ts
export async function streamProposalInsights(
  query: string,
  onToken: (token: string) => void
): Promise<{ followUpPrompts: string[], recommendations: Recommendation[] }>
```
Uses `openai.chat.completions.create({ stream: true })` and iterates `for await (const chunk of stream)`.

**Server — modify each route** (`proposals.ts`, `ai.ts`, `unifiedAI.ts`):
```
Set SSE headers → send metadata event → stream tokens → send done event
```

**SSE Event Protocol:**
```
event: metadata    →  { dataUsed: {...} }           (sent first)
data:              →  { token: "..." }               (each chunk)
event: done        →  { followUpPrompts, cleanResponse, chartData }  (sent last)
event: error       →  { error: "..." }               (on failure)
```

**Client — add `fetchSSE()` to `lib/api.ts`:**
```ts
export async function fetchSSE(
  url: string,
  body: Record<string, unknown>,
  callbacks: {
    onMetadata?: (data: any) => void
    onToken: (token: string) => void
    onDone: (data: any) => void
    onError?: (error: string) => void
  },
  signal?: AbortSignal
): Promise<void>
```
Uses ReadableStream reader + TextDecoder to parse SSE lines.

**Client — update useChat hook:**
On submit → add empty assistant message → call fetchSSE → append tokens via onToken → finalize on done. Batch updates with `requestAnimationFrame` to avoid 50/sec re-renders.

**Edge case:** FOLLOW_UP_PROMPTS text streams before server can parse it. Solution: `done` event includes `cleanResponse` which replaces streamed content.

**Risk — Vercel:** SSE works on Vercel Edge Functions. May need to convert AI routes to Edge Runtime if using serverless.

### Step E — Chat Session Persistence (Feature 2)

**API change** — all endpoints accept optional conversation history:
```ts
{ query: string, conversationHistory?: { role: "user"|"assistant", content: string }[] }
```

**Server — new utility** `packages/server/src/services/utils/tokenEstimator.ts`:
```ts
estimateTokens(text: string): number        // ~1 token per 4 chars
truncateHistory(messages, maxTokens=8000)    // keeps most recent within budget
```

**Server — modify each service** to prepend conversation history to OpenAI messages array.

**Client — useChat hook:**
- `buildBody` auto-includes `conversationHistory` from messages state
- `sessionStorage` persistence per `conversationId`
- "New conversation" button to reset

---

## Phase 3: Enhancements

### Step F — Thumbs Up/Down Feedback (Feature 3)

**Client — ChatMessage.tsx:**
- `ThumbsUp`/`ThumbsDown` icons (lucide-react) on hover (`group-hover:opacity-100`)
- Green for up, red for down, gray default
- Toggles `message.feedback` state

**Server (optional) — `packages/server/src/routes/feedback.ts`:**
- `POST /api/feedback` logs `{ conversationId, messageId, score, timestamp }`
- v1: console log only. Database table later.

### Step G — AI Chart Generation (Feature 6)

**New dependency:** `recharts`

**Server — prompt engineering** — add to each system prompt:
```
When discussing quantitative comparisons or trends, include:
CHART_DATA: {"type":"bar|line|pie","title":"...","data":[...],"xKey":"...","yKeys":[...]}
```

**Server — shared parser** — extract `parseResponseExtras()` that handles both `FOLLOW_UP_PROMPTS` and `CHART_DATA`.

**Client — `packages/client/src/components/chat/InlineChart.tsx`:**
- Renders BarChart/LineChart/PieChart from recharts
- Colors: theme primary + emerald + amber + indigo (no pink/fuchsia)
- Responsive, dark mode, graceful fallback for malformed data

---

## Files Summary

### New Files (12)

| File | Phase |
|------|-------|
| `packages/client/src/types/chat.ts` | 1A |
| `packages/client/src/hooks/useChat.ts` | 1A |
| `packages/client/src/components/chat/ChatContainer.tsx` | 1B |
| `packages/client/src/components/chat/ChatMessage.tsx` | 1B |
| `packages/client/src/components/chat/ChatInput.tsx` | 1B |
| `packages/client/src/components/chat/MarkdownRenderer.tsx` | 1B |
| `packages/client/src/components/chat/ScrollToBottom.tsx` | 1B |
| `packages/client/src/components/chat/LoadingIndicator.tsx` | 1B |
| `packages/client/src/components/chat/InlineChart.tsx` | 3G |
| `packages/client/src/components/chat/index.ts` | 1B |
| `packages/server/src/services/utils/tokenEstimator.ts` | 2E |
| `packages/server/src/routes/feedback.ts` | 3F |

### Modified Files (15)

| File | What changes |
|------|-------------|
| `packages/client/src/pages/ProposalInsights.tsx` | Refactor to useChat + chat components |
| `packages/client/src/pages/CaseStudies.tsx` | Same refactor |
| `packages/client/src/pages/UnifiedAI.tsx` | Same refactor |
| `packages/client/src/pages/AskAI.tsx` | Same refactor (has unique sources/photos panel) |
| `packages/client/src/lib/api.ts` | Add fetchSSE helper, update API body shapes |
| `packages/client/package.json` | Add recharts dependency |
| `packages/server/src/routes/proposals.ts` | SSE headers + history params |
| `packages/server/src/routes/ai.ts` | SSE headers + history params |
| `packages/server/src/routes/unifiedAI.ts` | SSE headers + history params |
| `packages/server/src/routes/index.ts` | Register feedback route |
| `packages/server/src/services/proposalAIService.ts` | Streaming fn + history + chart prompt |
| `packages/server/src/services/caseStudyAIService.ts` | Same |
| `packages/server/src/services/unifiedAIService.ts` | Same |
| `packages/server/src/services/aiService.ts` | Same |

---

## GitHub Sources

| Feature | Reference Repo | Stars |
|---------|---------------|-------|
| SSE Streaming | [vercel/ai](https://github.com/vercel/ai) | 20M+ npm/mo |
| Chat UI Components | [assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) | 8.3k |
| shadcn Chat Kit | [Blazity/shadcn-chatbot-kit](https://github.com/Blazity/shadcn-chatbot-kit) | — |
| Chat Session Mgmt | [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) | — |
| Feedback Pattern | [surendergupta/botai](https://github.com/surendergupta/botai) | — |
| Text-to-Chart | [Canner/WrenAI](https://github.com/Canner/WrenAI) | — |
| Typewriter Animation | [mxmzb/react-aiwriter](https://github.com/mxmzb/react-aiwriter) | — |

---

## Verification Checklist

- [ ] Phase 1: `npm run build` passes, all 4 chat pages render correctly
- [ ] Phase 2D: Tokens stream in real-time (no 5-15s wait)
- [ ] Phase 2E: Follow-up questions reference previous conversation context
- [ ] Phase 3F: Thumbs appear on hover, toggle state correctly
- [ ] Phase 3G: Charts render inline for data-heavy queries (win rates, trends)
