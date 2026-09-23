import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import localforage from "localforage"
import {
  Globe,
  X,
  Check,
  Minus,
  Loader2,
  AlertCircle,
  Search,
  ChevronRight,
  ImageDown,
  MonitorSmartphone,
  Eye,
  RotateCcw,
  History,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addCsrfHeader } from "@/lib/csrfToken"
import {
  MAX_PAGES_PER_RUN,
  planRun,
  indexHistory,
  isCaptured,
  filterUncaptured,
  normalizeUrlKey,
  type CaptureHistoryEntry,
  type HistoryIndex,
  type ViewportChoice,
} from "@/lib/screenshotCaptureRules"

// ─── Constants ──────────────────────────────────────────────────────────────

// The hard cap on pages per run is MAX_PAGES_PER_RUN in @/lib/screenshotCaptureRules.
const EST_SECONDS_PER_CAPTURE = 7
const CAPTURE_CONCURRENCY_FOR_ESTIMATE = 2
const CAPTURE_CONCURRENCY = 2
const CAPTURE_STAGGER_MS = 800
const MAX_RETRIES = 4
const SEARCH_DEBOUNCE_MS = 100
const SAVE_DEBOUNCE_MS = 300
const MAX_SESSIONS = 5
const LAST_DOMAIN_KEY = "imageToolkit.lastDomain"
const TEST_CAPTURE_DISABLED_WHILE_RUNNING = true

// ─── Smart-group keyword sets ───────────────────────────────────────────────

const SMART_GROUP_MIN_MATCH = 3

const ADMISSIONS_KEYWORDS = ["admission", "apply", "visit", "tour", "financial-aid"]
const ACADEMICS_KEYWORDS = ["program", "major", "department", "academic", "course", "faculty"]
const NEWS_KEYWORDS = ["news", "blog", "article", "post", "story", "press"]
const ABOUT_KEYWORDS = ["about", "leadership", "people", "staff", "team", "mission", "history"]
const EVENTS_KEYWORDS = ["event", "calendar"]

// ─── Types ──────────────────────────────────────────────────────────────────

type CaptureRowStatus = "queued" | "capturing" | "done" | "error" | "cancelled"

interface CaptureRow {
  id: number
  url: string
  viewport: "desktop" | "mobile"
  status: CaptureRowStatus
  error?: string
  thumbBlob?: Blob
  /** Whether the server saved this capture to the screenshot library. */
  stored?: boolean
  captureId?: string
}

interface TreeNode {
  segment: string
  fullPath: string
  children: Map<string, TreeNode>
  urls: string[]
  descendantUrls: string[]
}

interface SmartGroup {
  id: string
  label: string
  matchFn: (pathname: string, depth: number) => boolean
  urls: string[]
}

interface CaptureSession {
  domain: string
  discoveredUrls: string[]
  selectedUrls: string[]
  viewport: "desktop" | "mobile" | "both"
  captureRows: Omit<CaptureRow, "thumbBlob">[]
  lastUpdated: number
}

interface SSEDiscoveredData {
  url?: string
  total?: number
}

interface SSEStatusData {
  message?: string
}

interface SSEDoneData {
  total?: number
  source?: "sitemap" | "robots" | "fallback"
}

// SSE error events don't carry structured data in our protocol;
// the EventSource 'error' listener handles those.

type ModalState = "discover" | "discovering" | "tree" | "capturing"

// ─── IndexedDB persistence (extends existing localforage pattern) ───────────

const captureSessionStore = localforage.createInstance({
  name: "image-toolkit",
  storeName: "capture-sessions",
})

async function saveCaptureSession(domain: string, session: CaptureSession): Promise<void> {
  try {
    await captureSessionStore.setItem(domain, session)
    await pruneCaptureSessions(MAX_SESSIONS)
  } catch { /* best-effort */ }
}

async function loadCaptureSession(domain: string): Promise<CaptureSession | null> {
  try {
    return await captureSessionStore.getItem<CaptureSession>(domain)
  } catch {
    return null
  }
}

async function listCaptureSessions(): Promise<CaptureSession[]> {
  try {
    const keys = await captureSessionStore.keys()
    const sessions: CaptureSession[] = []
    for (const key of keys) {
      const s = await captureSessionStore.getItem<CaptureSession>(key)
      if (s) sessions.push(s)
    }
    return sessions.sort((a, b) => b.lastUpdated - a.lastUpdated)
  } catch {
    return []
  }
}

async function pruneCaptureSessions(keepN: number): Promise<void> {
  try {
    const sessions = await listCaptureSessions()
    for (let i = keepN; i < sessions.length; i++) {
      await captureSessionStore.removeItem(sessions[i]!.domain)
    }
  } catch { /* best-effort */ }
}

async function deleteCaptureSession(domain: string): Promise<void> {
  try {
    await captureSessionStore.removeItem(domain)
  } catch { /* best-effort */ }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeHostname(h: string): string {
  return h.replace(/^www\./, "").toLowerCase()
}

function extractOrigin(input: string): string {
  let url: string = input.trim()
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    return new URL(url).origin
  } catch {
    return `https://${input.trim()}`
  }
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const u of urls) {
    const normalized = u.replace(/\/+$/, "")
    if (!seen.has(normalized)) {
      seen.add(normalized)
      result.push(u)
    }
  }
  return result
}

function buildTree(urls: string[], _origin: string): TreeNode {
  const root: TreeNode = {
    segment: "",
    fullPath: "/",
    children: new Map(),
    urls: [],
    descendantUrls: [],
  }

  for (const url of urls) {
    let pathname: string
    try {
      pathname = new URL(url).pathname
    } catch {
      continue
    }
    const segments = pathname.split("/").filter(Boolean)
    let current = root

    if (segments.length === 0) {
      current.urls.push(url)
      current.descendantUrls.push(url)
      continue
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!
      if (!current.children.has(seg)) {
        current.children.set(seg, {
          segment: seg,
          fullPath: "/" + segments.slice(0, i + 1).join("/"),
          children: new Map(),
          urls: [],
          descendantUrls: [],
        })
      }
      current = current.children.get(seg)!
    }
    current.urls.push(url)
  }

  // Build descendantUrls bottom-up
  function collectDescendants(node: TreeNode): string[] {
    const all = [...node.urls]
    for (const child of node.children.values()) {
      all.push(...collectDescendants(child))
    }
    node.descendantUrls = all
    return all
  }
  collectDescendants(root)

  return root
}

function buildSmartGroups(urls: string[]): SmartGroup[] {
  const pathnames = urls.map((u) => {
    try { return new URL(u).pathname.toLowerCase() } catch { return "" }
  })
  const depths = urls.map((u) => {
    try {
      return new URL(u).pathname.split("/").filter(Boolean).length
    } catch { return 0 }
  })

  const matchKeywords = (kws: string[]) => (p: string) =>
    kws.some((kw) => p.includes(kw))

  const groups: SmartGroup[] = [
    {
      id: "top-level",
      label: "Top-level pages",
      matchFn: (_p, depth) => depth <= 1,
      urls: urls.filter((_, i) => depths[i]! <= 1),
    },
    {
      id: "admissions",
      label: "Admissions",
      matchFn: (p) => matchKeywords(ADMISSIONS_KEYWORDS)(p),
      urls: urls.filter((_, i) => matchKeywords(ADMISSIONS_KEYWORDS)(pathnames[i]!)),
    },
    {
      id: "academics",
      label: "Academics & programs",
      matchFn: (p) => matchKeywords(ACADEMICS_KEYWORDS)(p),
      urls: urls.filter((_, i) => matchKeywords(ACADEMICS_KEYWORDS)(pathnames[i]!)),
    },
    {
      id: "news",
      label: "News & blog",
      matchFn: (p) => matchKeywords(NEWS_KEYWORDS)(p),
      urls: urls.filter((_, i) => matchKeywords(NEWS_KEYWORDS)(pathnames[i]!)),
    },
    {
      id: "about",
      label: "About & people",
      matchFn: (p) => matchKeywords(ABOUT_KEYWORDS)(p),
      urls: urls.filter((_, i) => matchKeywords(ABOUT_KEYWORDS)(pathnames[i]!)),
    },
    {
      id: "events",
      label: "Events",
      matchFn: (p) => matchKeywords(EVENTS_KEYWORDS)(p),
      urls: urls.filter((_, i) => matchKeywords(EVENTS_KEYWORDS)(pathnames[i]!)),
    },
  ]

  // "Everything else": leaves not in any shown group
  const coveredByShown = new Set<string>()
  for (const g of groups) {
    if (g.urls.length >= SMART_GROUP_MIN_MATCH) {
      for (const u of g.urls) coveredByShown.add(u)
    }
  }
  const everythingElse = urls.filter((u) => !coveredByShown.has(u))
  if (everythingElse.length >= SMART_GROUP_MIN_MATCH) {
    groups.push({
      id: "other",
      label: "Everything else",
      matchFn: (p, d) => {
        // URL not matching any shown group
        for (const g of groups) {
          if (g.id !== "other" && g.urls.length >= SMART_GROUP_MIN_MATCH && g.matchFn(p, d)) return false
        }
        return true
      },
      urls: everythingElse,
    })
  }

  return groups.filter((g) => g.urls.length >= SMART_GROUP_MIN_MATCH)
}

