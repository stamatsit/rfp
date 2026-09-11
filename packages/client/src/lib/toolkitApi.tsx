/**
 * Where the Image Toolkit sends its server calls.
 *
 * Internal (default): /api/ai/* with the app's CSRF header, exactly as before.
 * Portal: /api/portal/ai/* with the portal request header, plus a way to
 * receive files from the toolkit ("Save to My Photos").
 *
 * Files handed INTO the toolkit ("Open in toolkit") go through a module-level
 * queue rather than React state: route transitions remount the shell, so
 * state there would be lost before the toolkit mounts.
 */
import { createContext, useContext, type ReactNode } from "react"
import { addCsrfHeader } from "@/lib/csrfToken"

export interface ToolkitApi {
  mode: "internal" | "portal"
  /** Base for alt-text / enhance endpoints, no trailing slash. */
  aiBase: string
  /** Headers for a mutating call (adds CSRF or the portal marker). */
  headers: (init?: Record<string, string>) => Promise<Record<string, string>>
  /** Portal only: persist a file to the client's library. */
  saveToLibrary?: (file: File) => Promise<void>
}

const internalApi: ToolkitApi = {
  mode: "internal",
  aiBase: "/api/ai",
  headers: async (init) => (await addCsrfHeader(init ?? {})) as Record<string, string>,
}

const ToolkitApiContext = createContext<ToolkitApi>(internalApi)

export function ToolkitApiProvider({ value, children }: { value: ToolkitApi; children: ReactNode }) {
  return <ToolkitApiContext.Provider value={value}>{children}</ToolkitApiContext.Provider>
}

export function useToolkitApi(): ToolkitApi {
  return useContext(ToolkitApiContext)
}

export const PORTAL_HEADERS: Record<string, string> = { "x-portal-request": "1" }

// ─── Hand-off queue (host -> toolkit) ───────────────────────

const QUEUE_EVENT = "toolkit-files-queued"
let queued: File[] = []

/** Queue files for the toolkit; it drains them once its session has restored. */
export function queueToolkitFiles(files: File[]) {
  queued = [...queued, ...files]
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT))
}

/** Take everything queued so far (the toolkit calls this). */
export function takeToolkitFiles(): File[] {
  const files = queued
  queued = []
  return files
}

export const TOOLKIT_QUEUE_EVENT = QUEUE_EVENT
