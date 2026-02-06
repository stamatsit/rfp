import { Router, type Request, type Response } from "express"
import rateLimit from "express-rate-limit"
import multer from "multer"
import {
  getUserByEmail,
  verifyPassword,
  updateLastLogin,
  changePassword,
  getUserById,
  updateAvatarUrl,
} from "../services/userService.js"
import { saveAvatar, deleteAvatarFile } from "../services/avatarService.js"

// Multer config for avatar uploads (memory storage, 2MB limit, images only)
const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true)
    else cb(new Error("Only image files are allowed"))
  },
})

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
    },
    mustChangePassword: req.session.mustChangePassword || false,
    loginTime: req.session.loginTime || null,
  })
})

/**
 * POST /api/auth/avatar
 * Upload user avatar (cropped image from client)
 */
router.post("/avatar", avatarUpload.single("avatar"), async (req: Request, res: Response) => {
  try {
    if (!req.session?.authenticated || !req.session.userId) {
      return res.status(401).json({ error: "Authentication required" })
    }

    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" })
    }

    const storagePath = await saveAvatar(req.session.userId, req.file.buffer, req.file.mimetype)
    const avatarUrl = `/api/auth/avatar/${req.session.userId}`

    await updateAvatarUrl(req.session.userId, storagePath)
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

    await deleteAvatarFile(req.session.userId)
    await updateAvatarUrl(req.session.userId, null)
    req.session.avatarUrl = null

    return res.json({ success: true })
  } catch (error) {
    console.error("Avatar delete failed:", error)
    res.status(500).json({ error: "Failed to delete avatar" })
  }
})

export default router