function getCheckState(
  descendantUrls: string[],
  selected: Set<string>,
): "checked" | "unchecked" | "indeterminate" {
  if (descendantUrls.length === 0) return "unchecked"
  let hasSelected = false
  let hasUnselected = false
  for (const u of descendantUrls) {
    if (selected.has(u)) hasSelected = true
    else hasUnselected = true
    if (hasSelected && hasUnselected) return "indeterminate"
  }
  return hasSelected ? "checked" : "unchecked"
}

function formatTimeEstimate(n: number, vpMult: number): string {
  const minutes = Math.ceil(
    (n * vpMult * EST_SECONDS_PER_CAPTURE) / 60 / CAPTURE_CONCURRENCY_FOR_ESTIMATE,
  )
  if (minutes < 1) return "< 1 min"
  return `~${minutes} min`
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function vpLabel(vp: "desktop" | "mobile" | "both"): string {
  if (vp === "both") return "desktop + mobile"
  return vp
}

function vpMultiplier(vp: "desktop" | "mobile" | "both"): number {
  return vp === "both" ? 2 : 1
}

function latestCaptureAt(rec: Partial<Record<"desktop" | "mobile", CaptureHistoryEntry>>): number {
  return Math.max(
    rec.desktop ? Date.parse(rec.desktop.capturedAt) : 0,
    rec.mobile ? Date.parse(rec.mobile.capturedAt) : 0,
  )
}

// One capture through the API. Throws an Error carrying status/retryable so the
// pools can decide whether to back off. Reads the library headers the server
// sets so each row can say whether the screenshot was saved.
async function captureViaApi(
  url: string,
  viewport: "desktop" | "mobile",
  signal?: AbortSignal,
): Promise<{ blob: Blob; stored: boolean; captureId?: string }> {
  const headers = await addCsrfHeader({ "Content-Type": "application/json" })
  const resp = await fetch("/api/screenshot", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ url, viewport }),
    signal,
  })
  if (!resp.ok) {
    let msg = `Capture failed (${resp.status})`
    let retryable = false
    try {
      const j = (await resp.json()) as { error?: string; retryable?: boolean }
      if (j?.error) msg = j.error
      if (j?.retryable) retryable = true
    } catch { /* skip */ }
    const err = new Error(msg) as Error & { status?: number; retryable?: boolean }
    err.status = resp.status
    err.retryable = retryable
    throw err
  }
  const blob = await resp.blob()
  const stored = resp.headers.get("X-Capture-Stored") === "true"
  const captureId = resp.headers.get("X-Capture-Id") ?? undefined
  return { blob, stored, captureId }
}

// ─── TriStateCheckbox ───────────────────────────────────────────────────────

function TriStateCheckbox({
  state,
  onClick,
  className = "",
}: {
  state: "checked" | "unchecked" | "indeterminate"
  onClick: () => void
  className?: string
}) {
  const base =
    "w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors cursor-pointer"
  if (state === "checked") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} bg-blue-500 border-blue-500 text-white ${className}`}
        aria-checked="true"
        role="checkbox"
      >
        <Check size={10} strokeWidth={3} />
      </button>
    )
  }
  if (state === "indeterminate") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} bg-blue-500 border-blue-500 text-white ${className}`}
        aria-checked="mixed"
        role="checkbox"
      >
        <Minus size={10} strokeWidth={3} />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 ${className}`}
      aria-checked="false"
      role="checkbox"
    />
  )
}

// ─── TreeRow (recursive) ────────────────────────────────────────────────────

function TreeRow({
  node,
  selected,
  onToggle,
  expanded,
  onExpand,
  depth,
  searchFilter,
  matchingUrls,
  testingUrl,
  testResult,
  onTest,
  onCancelTest,
  history,
  viewportChoice,
}: {
  node: TreeNode
  selected: Set<string>
  onToggle: (urls: string[]) => void
  expanded: Set<string>
  onExpand: (path: string) => void
  depth: number
  searchFilter: string
  matchingUrls: Set<string> | null
  testingUrl: string | null
  testResult: { url: string; blob: Blob; objectUrl: string } | null
  onTest: (url: string) => void
  onCancelTest: () => void
  history: HistoryIndex | null
  viewportChoice: ViewportChoice
}) {
  const isFolder = node.children.size > 0
  const isExpanded = expanded.has(node.fullPath)
  const checkState = getCheckState(node.descendantUrls, selected)
  const isLeaf = !isFolder && node.urls.length > 0
  const capturedCount = history
    ? node.descendantUrls.reduce((n, u) => (isCaptured(history, u, viewportChoice) ? n + 1 : n), 0)
    : 0
  const leafRecord = isLeaf && history ? history.get(normalizeUrlKey(node.urls[0]!)) : undefined
  const leafCapturedAt = leafRecord ? latestCaptureAt(leafRecord) : 0

  const sortedChildren = useMemo(
    () =>
      [...node.children.values()].sort((a, b) => {
        const aIsFolder = a.children.size > 0
        const bIsFolder = b.children.size > 0
        if (aIsFolder && !bIsFolder) return -1
        if (!aIsFolder && bIsFolder) return 1
        return a.segment.localeCompare(b.segment)
      }),
    [node.children],
  )

  // Visibility: hide if searching and no descendant matches
  const isVisible =
    !matchingUrls ||
    node.descendantUrls.some((u) => matchingUrls.has(u))

  if (!isVisible) return null

  const handleToggle = () => {
    onToggle(node.descendantUrls)
  }

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === " ") {
      e.preventDefault()
      handleToggle()
    } else if (e.key === "Enter" && isFolder) {
      e.preventDefault()
      onExpand(node.fullPath)
    } else if (e.key === "ArrowRight" && isFolder && !isExpanded) {
      e.preventDefault()
      onExpand(node.fullPath)
    } else if (e.key === "ArrowLeft" && isFolder && isExpanded) {
      e.preventDefault()
      onExpand(node.fullPath)
    }
  }

  return (
    <div role="treeitem" aria-level={depth} aria-expanded={isFolder ? isExpanded : undefined} aria-checked={checkState === "checked" ? "true" : checkState === "indeterminate" ? "mixed" : "false"}>
      <div
        className="group flex items-center gap-1.5 py-0.5 pr-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={isFolder ? () => onExpand(node.fullPath) : undefined}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {isFolder ? (
          <ChevronRight
            size={12}
            className={`text-slate-500 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <TriStateCheckbox
          state={checkState}
          onClick={handleToggle}
        />
        <span className="text-[12px] text-slate-600 dark:text-slate-300 truncate">
          {node.segment || "/"}
        </span>
        {isFolder && (
          <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1">
            ({node.descendantUrls.length}{capturedCount > 0 ? `, ${capturedCount} captured` : ""})
          </span>
        )}
        {leafRecord && leafCapturedAt > 0 && (
          <span
            className="ml-1 flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
            title={[leafRecord.desktop, leafRecord.mobile]
              .filter((e): e is CaptureHistoryEntry => !!e)
              .map((e) => `${e.viewport} ${timeAgo(Date.parse(e.capturedAt))}${e.capturedByName ? ` by ${e.capturedByName}` : ""}`)
              .join(" · ")}
          >
            captured {timeAgo(leafCapturedAt)}
            {leafRecord.desktop && leafRecord.mobile ? " D+M" : leafRecord.mobile ? " M" : " D"}
          </span>
        )}
        {isLeaf && node.urls.length === 1 && (
          <button
            type="button"
            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity px-1.5 py-0.5 rounded text-[10px] font-medium text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-0.5"
            onClick={(e) => {
              e.stopPropagation()
              onTest(node.urls[0]!)
            }}
            disabled={testingUrl !== null && TEST_CAPTURE_DISABLED_WHILE_RUNNING}
          >
            <Eye size={10} />
            Test
          </button>
        )}
      </div>

      {/* Inline test result */}
      {isLeaf && testResult && node.urls.includes(testResult.url) && (
        <div className="ml-12 mr-2 my-1 relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50" style={{ maxHeight: 200 }}>
          <img
            src={testResult.objectUrl}
            alt={`Preview of ${testResult.url}`}
            className="w-full object-cover"
            style={{ maxHeight: 200 }}
          />
          <button
            type="button"
            onClick={onCancelTest}
            className="absolute top-1 right-1 w-5 h-5 rounded bg-slate-900/60 text-white flex items-center justify-center hover:bg-slate-900/80"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {isExpanded &&
        sortedChildren.map((child) => (
          <TreeRow
            key={child.fullPath}
            node={child}
            selected={selected}
            onToggle={onToggle}
            expanded={expanded}
            onExpand={onExpand}
            depth={depth + 1}
            searchFilter={searchFilter}
            matchingUrls={matchingUrls}
            testingUrl={testingUrl}
            testResult={testResult}
            onTest={onTest}
            onCancelTest={onCancelTest}
            history={history}
            viewportChoice={viewportChoice}
          />
        ))}
    </div>
  )
}

