/**
 * Client portal: the only thing an invited client user can reach.
 * Header, two tabs (Toolkit, My Photos), sign out, and a help assistant
 * that knows nothing except how the toolkit works.
 */
import { useCallback, useMemo } from "react"
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom"
import { ImageDown, Image as ImagesIcon, LogOut } from "lucide-react"
import { PortalAuthProvider, portalFetch, usePortalAuth } from "@/contexts/PortalAuthContext"
import { ToolkitApiProvider, PORTAL_HEADERS, queueToolkitFiles, type ToolkitApi } from "@/lib/toolkitApi"
import { ImageConverter } from "@/pages/ImageConverter"
import { PortalHelpFab } from "./PortalHelpFab"
import { toast } from "@/hooks/useToast"

export interface PortalOutletContext {
  openInToolkit: (files: File[]) => void
}

export function PortalArea() {
  return (
    <PortalAuthProvider>
      <Outlet />
    </PortalAuthProvider>
  )
}

export function usePortalOutlet(): PortalOutletContext {
  return useOutletContext<PortalOutletContext>()
}

export function PortalToolkit() {
  return <ImageConverter />
}

export function PortalShell() {
  const { isLoading, isAuthenticated, user, client, logout } = usePortalAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const saveToLibrary = useCallback(async (file: File) => {
    const form = new FormData()
    form.append("file", file, file.name)
    form.append("filename", file.name)
    const res = await portalFetch("/images", { method: "POST", body: form })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`)
    toast.success(`Saved ${file.name} to My Photos`)
  }, [])

  const openInToolkit = useCallback((files: File[]) => {
    queueToolkitFiles(files)
    navigate("/portal")
  }, [navigate])

  const api = useMemo<ToolkitApi>(() => ({
    mode: "portal",
    aiBase: "/api/portal/ai",
    headers: async (init) => ({ ...(init ?? {}), ...PORTAL_HEADERS }),
    saveToLibrary,
  }), [saveToLibrary])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C41230] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/portal/login" replace state={{ from: location.pathname }} />

  const tab = "px-3 py-2 rounded-lg text-[13px] font-medium transition-colors"
  const active = "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
  const idle = "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"

  return (
    <ToolkitApiProvider value={api}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-4">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#C41230] flex items-center justify-center">
                <ImageDown size={16} className="text-white" strokeWidth={2.25} />
              </div>
              <div className="leading-tight min-w-0">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Stamats Image Toolkit</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{client?.name}</p>
              </div>
            </div>
            <nav className="flex items-center gap-1 ml-2">
              <NavLink to="/portal" end className={({ isActive }) => `${tab} ${isActive ? active : idle}`}>
                <span className="flex items-center gap-1.5"><ImageDown size={14} /> Toolkit</span>
              </NavLink>
              <NavLink to="/portal/photos" className={({ isActive }) => `${tab} ${isActive ? active : idle}`}>
                <span className="flex items-center gap-1.5"><ImagesIcon size={14} /> My Photos</span>
              </NavLink>
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden sm:block text-[12px] text-slate-500 dark:text-slate-400 truncate max-w-[220px]">{user?.name || user?.email}</span>
              <button
                type="button"
                onClick={async () => { await logout(); navigate("/portal/login", { replace: true }) }}
                className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 hover:text-[#C41230] dark:text-slate-300"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          </div>
        </header>
        <Outlet context={{ openInToolkit } satisfies PortalOutletContext} />
        <PortalHelpFab />
      </div>
    </ToolkitApiProvider>
  )
}
