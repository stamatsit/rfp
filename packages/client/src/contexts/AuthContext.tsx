import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { accountApi } from "@/lib/api"

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

  useEffect(() => {
    checkAuth()
  }, [])

  // Re-check auth on location change (except for login and change-password pages)
  useEffect(() => {
    if (location.pathname !== "/login" && location.pathname !== "/change-password" && !isLoading) {
      checkAuth()
    }
  }, [location.pathname])

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, mustChangePassword, logout, checkAuth, setAuthenticated, refreshUser, markTourCompleted }}>
      {children}
    </AuthContext.Provider>
  )
}
