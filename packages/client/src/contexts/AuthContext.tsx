import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { accountApi } from "@/lib/api"
import { clearCsrfToken } from "@/lib/csrfToken"

export interface User {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  hasCompletedTour: boolean
}

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  mustChangePassword: boolean
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  setAuthenticated: (value: boolean) => void
  refreshUser: () => Promise<void>
  markTourCompleted: () => Promise<void>
  resetTour: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Alias for external use
  const setAuthenticated = setIsAuthenticated

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", {
        credentials: "include",
      })
      const data = await response.json()
      setIsAuthenticated(data.authenticated === true)
      setUser(data.user || null)
      setMustChangePassword(data.mustChangePassword || false)

      if (!data.authenticated && location.pathname !== "/login") {
        navigate("/login", { replace: true })
      } else if (data.authenticated && data.mustChangePassword && location.pathname !== "/change-password") {
        navigate("/change-password", { replace: true })
      }
    } catch (error) {
      setIsAuthenticated(false)
      setUser(null)
      setMustChangePassword(false)
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true })
      }
    } finally {
      setIsLoading(false)
    }
  }

  const refreshUser = async () => {
    try {
      const response = await fetch("/api/auth/status", { credentials: "include" })
      const data = await response.json()
      if (data.authenticated && data.user) {
        setUser(data.user)
      }
    } catch {
      // Silent — user state unchanged
    }
  }

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      clearCsrfToken() // Clear cached CSRF token
      setIsAuthenticated(false)
      setUser(null)
      setMustChangePassword(false)
      navigate("/login", { replace: true })
    }
  }

  const markTourCompleted = useCallback(async () => {
    try {
      await accountApi.completeTour()
    } catch {
      // Silent fail — still update locally so tour doesn't re-show
    }
    setUser(prev => prev ? { ...prev, hasCompletedTour: true } : prev)
  }, [])

  const resetTour = useCallback(async () => {
    await accountApi.resetTour()
    // Don't update local state — we want the tour to show on next login, not immediately
  }, [])

  useEffect(() => {
    checkAuth()
  }, [])

  // Re-check auth on location change, but skip if checked recently (30s TTL)
  const lastAuthCheck = useRef(0)
  useEffect(() => {
    if (location.pathname !== "/login" && location.pathname !== "/change-password" && !isLoading) {
      const now = Date.now()
      if (now - lastAuthCheck.current > 30_000) {
        lastAuthCheck.current = now
        checkAuth()
      }
    }
  }, [location.pathname])

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, mustChangePassword, logout, checkAuth, setAuthenticated, refreshUser, markTourCompleted, resetTour }}>
      {children}
    </AuthContext.Provider>
  )
}
