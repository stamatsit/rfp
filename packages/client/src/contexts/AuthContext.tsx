import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { useNavigate, useLocation } from "react-router-dom"

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
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
  const navigate = useNavigate()
  const location = useLocation()

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/status", {
        credentials: "include",
      })
      const data = await response.json()
      setIsAuthenticated(data.authenticated === true)

      // If not authenticated and not on login page, redirect to login
      if (!data.authenticated && location.pathname !== "/login") {
        navigate("/login", { replace: true })
      }
    } catch (error) {
      setIsAuthenticated(false)
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true })
      }
    } finally {
      setIsLoading(false)
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
      navigate("/login", { replace: true })
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  // Re-check auth on location change (except for login page)
  useEffect(() => {
    if (location.pathname !== "/login" && !isLoading) {
      checkAuth()
    }
  }, [location.pathname])

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}
