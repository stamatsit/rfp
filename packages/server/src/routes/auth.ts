import { Router, type Request, type Response } from "express"
import rateLimit from "express-rate-limit"
import {
  getUserByEmail,
  verifyPassword,
  updateLastLogin,
  changePassword,
  getUserById,
  updateAvatarUrl,
  markTourCompleted,
  resetTour,
} from "../services/userService.js"
// avatarService.js no longer used — avatars stored as data URLs in DB (matching Vercel production)

const router = Router()

// Rate limit login attempts: 5 per minute per IP
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts. Please try again in a minute." },
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * POST /api/auth/login
 * Authenticate with email + password
 */
router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    const user = await getUserByEmail(email)
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    const isValid = await verifyPassword(user, password)
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    // Update last login
    await updateLastLogin(user.id)

    // Set session
    req.session.authenticated = true
    req.session.loginTime = new Date().toISOString()
    req.session.userId = user.id
    req.session.userName = user.name
    req.session.userEmail = user.email
    req.session.mustChangePassword = user.mustChangePassword
    req.session.hasCompletedTour = user.hasCompletedTour
    req.session.avatarUrl = user.avatarUrl ? `/api/auth/avatar/${user.id}` : null

    return res.json({
      success: true,
      mustChangePassword: user.mustChangePassword,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: req.session.avatarUrl,
      },
    })
  } catch (error) {
    console.error("Login failed:", error)
    res.status(500).json({ error: "Login failed" })
  }
})

/**
 * POST /api/auth/change-password
 * Change password (required on first login for seeded users)
 */
router.post("/change-password", async (req: Request, res: Response) => {
  try {
    if (!req.session?.authenticated || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" })
    }

    // Verify current password
    const user = await getUserById(req.session.userId)
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    const isValid = await verifyPassword(user, currentPassword)
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" })
    }

    // Update password
    await changePassword(user.id, newPassword)

    // Update session
    req.session.mustChangePassword = false

    return res.json({ success: true })
  } catch (error) {
    console.error("Change password failed:", error)
    res.status(500).json({ error: "Failed to change password" })
  }
})

/**
 * POST /api/auth/logout
 * Destroy session
 */
router.post("/logout", async (req: Request, res: Response) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout failed:", err)
        return res.status(500).json({ error: "Logout failed" })
      }
      res.clearCookie("connect.sid")
      res.json({ success: true })
    })
  } catch (error) {
    console.error("Logout failed:", error)
    res.status(500).json({ error: "Logout failed" })
  }
})

/**
 * GET /api/auth/status
 * Check authentication status and return user info
 */
router.get("/status", async (req: Request, res: Response) => {
  const isAuthenticated = req.session?.authenticated === true

  if (!isAuthenticated) {
    return res.json({
      authenticated: false,
      user: null,
      mustChangePassword: false,
      loginTime: null,
    })
  }

  res.json({
    authenticated: true,
    user: {
      id: req.session.userId,
      email: req.session.userEmail,
      name: req.session.userName,
      avatarUrl: req.session.avatarUrl || null,
      hasCompletedTour: req.session.hasCompletedTour ?? false,
    },
    mustChangePassword: req.session.mustChangePassword || false,
    loginTime: req.session.loginTime || null,
  })
})

/**
 * POST /api/auth/complete-tour
 * Mark the guided tour as completed for the current user
 */
router.post("/complete-tour", async (req: Request, res: Response) => {
  try {
    if (!req.session?.authenticated || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    await markTourCompleted(req.session.userId)
    req.session.hasCompletedTour = true

    return res.json({ success: true })
  } catch (error) {
    console.error("Complete tour failed:", error)
    res.status(500).json({ error: "Failed to complete tour" })
  }
})

/**
 * POST /api/auth/reset-tour
 * Reset guided tour so it shows again on next login
 */
router.post("/reset-tour", async (req: Request, res: Response) => {
  try {
    if (!req.session?.authenticated || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    await resetTour(req.session.userId)
    req.session.hasCompletedTour = false

    return res.json({ success: true })
  } catch (error) {
    console.error("Reset tour failed:", error)
    res.status(500).json({ error: "Failed to reset tour" })
  }
})

/**
 * POST /api/auth/avatar
 * Upload user avatar (base64 JSON: { image: "data:image/webp;base64,..." })
 * Stores as data URL in DB (matching Vercel production behavior)
 */
router.post("/avatar", async (req: Request, res: Response) => {
  try {
    if (!req.session?.authenticated || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    const { image } = req.body || {}
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Expected JSON body with 'image' as base64 data URL" })
    }

    const dataUrlMatch = image.match(/^data:(image\/\w+);base64,(.+)$/)
    let fileMimeType = "image/webp"
    let base64Data: string
    if (dataUrlMatch) {
      fileMimeType = dataUrlMatch[1]
      base64Data = dataUrlMatch[2]
    } else {
      base64Data = image
    }

    const fileBuffer = Buffer.from(base64Data, "base64")
    if (fileBuffer.length === 0) {
      return res.status(400).json({ error: "Empty image data" })
    }
    if (fileBuffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: "File too large (max 2MB)" })
    }

    // Store as data URL directly in DB (matching Vercel production)
    const dataUrl = `data:${fileMimeType};base64,${fileBuffer.toString("base64")}`
    await updateAvatarUrl(req.session.userId, dataUrl)

    const avatarUrl = `/api/auth/avatar/${req.session.userId}`
    req.session.avatarUrl = avatarUrl

    return res.json({ success: true, avatarUrl })
  } catch (error) {
    console.error("Avatar upload failed:", error)
    res.status(500).json({ error: "Failed to upload avatar" })
  }
})

/**
 * DELETE /api/auth/avatar
 * Remove user avatar
 */
router.delete("/avatar", async (req: Request, res: Response) => {
  try {
    if (!req.session?.authenticated || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    await updateAvatarUrl(req.session.userId, null)
    req.session.avatarUrl = null

    return res.json({ success: true })
  } catch (error) {
    console.error("Avatar delete failed:", error)
    res.status(500).json({ error: "Failed to delete avatar" })
  }
})

export default router
