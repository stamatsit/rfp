import "express-session"

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean
    loginTime?: string
    userId?: string
    userName?: string
    userEmail?: string
    mustChangePassword?: boolean
    hasCompletedTour?: boolean
    avatarUrl?: string | null
    role?: "admin" | "user"
  }
}
