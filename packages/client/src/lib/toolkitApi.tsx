/**
 * Where the Image Toolkit sends its server calls.
 *
 * Internal (default): /api/ai/* with the app's CSRF header, exactly as before.
 * Portal: /api/portal/ai/* with the portal request header. The portal shell
 * also uses this context to hand files into the toolkit ("Open in toolkit")
 * and to receive files from it ("Save to My Uploads").
 */
import { createContext, useContext, type ReactNode } from "react"
import { addCsrfHeader } from "@/lib/csrfToken"

export interface ToolkitApi {
  mode: "internal" | "portal"
  /** Base for alt-text / enhance endpoints, no trailing slash. */
  aiBase: string
  /** Headers for a mutating call (adds CSRF or the portal marker). */
  headers: (init?: Record<string, string>) => Promise<Record<string, string>>
  /** Files queued by the host to be added to the toolkit on mount. */
  pendingFiles: File[]
  clearPendingFiles: () => void
  /** Portal only: persist a file to the client's library. */
  saveToLibrary?: (file: File) => Promise<void>
}

const internalApi: ToolkitApi = {
  mode: "internal",
  aiBase: "/api/ai",
  headers: async (init) => (await addCsrfHeader(init ?? {})) as Record<string, string>,
  pendingFiles: [],
  clearPendingFiles: () => {},
}

const ToolkitApiContext = createContext<ToolkitApi>(internalApi)

export function ToolkitApiProvider({ value, children }: { value: ToolkitApi; children: ReactNode }) {
  return <ToolkitApiContext.Provider value={value}>{children}</ToolkitApiContext.Provider>
}

export function useToolkitApi(): ToolkitApi {
  return useContext(ToolkitApiContext)
}

export const PORTAL_HEADERS: Record<string, string> = { "x-portal-request": "1" }