// ─── Main Modal Component ───────────────────────────────────────────────────

interface SitemapCaptureModalProps {
  open: boolean
  onClose: () => void
  addFiles: (files: File[]) => void
}

export function SitemapCaptureModal({ open, onClose, addFiles }: SitemapCaptureModalProps) {
  // ─── State ──────────────────────────────────────────────────────────
  const [modalState, setModalState] = useState<ModalState>("discover")
  const [domainInput, setDomainInput] = useState("")
  const [discoveredUrls, setDiscoveredUrls] = useState<string[]>([])
  const [discoverSource, setDiscoverSource] = useState<"sitemap" | "robots" | "fallback">("sitemap")
  const [discoverStatus, setDiscoverStatus] = useState("")
  const [discoverTicker, setDiscoverTicker] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [captureViewport, setCaptureViewport] = useState<"desktop" | "mobile" | "both">("desktop")
  const [captureRunning, setCaptureRunning] = useState(false)
  const [captureRows, setCaptureRows] = useState<CaptureRow[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [hiddenSubdomainCount, setHiddenSubdomainCount] = useState(0)
  const [resumeSession, setResumeSession] = useState<CaptureSession | null>(null)
  const [testingUrl, setTestingUrl] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    url: string
    blob: Blob
    objectUrl: string
  } | null>(null)

  // Manual paste state (inside <details> disclosure)
  const [captureUrlsText, setCaptureUrlsText] = useState("")

  // Screenshot library: what the team already captured on this domain
  const [history, setHistory] = useState<{
    domain: string
    index: HistoryIndex
    entries: CaptureHistoryEntry[]
    totalCaptures: number
    lastCapturedAt: string | null
  } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [includeCaptured, setIncludeCaptured] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  const eventSourceRef = useRef<EventSource | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nextRowIdRef = useRef(1)

  // ─── Derived ────────────────────────────────────────────────────────

  const inputHostname = useMemo(() => {
    try {
      const origin = extractOrigin(domainInput)
      return normalizeHostname(new URL(origin).hostname)
    } catch {
      return ""
    }
  }, [domainInput])

  const { filteredUrls, subdomainCount: computedSubdomainCount } = useMemo(() => {
    if (!inputHostname || discoveredUrls.length === 0) return { filteredUrls: [] as string[], subdomainCount: 0 }
    const filtered: string[] = []
    let sdc = 0
    for (const u of dedupeUrls(discoveredUrls)) {
      try {
        const h = normalizeHostname(new URL(u).hostname)
        if (h === inputHostname) {
          filtered.push(u)
        } else {
          sdc++
        }
      } catch {
        sdc++
      }
    }
    return { filteredUrls: filtered, subdomainCount: sdc }
  }, [discoveredUrls, inputHostname])

  // Sync subdomain count to state for persistence
  useEffect(() => {
    setHiddenSubdomainCount(computedSubdomainCount)
  }, [computedSubdomainCount])

  const tree = useMemo(
    () => (filteredUrls.length > 0 ? buildTree(filteredUrls, extractOrigin(domainInput)) : null),
    [filteredUrls, domainInput],
  )

  const smartGroups = useMemo(() => buildSmartGroups(filteredUrls), [filteredUrls])

  const matchingUrls = useMemo<Set<string> | null>(() => {
    if (!debouncedSearch) return null
    const q = debouncedSearch.toLowerCase()
    const matches = new Set<string>()
    for (const u of filteredUrls) {
      try {
        if (new URL(u).pathname.toLowerCase().includes(q)) matches.add(u)
      } catch { /* skip */ }
    }
    return matches
  }, [debouncedSearch, filteredUrls])

  const selectedCount = selected.size
  const vpMult = vpMultiplier(captureViewport)
  const totalCaptures = selectedCount * vpMult
  const failedRows = captureRows.filter((r) => r.status === "error")
  const doneRows = captureRows.filter((r) => r.status === "done")
  const unsavedDoneCount = doneRows.filter((r) => r.stored === false).length

  // Run cap and library-aware counts
  const runPlan = useMemo(() => planRun([...selected], captureViewport), [selected, captureViewport])
  const selectedAlreadyCaptured = useMemo(
    () => (history ? [...selected].filter((u) => isCaptured(history.index, u, captureViewport)).length : 0),
    [selected, history, captureViewport],
  )
  const capturedOnDomain = useMemo(
    () => (history ? filteredUrls.filter((u) => isCaptured(history.index, u, captureViewport)).length : 0),
    [filteredUrls, history, captureViewport],
  )
  const manualPlan = useMemo(
    () =>
      planRun(
        captureUrlsText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => (/^https?:\/\//i.test(l) ? l : `https://${l}`)),
        captureViewport,
      ),
    [captureUrlsText, captureViewport],
  )

  // ─── Lifecycle ──────────────────────────────────────────────────────

  // Pre-fill from last-used domain on mount
  useEffect(() => {
    if (!open) return
    const last = localStorage.getItem(LAST_DOMAIN_KEY)
    if (last && !domainInput) {
      setDomainInput(last)
      // Check for resumable session
      loadCaptureSession(normalizeHostname(last.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))).then(
        (session) => {
          if (session && hasUnfinishedWork(session)) {
            setResumeSession(session)
          }
        },
      )
    }
  }, [open])

  // Search debounce
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS)
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  // Auto-expand ancestors of search matches
  useEffect(() => {
    if (!matchingUrls || !tree) return
    const toExpand = new Set(expanded)
    for (const u of matchingUrls) {
      try {
        const pathname = new URL(u).pathname
        const segments = pathname.split("/").filter(Boolean)
        for (let i = 1; i < segments.length; i++) {
          toExpand.add("/" + segments.slice(0, i).join("/"))
        }
      } catch { /* skip */ }
    }
    if (toExpand.size !== expanded.size) setExpanded(toExpand)
  }, [matchingUrls, tree])

  // Cleanup on unmount or close
  useEffect(() => {
    if (!open) {
      // Revoke all object URLs
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
      objectUrlsRef.current.clear()
      // Close EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      // Abort in-flight captures
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      if (testResult) {
        URL.revokeObjectURL(testResult.objectUrl)
        setTestResult(null)
      }
    }
  }, [open])

  // Persist capture session on state changes (debounced)
  useEffect(() => {
    if (modalState !== "tree" && modalState !== "capturing") return
    if (!inputHostname) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const session: CaptureSession = {
        domain: inputHostname,
        discoveredUrls: filteredUrls,
        selectedUrls: [...selected],
        viewport: captureViewport,
        captureRows: captureRows.map(({ thumbBlob, ...rest }) => rest),
        lastUpdated: Date.now(),
      }
      saveCaptureSession(inputHostname, session)
    }, SAVE_DEBOUNCE_MS)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [modalState, filteredUrls, selected, captureViewport, captureRows, inputHostname])

  // ─── Screenshot library ─────────────────────────────────────────────

  const loadHistory = useCallback(async (domain: string) => {
    if (!domain) return
    setHistoryLoading(true)
    try {
      const resp = await fetch(`/api/screenshot/history?domain=${encodeURIComponent(domain)}`, {
        credentials: "include",
      })
      if (!resp.ok) throw new Error(`History failed (${resp.status})`)
      const data = (await resp.json()) as {
        domain: string
        captures: CaptureHistoryEntry[]
        totalCaptures: number
        lastCapturedAt: string | null
      }
      setHistory({
        domain,
        index: indexHistory(data.captures),
        entries: [...data.captures].sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt)),
        totalCaptures: data.totalCaptures,
        lastCapturedAt: data.lastCapturedAt,
      })
    } catch {
      // Keep whatever we had for this domain; otherwise mark it loaded-empty
      // so the tree still works and the effect below does not loop.
      setHistory((prev) =>
        prev && prev.domain === domain
          ? prev
          : { domain, index: new Map(), entries: [], totalCaptures: 0, lastCapturedAt: null },
      )
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  // Load when a domain's tree opens.
  useEffect(() => {
    if (modalState !== "tree" && modalState !== "capturing") return
    if (!inputHostname) return
    if (history?.domain === inputHostname) return
    loadHistory(inputHostname)
  }, [modalState, inputHostname, history?.domain, loadHistory])

  // Refresh when a batch finishes so "Capture more" sees what just landed.
  const wasRunningRef = useRef(false)
  useEffect(() => {
    if (wasRunningRef.current && !captureRunning && inputHostname) loadHistory(inputHostname)
    wasRunningRef.current = captureRunning
  }, [captureRunning, inputHostname, loadHistory])

  // ─── Helpers ────────────────────────────────────────────────────────

  function hasUnfinishedWork(session: CaptureSession): boolean {
    return session.captureRows.some((r) => r.status === "queued" || r.status === "capturing" || r.status === "error")
  }

  function trackObjectUrl(url: string): string {
    objectUrlsRef.current.add(url)
    return url
  }

  // ─── Discovery ─────────────────────────────────────────────────────

  const startDiscovery = useCallback(() => {
    const origin = extractOrigin(domainInput)
    if (!origin) return

    // Save last-used domain
    try {
      const hostname = new URL(origin).hostname
      localStorage.setItem(LAST_DOMAIN_KEY, hostname)
    } catch { /* skip */ }

    // Cancel any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setDiscoveredUrls([])
    setDiscoverStatus("Reading sitemap…")
    setDiscoverTicker([])
    setModalState("discovering")
    setResumeSession(null)

    const es = new EventSource(`/api/scanner/sitemap-stream?url=${encodeURIComponent(origin)}`)
    eventSourceRef.current = es

    const urlAccumulator: string[] = []

    es.addEventListener("discovered", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEDiscoveredData
        if (data.url) {
          urlAccumulator.push(data.url)
          setDiscoveredUrls([...urlAccumulator])
          setDiscoverTicker((prev) => [data.url!, ...prev].slice(0, 5))
          setDiscoverStatus(`Reading sitemap… Found ${urlAccumulator.length} pages`)
        }
      } catch { /* malformed SSE data */ }
    })

    es.addEventListener("status", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEStatusData
        if (data.message) {
          setDiscoverStatus(
            urlAccumulator.length > 0
              ? `${data.message} (${urlAccumulator.length} pages found)`
              : data.message,
          )
        }
      } catch { /* malformed SSE data */ }
    })

    es.addEventListener("done", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEDoneData
        setDiscoverSource(data.source ?? "sitemap")
        es.close()
        eventSourceRef.current = null

        if (data.source === "fallback" || urlAccumulator.length === 0) {
          // No sitemap found — show manual paste with message
          setModalState("discover")
          setDiscoverStatus("")
          // Auto-open details and pre-fill
          setCaptureUrlsText(origin)
          // We'll show a toast-like banner in the discover state
          setDiscoverSource("fallback")
        } else {
          setModalState("tree")
        }
      } catch { /* malformed SSE data */ }
    })

    es.addEventListener("error", () => {
      // SSE connection error — preserve any URLs found
      es.close()
      eventSourceRef.current = null
      if (urlAccumulator.length > 0) {
        setModalState("tree")
      } else {
        setModalState("discover")
        setDiscoverStatus("")
      }
    })
  }, [domainInput])

  const cancelDiscovery = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    if (discoveredUrls.length > 0) {
      setModalState("tree")
    } else {
      setModalState("discover")
      setDiscoverStatus("")
    }
  }, [discoveredUrls])

  const useWhatWeHave = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setModalState("tree")
  }, [])

  // ─── Resume ─────────────────────────────────────────────────────────

  const resumeFromSession = useCallback((session: CaptureSession) => {
    setDomainInput(session.domain)
    setDiscoveredUrls(session.discoveredUrls)
    setSelected(new Set(session.selectedUrls))
    setCaptureViewport(session.viewport)
    setCaptureRows(session.captureRows.map((r) => ({ ...r, thumbBlob: undefined })))
    setResumeSession(null)

    const hasCaptures = session.captureRows.length > 0
    if (hasCaptures) {
      setModalState("capturing")
      // If there are queued/error rows, the user can retry
      const stillRunning = session.captureRows.some((r) => r.status === "capturing")
      setCaptureRunning(stillRunning)
    } else {
      setModalState("tree")
    }
  }, [])

  const startFresh = useCallback(() => {
    if (resumeSession) {
      deleteCaptureSession(resumeSession.domain)
    }
    setResumeSession(null)
  }, [resumeSession])

  // ─── Selection ──────────────────────────────────────────────────────

  // Filling a folder or group skips pages already in the library for the chosen
  // viewport unless "include already captured" is on. A single page (an
  // explicit click) is never skipped, and a set that is entirely captured
  // fills in full, since clicking it can only mean "I want these anyway".
  const eligibleForFill = useCallback(
    (urls: string[]) => {
      if (urls.length <= 1 || includeCaptured || !history) return urls
      const eligible = filterUncaptured(urls, history.index, captureViewport)
      return eligible.length > 0 ? eligible : urls
    },
    [includeCaptured, history, captureViewport],
  )

  const toggleUrls = useCallback((urls: string[]) => {
    const fill = eligibleForFill(urls)
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = fill.every((u) => next.has(u))
      if (allSelected) {
        for (const u of urls) next.delete(u)
      } else {
        for (const u of fill) next.add(u)
      }
      return next
    })
  }, [eligibleForFill])

  const toggleExpanded = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  // Click semantics match the tree: full → clear, otherwise → fill.
  // An indeterminate group fills (the user's intuition is "make it whole"),
  // not clears — clearing is reserved for a fully-checked group.
  const toggleSmartGroup = useCallback((group: SmartGroup) => {
    const fill = eligibleForFill(group.urls)
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = fill.every((u) => next.has(u))
      if (allSelected) {
        for (const u of group.urls) next.delete(u)
      } else {
        for (const u of fill) next.add(u)
      }
      return next
    })
  }, [eligibleForFill])

  const selectAllVisible = useCallback(() => {
    if (!matchingUrls) return
    const fill = eligibleForFill([...matchingUrls])
    setSelected((prev) => {
      const next = new Set(prev)
      for (const u of fill) next.add(u)
      return next
    })
  }, [matchingUrls, eligibleForFill])

  // clearSelection is available through "Start over" which resets all state

  // ─── Test capture ──────────────────────────────────────────────────

  const runTestCapture = useCallback(
    async (url: string) => {
      if (testingUrl) return
      // Clean up previous test result
      if (testResult) {
        URL.revokeObjectURL(testResult.objectUrl)
        setTestResult(null)
      }
      setTestingUrl(url)
      try {
        const headers = await addCsrfHeader({ "Content-Type": "application/json" })
        const resp = await fetch("/api/screenshot", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify({ url, viewport: "desktop" }),
        })
        if (!resp.ok) throw new Error(`Capture failed (${resp.status})`)
        const blob = await resp.blob()
        const objectUrl = trackObjectUrl(URL.createObjectURL(blob))
        setTestResult({ url, blob, objectUrl })
      } catch { /* test failed silently */ } finally {
        setTestingUrl(null)
      }
    },
    [testingUrl, testResult],
  )

  const cancelTestResult = useCallback(() => {
    if (testResult) {
      URL.revokeObjectURL(testResult.objectUrl)
      objectUrlsRef.current.delete(testResult.objectUrl)
    }
    setTestResult(null)
  }, [testResult])

  // ─── Capture ───────────────────────────────────────────────────────

  const executeCapture = useCallback((urls: string[]) => {
    if (urls.length === 0) return

    const viewports: ("desktop" | "mobile")[] =
      captureViewport === "both" ? ["desktop", "mobile"] : [captureViewport]

    let rowId = nextRowIdRef.current
    const newRows: CaptureRow[] = urls.flatMap((u) =>
      viewports.map((vp) => ({
        id: rowId++,
        url: u,
        viewport: vp,
        status: "queued" as const,
      })),
    )
    nextRowIdRef.current = rowId

    setCaptureRows(newRows)
    setCaptureRunning(true)
    setModalState("capturing")

    const controller = new AbortController()
    abortControllerRef.current = controller

    const updateRow = (id: number, patch: Partial<CaptureRow>) => {
      setCaptureRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    }

    const queue = [...newRows]

    const runOne = async (row: CaptureRow, signal: AbortSignal) => {
      updateRow(row.id, { status: "capturing" })

      let lastError: Error | null = null
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (signal.aborted) {
          updateRow(row.id, { status: "cancelled" })
          return
        }
        try {
          const { blob, stored, captureId } = await captureViaApi(row.url, row.viewport, signal)
          const thumbBlob = blob

          const host = (() => {
            try { return new URL(row.url).hostname.replace(/^www\./, "") } catch { return "page" }
          })()
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
          const suffix = row.viewport === "mobile" ? "-mobile" : ""
          const file = new File([blob], `${host}${suffix}-${ts}.png`, { type: "image/png" })
          addFiles([file])
          updateRow(row.id, { status: "done", thumbBlob, stored, captureId })
          return
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") {
            updateRow(row.id, { status: "cancelled" })
            return
          }
          lastError = err instanceof Error ? err : new Error(String(err))
          const errAny = err as Error & { status?: number; retryable?: boolean }
          const isNetworkError = err instanceof TypeError && /fetch/i.test((err as TypeError).message)
          const isGatewayTimeout = lastError.message.includes("504")
          const isRateLimit = errAny.status === 429 || errAny.retryable === true
          const shouldRetry = isNetworkError || isGatewayTimeout || isRateLimit
          if (shouldRetry && attempt < MAX_RETRIES - 1) {
            const baseDelay = isRateLimit ? 3000 : 1500
            await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)))
            continue
          }
          break
        }
      }
      updateRow(row.id, { status: "error", error: lastError?.message ?? "Capture failed" })
    }

    const runPool = async () => {
      const workers: Promise<void>[] = []
      for (let i = 0; i < Math.min(CAPTURE_CONCURRENCY, queue.length); i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, CAPTURE_STAGGER_MS))
        workers.push(
          (async function worker() {
            while (queue.length > 0) {
              if (controller.signal.aborted) return
              const row = queue.shift()
              if (!row) return
              await runOne(row, controller.signal)
              if (queue.length > 0) await new Promise((r) => setTimeout(r, CAPTURE_STAGGER_MS))
            }
          })(),
        )
      }
      await Promise.all(workers)
      setCaptureRunning(false)
    }

    runPool()
  }, [captureViewport, addFiles])

  // Hard cap: a selection over MAX_PAGES_PER_RUN never starts. The footer
  // shows the count and the button is disabled, so this is a last guard.
  const startCapture = useCallback(() => {
    if (!runPlan.ok) return
    executeCapture(runPlan.pages)
  }, [runPlan, executeCapture])

  const stopCapture = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setCaptureRunning(false)
    // Mark queued rows as cancelled
    setCaptureRows((prev) =>
      prev.map((r) => (r.status === "queued" || r.status === "capturing" ? { ...r, status: "cancelled" as const } : r)),
    )
  }, [])

  const retryFailed = useCallback(() => {
    const failed = captureRows.filter((r) => r.status === "error")
    if (failed.length === 0) return

    const controller = new AbortController()
    abortControllerRef.current = controller
    setCaptureRunning(true)

    const updateRow = (id: number, patch: Partial<CaptureRow>) => {
      setCaptureRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    }

    // Reset failed rows to queued
    for (const row of failed) {
      updateRow(row.id, { status: "queued", error: undefined })
    }

    const queue = [...failed.map((r) => ({ ...r, status: "queued" as const }))]

    const runOne = async (row: CaptureRow, signal: AbortSignal) => {
      updateRow(row.id, { status: "capturing" })
      let lastError: Error | null = null
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (signal.aborted) {
          updateRow(row.id, { status: "cancelled" })
          return
        }
        try {
          const { blob, stored, captureId } = await captureViaApi(row.url, row.viewport, signal)
          const host = (() => {
            try { return new URL(row.url).hostname.replace(/^www\./, "") } catch { return "page" }
          })()
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
          const suffix = row.viewport === "mobile" ? "-mobile" : ""
          const file = new File([blob], `${host}${suffix}-${ts}.png`, { type: "image/png" })
          addFiles([file])
          updateRow(row.id, { status: "done", thumbBlob: blob, stored, captureId })
          return
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") {
            updateRow(row.id, { status: "cancelled" })
            return
          }
          lastError = err instanceof Error ? err : new Error(String(err))
          const errAny = err as Error & { status?: number; retryable?: boolean }
          const isNetworkError = err instanceof TypeError && /fetch/i.test((err as TypeError).message)
          const isGatewayTimeout = lastError.message.includes("504")
          const isRateLimit = errAny.status === 429 || errAny.retryable === true
          const shouldRetry = isNetworkError || isGatewayTimeout || isRateLimit
          if (shouldRetry && attempt < MAX_RETRIES - 1) {
            const baseDelay = isRateLimit ? 3000 : 1500
            await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)))
            continue
          }
          break
        }
      }
      updateRow(row.id, { status: "error", error: lastError?.message ?? "Capture failed" })
    }

    const runPool = async () => {
      const workers: Promise<void>[] = []
      for (let i = 0; i < Math.min(CAPTURE_CONCURRENCY, queue.length); i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, CAPTURE_STAGGER_MS))
        workers.push(
          (async function worker() {
            while (queue.length > 0) {
              if (controller.signal.aborted) return
              const row = queue.shift()
              if (!row) return
              await runOne(row, controller.signal)
              if (queue.length > 0) await new Promise((r) => setTimeout(r, CAPTURE_STAGGER_MS))
            }
          })(),
        )
      }
      await Promise.all(workers)
      setCaptureRunning(false)
    }

    runPool()
  }, [captureRows, addFiles])

  const retrySingle = useCallback(
    (rowId: number) => {
      const row = captureRows.find((r) => r.id === rowId)
      if (!row || row.status !== "error") return

      const controller = abortControllerRef.current ?? new AbortController()
      if (!abortControllerRef.current) abortControllerRef.current = controller

      const updateRow = (id: number, patch: Partial<CaptureRow>) => {
        setCaptureRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
      }

      updateRow(rowId, { status: "queued", error: undefined })

      const runOne = async () => {
        updateRow(rowId, { status: "capturing" })
        let lastError: Error | null = null
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (controller.signal.aborted) {
            updateRow(rowId, { status: "cancelled" })
            return
          }
          try {
            const { blob, stored, captureId } = await captureViaApi(row.url, row.viewport, controller.signal)
            const host = (() => {
              try { return new URL(row.url).hostname.replace(/^www\./, "") } catch { return "page" }
            })()
            const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
            const suffix = row.viewport === "mobile" ? "-mobile" : ""
            const file = new File([blob], `${host}${suffix}-${ts}.png`, { type: "image/png" })
            addFiles([file])
            updateRow(rowId, { status: "done", thumbBlob: blob, stored, captureId })
            return
          } catch (err: unknown) {
            if (err instanceof DOMException && err.name === "AbortError") {
              updateRow(rowId, { status: "cancelled" })
              return
            }
            lastError = err instanceof Error ? err : new Error(String(err))
            const errAny = err as Error & { status?: number; retryable?: boolean }
            const isNetworkError = err instanceof TypeError && /fetch/i.test((err as TypeError).message)
            const isGatewayTimeout = lastError.message.includes("504")
            const isRateLimit = errAny.status === 429 || errAny.retryable === true
            const shouldRetry = isNetworkError || isGatewayTimeout || isRateLimit
            if (shouldRetry && attempt < MAX_RETRIES - 1) {
              const baseDelay = isRateLimit ? 3000 : 1500
              await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)))
              continue
            }
            break
          }
        }
        updateRow(rowId, { status: "error", error: lastError?.message ?? "Capture failed" })
      }

      runOne()
    },
    [captureRows, addFiles],
  )

  // ─── Manual paste batch (existing behavior) ───────────────────────

  const captureBatchManual = useCallback(async () => {
    // Same hard cap as the tree path; the button is disabled when over it.
    if (!manualPlan.ok) return
    const normalized = manualPlan.pages

    const viewports: ("desktop" | "mobile")[] =
      captureViewport === "both" ? ["desktop", "mobile"] : [captureViewport]

    let rowId = nextRowIdRef.current
    const newRows: CaptureRow[] = normalized.flatMap((u) =>
      viewports.map((vp) => ({
        id: rowId++,
        url: u,
        viewport: vp,
        status: "queued" as const,
      })),
    )
    nextRowIdRef.current = rowId

    setCaptureRows(newRows)
    setCaptureRunning(true)
    setModalState("capturing")

    const controller = new AbortController()
    abortControllerRef.current = controller

    const updateRow = (id: number, patch: Partial<CaptureRow>) => {
      setCaptureRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    }

    const queue = [...newRows]

    const runOne = async (row: CaptureRow, signal: AbortSignal) => {
      updateRow(row.id, { status: "capturing" })
      let lastError: Error | null = null
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (signal.aborted) {
          updateRow(row.id, { status: "cancelled" })
          return
        }
        try {
          const { blob, stored, captureId } = await captureViaApi(row.url, row.viewport, signal)
          const host = (() => {
            try { return new URL(row.url).hostname.replace(/^www\./, "") } catch { return "page" }
          })()
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
          const suffix = row.viewport === "mobile" ? "-mobile" : ""
          const file = new File([blob], `${host}${suffix}-${ts}.png`, { type: "image/png" })
          addFiles([file])
          updateRow(row.id, { status: "done", thumbBlob: blob, stored, captureId })
          return
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") {
            updateRow(row.id, { status: "cancelled" })
            return
          }
          lastError = err instanceof Error ? err : new Error(String(err))
          const errAny = err as Error & { status?: number; retryable?: boolean }
          const isNetworkError = err instanceof TypeError && /fetch/i.test((err as TypeError).message)
          const isGatewayTimeout = lastError.message.includes("504")
          const isRateLimit = errAny.status === 429 || errAny.retryable === true
          const shouldRetry = isNetworkError || isGatewayTimeout || isRateLimit
          if (shouldRetry && attempt < MAX_RETRIES - 1) {
            const baseDelay = isRateLimit ? 3000 : 1500
            await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)))
            continue
          }
          break
        }
      }
      updateRow(row.id, { status: "error", error: lastError?.message ?? "Capture failed" })
    }

    const workers: Promise<void>[] = []
    for (let i = 0; i < Math.min(CAPTURE_CONCURRENCY, queue.length); i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, CAPTURE_STAGGER_MS))
      workers.push(
        (async function worker() {
          while (queue.length > 0) {
            if (controller.signal.aborted) return
            const row = queue.shift()
            if (!row) return
            await runOne(row, controller.signal)
            if (queue.length > 0) await new Promise((r) => setTimeout(r, CAPTURE_STAGGER_MS))
          }
        })(),
      )
    }
    await Promise.all(workers)
    setCaptureRunning(false)
  }, [manualPlan, captureViewport, addFiles])

  // ─── Close / navigation handlers ──────────────────────────────────

  const handleClose = useCallback(() => {
    if (captureRunning) return
    onClose()
  }, [captureRunning, onClose])

  // Reset back to the empty Discover state — clears everything that
  // belongs to the current discovery + capture run. Domain input is
  // preserved so the user can quickly re-discover the same site.
  const startOver = useCallback(() => {
    if (captureRunning) return
    setModalState("discover")
    setDiscoveredUrls([])
    setSelected(new Set())
    setSearchQuery("")
    setDiscoverSource("sitemap")
    setCaptureRows([])
  }, [captureRunning])

  // Return to the tree picker keeping discoveredUrls + selections so
  // the user can refine and run another batch. captureRows are cleared
  // because already-completed images are in the toolkit grid already.
  const backToTree = useCallback(() => {
    if (captureRunning) return
    setCaptureRows([])
    setModalState("tree")
  }, [captureRunning])

  // ─── Render ────────────────────────────────────────────────────────

  if (!open) return null

  // Build thumb URLs for completed rows — tracked for revocation on close
  const thumbUrls = new Map<number, string>()
  for (const row of captureRows) {
    if (row.thumbBlob && !thumbUrls.has(row.id)) {
      const url = URL.createObjectURL(row.thumbBlob)
      objectUrlsRef.current.add(url)
      thumbUrls.set(row.id, url)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm shadow-blue-500/20">
              <Globe size={16} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                Capture webpages
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                {modalState === "tree"
                  ? "Select pages to capture"
                  : modalState === "capturing"
                    ? "Capturing screenshots"
                    : "Enter a domain to discover pages from its sitemap"}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={captureRunning}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ─── State A: Discover ─────────────────────────────── */}
          {modalState === "discover" && (
            <>
              {/* Fallback banner when no sitemap was found */}
              {discoverSource === "fallback" && captureUrlsText && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[12px] text-amber-700 dark:text-amber-300">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>No sitemap found at {inputHostname} — paste URLs manually below.</span>
                </div>
              )}

              {/* Resume banner */}
              {resumeSession && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <p className="text-[12px] text-blue-700 dark:text-blue-300 mb-2">
                    You captured {resumeSession.captureRows.filter((r) => r.status === "done").length} of{" "}
                    {resumeSession.captureRows.length} pages on {resumeSession.domain}{" "}
                    {timeAgo(resumeSession.lastUpdated)} — Resume?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-7 text-[11px] bg-blue-500 hover:bg-blue-600 text-white"
                      onClick={() => resumeFromSession(resumeSession)}
                    >
                      Resume
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={startFresh}
                    >
                      Start fresh
                    </Button>
                  </div>
                </div>
              )}

              {/* Domain input */}
              <div>
                <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                  Website domain
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={domainInput}
                    onChange={(e) => {
                      setDomainInput(e.target.value)
                      setDiscoverSource("sitemap")
                    }}
                    placeholder="example.com"
                    className="flex-1 h-10 rounded-xl text-[13px]"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && domainInput.trim()) startDiscovery()
                    }}
                  />
                  <Button
                    onClick={startDiscovery}
                    disabled={!domainInput.trim()}
                    className="h-10 px-4 text-[13px] bg-gradient-to-br from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-500/20"
                  >
                    <Search size={13} className="mr-1.5" />
                    Discover
                  </Button>
                </div>
              </div>

              {/* Manual paste disclosure */}
              <details
                open={discoverSource === "fallback" && !!captureUrlsText}
              >
                <summary className="text-[12px] text-slate-500 dark:text-slate-400 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300 select-none">
                  Or paste URLs manually
                </summary>
                <div className="mt-3 space-y-3">
                  {/* Viewport toggle */}
                  <div>
                    <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                      Viewport
                    </Label>
                    <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      {(["desktop", "mobile", "both"] as const).map((vp) => (
                        <button
                          key={vp}
                          type="button"
                          onClick={() => setCaptureViewport(vp)}
                          className={`flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg text-[13px] font-medium transition-all
                            ${captureViewport === vp
                              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                            }`}
                        >
                          {vp === "mobile" ? (
                            <MonitorSmartphone size={14} className="rotate-90" />
                          ) : vp === "desktop" ? (
                            <MonitorSmartphone size={14} />
                          ) : null}
                          {vp === "both" ? "Both" : vp.charAt(0).toUpperCase() + vp.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
                      URLs <span className="lowercase">(one per line)</span>
                    </Label>
                    <textarea
                      value={captureUrlsText}
                      onChange={(e) => setCaptureUrlsText(e.target.value)}
                      rows={6}
                      placeholder={"https://example.com\nhttps://stamats.com\nhttps://coe.edu/admission"}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-[13px] font-mono text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p
                      className={`text-[11px] min-w-0 ${
                        !manualPlan.ok && manualPlan.reason === "over-cap"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {manualPlan.pages.length > 0 && (
                        <>
                          {manualPlan.pages.length} pages · limit {MAX_PAGES_PER_RUN} per run
                          {manualPlan.ok ? ` · ${manualPlan.captures} captures` : ", remove some to continue"}
                        </>
                      )}
                    </p>
                    <Button
                      onClick={captureBatchManual}
                      disabled={!manualPlan.ok}
                      className="h-9 px-4 text-[13px] bg-gradient-to-br from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-500/20"
                    >
                      <ImageDown size={13} className="mr-1.5" />
                      Capture all
                    </Button>
                  </div>
                </div>
              </details>
            </>
          )}

          {/* ─── State A.5: Discovering ───────────────────────── */}
          {modalState === "discovering" && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Loader2 size={14} className="text-blue-500 animate-spin flex-shrink-0" />
                  <span className="text-[13px] text-slate-600 dark:text-slate-300 truncate" aria-live="polite">
                    {discoverStatus}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] flex-shrink-0"
                  onClick={cancelDiscovery}
                >
                  Cancel
                </Button>
              </div>

              {discoverTicker.length > 0 && (
                <div className="space-y-0.5">
                  {discoverTicker.map((url, i) => (
                    <p
                      key={`${url}-${i}`}
                      className="text-[12px] font-mono text-slate-500 dark:text-slate-400 truncate"
                    >
                      {url}
                    </p>
                  ))}
                </div>
              )}

              {discoveredUrls.length >= 10 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[12px]"
                  onClick={useWhatWeHave}
                >
                  Use what we have ({discoveredUrls.length} pages)
                </Button>
              )}
            </>
          )}

          {/* ─── State B: Tree picker ─────────────────────────── */}
          {modalState === "tree" && (
            <>
              {/* Header strip */}
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  {inputHostname} · {filteredUrls.length} pages
                </p>
                <button
                  type="button"
                  className="text-[12px] text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                  onClick={startOver}
                >
                  Start over
                </button>
              </div>

              {hiddenSubdomainCount > 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Hid {hiddenSubdomainCount} pages on subdomains
                </p>
              )}

              {/* Library progress: what the team already captured on this domain */}
              {filteredUrls.length > 0 && (
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-1.5 min-w-0">
                      <History size={12} className="text-slate-500 flex-shrink-0" />
                      {historyLoading && !history ? (
                        <span>Checking the library…</span>
                      ) : history ? (
                        <span className="truncate">
                          {capturedOnDomain} of {filteredUrls.length} pages already captured for {vpLabel(captureViewport)}
                          {history.lastCapturedAt && ` · last ${timeAgo(Date.parse(history.lastCapturedAt))}`}
                          {history.entries[0]?.capturedByName && ` by ${history.entries[0].capturedByName}`}
                        </span>
                      ) : (
                        <span>Library unavailable</span>
                      )}
                    </p>
                    {history && history.entries.length > 0 && (
                      <button
                        type="button"
                        className="text-[11px] text-blue-500 hover:text-blue-600 flex-shrink-0"
                        onClick={() => setShowLibrary((v) => !v)}
                      >
                        {showLibrary ? "Hide library" : `Library (${history.totalCaptures})`}
                      </button>
                    )}
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeCaptured}
                      onChange={(e) => setIncludeCaptured(e.target.checked)}
                      className="h-3 w-3"
                    />
                    Include already captured pages when selecting folders and groups
                  </label>
                  {showLibrary && history && (
                    <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                      {history.entries.slice(0, 200).map((e) => (
                        <div key={e.id} className="flex items-center gap-2 text-[11px]">
                          <span className="text-[9px] uppercase tracking-wider font-semibold flex-shrink-0 px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                            {e.viewport === "mobile" ? "M" : "D"}
                          </span>
                          <span className="font-mono text-slate-600 dark:text-slate-300 truncate flex-1 min-w-0">{e.url}</span>
                          <span className="text-slate-500 flex-shrink-0">
                            {timeAgo(Date.parse(e.capturedAt))}
                            {e.capturedByName ? ` · ${e.capturedByName}` : ""}
                          </span>
                          <a
                            href={`/api/screenshot/captures/${e.id}/image`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-500 hover:text-blue-600 flex-shrink-0"
                            title="Open the stored screenshot"
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      ))}
                      {history.entries.length > 200 && (
                        <p className="text-[10px] text-slate-500">and {history.entries.length - 200} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Empty tree */}
              {filteredUrls.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-2">
                    No pages found on this domain.
                  </p>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400">
                    All discovered URLs were on subdomains. Try pasting URLs manually.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 h-8 text-[12px]"
                    onClick={() => {
                      setModalState("discover")
                      setDiscoverSource("fallback")
                      setCaptureUrlsText(extractOrigin(domainInput))
                    }}
                  >
                    Paste URLs manually
                  </Button>
                </div>
              )}

              {filteredUrls.length > 0 && (
                <>
                  {/* Search */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search pages..."
                      className="w-full h-9 pl-9 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[13px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      aria-controls="sitemap-tree"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600"
                        onClick={() => setSearchQuery("")}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Search actions */}
                  {matchingUrls && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-500">
                        {matchingUrls.size} matches
                      </span>
                      {matchingUrls.size > 0 && (
                        <>
                          <button
                            type="button"
                            className="text-blue-500 hover:text-blue-600"
                            onClick={selectAllVisible}
                          >
                            Select all visible
                          </button>
                          <span className="text-slate-300">|</span>
                        </>
                      )}
                      <button
                        type="button"
                        className="text-slate-500 hover:text-slate-600"
                        onClick={() => setSearchQuery("")}
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {matchingUrls && matchingUrls.size === 0 && (
                    <p className="text-[12px] text-slate-500 text-center py-4">
                      No pages match &quot;{debouncedSearch}&quot;
                    </p>
                  )}

                  {/* Smart groups */}
                  {smartGroups.length > 0 && !debouncedSearch && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Quick select
                      </p>
                      {smartGroups.map((group) => {
                        const groupCheckState = getCheckState(group.urls, selected)
                        return (
                          <div
                            key={group.id}
                            className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                            onClick={() => toggleSmartGroup(group)}
                          >
                            <TriStateCheckbox
                              state={groupCheckState}
                              onClick={() => toggleSmartGroup(group)}
                            />
                            <span className="text-[12px] text-slate-600 dark:text-slate-300 flex-1">
                              {group.label}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {group.urls.length}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Full tree */}
                  {tree && (matchingUrls === null || matchingUrls.size > 0) && (
                    <div
                      id="sitemap-tree"
                      role="tree"
                      className="max-h-72 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl p-2"
                    >
                      {[...tree.children.values()]
                        .sort((a, b) => {
                          const aF = a.children.size > 0
                          const bF = b.children.size > 0
                          if (aF && !bF) return -1
                          if (!aF && bF) return 1
                          return a.segment.localeCompare(b.segment)
                        })
                        .map((child) => (
                          <TreeRow
                            key={child.fullPath}
                            node={child}
                            selected={selected}
                            onToggle={toggleUrls}
                            expanded={expanded}
                            onExpand={toggleExpanded}
                            depth={0}
                            searchFilter={debouncedSearch}
                            matchingUrls={matchingUrls}
                            testingUrl={testingUrl}
                            testResult={testResult}
                            onTest={runTestCapture}
                            onCancelTest={cancelTestResult}
                            history={history?.index ?? null}
                            viewportChoice={captureViewport}
                          />
                        ))}
                      {/* Root-level URLs (pages at /) */}
                      {tree.urls.length > 0 && (
                        <div
                          className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                          onClick={() => toggleUrls(tree.urls)}
                        >
                          <span className="w-3 flex-shrink-0" />
                          <TriStateCheckbox
                            state={getCheckState(tree.urls, selected)}
                            onClick={() => toggleUrls(tree.urls)}
                          />
                          <span className="text-[12px] text-slate-600 dark:text-slate-300">/</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ─── State C: Capturing ───────────────────────────── */}
          {modalState === "capturing" && (
            <>
              {/* Header strip — domain + Start over link (mirrors tree state) */}
              {inputHostname && (
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    {inputHostname} · {doneRows.length} of {captureRows.length} captured
                  </p>
                  {!captureRunning && (
                    <button
                      type="button"
                      className="text-[12px] text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                      onClick={startOver}
                    >
                      Start over
                    </button>
                  )}
                </div>
              )}
              {captureRows.length > 0 && (
                <div className="space-y-1.5 max-h-80 overflow-y-auto">
                  {captureRows.map((row) => {
                    const thumbUrl = thumbUrls.get(row.id) ?? null
                    return (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                      >
                        {/* Inline thumbnail */}
                        {thumbUrl && (
                          <img
                            src={thumbUrl}
                            alt=""
                            className="w-[60px] h-[40px] rounded object-cover flex-shrink-0 border border-slate-200 dark:border-slate-700"
                          />
                        )}
                        <div className="w-4 h-4 flex-shrink-0">
                          {row.status === "queued" && (
                            <div className="w-2 h-2 mt-1 ml-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                          )}
                          {row.status === "capturing" && (
                            <Loader2 size={14} className="text-blue-500 animate-spin" />
                          )}
                          {row.status === "done" && (
                            <Check size={14} className="text-emerald-500" strokeWidth={3} />
                          )}
                          {row.status === "error" && (
                            <AlertCircle size={14} className="text-red-500" />
                          )}
                          {row.status === "cancelled" && (
                            <X size={14} className="text-slate-500" />
                          )}
                        </div>
                        <span className="text-[9px] uppercase tracking-wider font-semibold flex-shrink-0 px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                          {row.viewport === "mobile" ? "M" : "D"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-mono text-slate-600 dark:text-slate-300 truncate">
                            {row.url}
                          </p>
                          {row.status === "error" && row.error && (
                            <p className="text-[11px] text-red-500 dark:text-red-400 truncate">
                              {row.error}
                            </p>
                          )}
                        </div>
                        {row.status === "error" && !captureRunning && (
                          <button
                            type="button"
                            className="text-[10px] font-medium text-blue-500 hover:text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 flex items-center gap-0.5 flex-shrink-0"
                            onClick={() => retrySingle(row.id)}
                          >
                            <RotateCcw size={10} />
                            Retry
                          </button>
                        )}
                        {row.status === "done" && row.stored === false && (
                          <span
                            className="text-[10px] text-amber-600 dark:text-amber-400 flex-shrink-0"
                            title="The image is in the toolkit, but saving it to the library failed, so it will not show as captured next time"
                          >
                            not saved to library
                          </span>
                        )}
                        <span
                          className={`text-[10px] uppercase tracking-wider font-medium flex-shrink-0
                            ${row.status === "done"
                              ? "text-emerald-500"
                              : row.status === "error"
                                ? "text-red-500"
                                : row.status === "capturing"
                                  ? "text-blue-500"
                                  : row.status === "cancelled"
                                    ? "text-slate-500"
                                    : "text-slate-500"
                            }`}
                        >
                          {row.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
          {/* ─── Tree footer ──────────────────────────────────── */}
          {modalState === "tree" && (
            <>
              {/* Viewport toggle */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(["desktop", "mobile", "both"] as const).map((vp) => (
                    <button
                      key={vp}
                      type="button"
                      onClick={() => setCaptureViewport(vp)}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-all
                        ${captureViewport === vp
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-500 dark:text-slate-400"
                        }`}
                    >
                      {vp === "both" ? "Both" : vp.charAt(0).toUpperCase() + vp.slice(1)}
                    </button>
                  ))}
                </div>
                {selectedCount > 0 && (
                  <p
                    className={`text-[11px] truncate ${
                      !runPlan.ok ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {runPlan.ok ? (
                      <>
                        {runPlan.pages.length} pages · {totalCaptures} captures · {formatTimeEstimate(selectedCount, vpMult)} · {vpLabel(captureViewport)}
                        {selectedAlreadyCaptured > 0 && ` · ${selectedAlreadyCaptured} captured before`}
                      </>
                    ) : (
                      <>
                        {runPlan.pages.length} pages selected · limit is {MAX_PAGES_PER_RUN} per run, deselect{" "}
                        {runPlan.pages.length - MAX_PAGES_PER_RUN}
                      </>
                    )}
                  </p>
                )}
              </div>
              <Button
                onClick={startCapture}
                disabled={!runPlan.ok}
                className="h-9 px-4 text-[13px] bg-gradient-to-br from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-500/20"
              >
                <ImageDown size={13} className="mr-1.5" />
                Capture {selectedCount > 0 ? `${selectedCount} pages` : ""}
              </Button>
            </>
          )}

          {/* ─── Capturing footer ─────────────────────────────── */}
          {modalState === "capturing" && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {captureRunning ? (
                    <>
                      {doneRows.length} of {captureRows.length} done
                      {failedRows.length > 0 && ` · ${failedRows.length} failed`}
                      {" · "}
                      {formatTimeEstimate(
                        captureRows.filter((r) => r.status === "queued").length,
                        1,
                      )} remaining
                    </>
                  ) : (
                    <>
                      {doneRows.length} of {captureRows.length} done
                      {failedRows.length > 0 && ` · ${failedRows.length} failed`}
                      {unsavedDoneCount > 0 && ` · ${unsavedDoneCount} not saved to library`}
                    </>
                  )}
                </p>
                {/* Viewport toggle - locked during capture */}
                <div className={`flex gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg mt-1 ${captureRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                  {(["desktop", "mobile", "both"] as const).map((vp) => (
                    <button
                      key={vp}
                      type="button"
                      onClick={() => setCaptureViewport(vp)}
                      disabled={captureRunning}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-all
                        ${captureViewport === vp
                          ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                          : "text-slate-500 dark:text-slate-400"
                        } disabled:cursor-not-allowed`}
                    >
                      {vp === "both" ? "Both" : vp.charAt(0).toUpperCase() + vp.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                {captureRunning ? (
                  <Button
                    variant="outline"
                    className="h-9 text-[13px]"
                    onClick={stopCapture}
                  >
                    Stop
                  </Button>
                ) : (
                  <>
                    {failedRows.length > 0 && (
                      <Button
                        variant="outline"
                        className="h-9 text-[13px]"
                        onClick={retryFailed}
                      >
                        <RotateCcw size={12} className="mr-1" />
                        Retry {failedRows.length} failed
                      </Button>
                    )}
                    {discoveredUrls.length > 0 && (
                      <Button
                        variant="outline"
                        className="h-9 text-[13px]"
                        onClick={backToTree}
                      >
                        Capture more
                      </Button>
                    )}
                    <Button
                      className="h-9 text-[13px] bg-gradient-to-br from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm shadow-blue-500/20"
                      onClick={handleClose}
                    >
                      Done
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ─── Discover / Discovering footer ────────────────── */}
          {(modalState === "discover" || modalState === "discovering") && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Images stream into the toolkit as they finish and are saved to the team library · {MAX_PAGES_PER_RUN} pages per run
            </p>
          )}
        </div>
      </div>

    </div>
  )
}
