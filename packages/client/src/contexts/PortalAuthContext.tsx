/**
 * Auth state for client portal users. Entirely separate from AuthContext:
 * different endpoint, different cookie, different user table.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { PORTAL_HEADERS } from "@/lib/toolkitApi"

export interface PortalUser { id: string; email: string; name: string }
export interface PortalClient { id: string; name: string }

interface PortalAuthState {
  isLoading: boolean
  isAuthenticated: boolean
  user: PortalUser | null
  client: PortalClient | null
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<PortalAuthState | null>(null)

export async function portalFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) }
  if (init.method && init.method !== "GET") Object.assign(headers, PORTAL_HEADERS)
  return fetch(`/api/portal${path}`, { credentials: "include", ...init, headers })
}

export async function portalJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await portalFetch(path, init)
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<PortalUser | null>(null)
  const [client, setClient] = useState<PortalClient | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await portalJson<{ authenticated: boolean; user?: PortalUser; client?: PortalClient }>("/auth/me")
      setUser(data.authenticated && data.user ? data.user : null)
      setClient(data.authenticated && data.client ? data.client : null)
    } catch {
      setUser(null); setClient(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    await portalJson("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try { await portalJson("/auth/logout", { method: "POST" }) } catch { /* cookie may already be gone */ }
    setUser(null); setClient(null)
  }, [])

  return (
    <Ctx.Provider value={{ isLoading, isAuthenticated: !!user, user, client, refresh, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePortalAuth(): PortalAuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error("usePortalAuth must be used within PortalAuthProvider")
  return v
}
