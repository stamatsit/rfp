import { Router, type Request, type Response } from "express"

const router = Router()

const APP_PASSWORD = process.env.APP_PASSWORD || "stamats2024"

/**
 * POST /api/auth/login
 * Validate password and create session
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: "Password is required" })
    }

    if (password === APP_PASSWORD) {
      // Set session as authenticated
      req.session.authenticated = true
      req.session.loginTime = new Date().toISOString()

      return res.json({ success: true })
    }

    return res.status(401).json({ error: "Invalid password" })
  } catch (error) {
    console.error("Login failed:", error)
    res.status(500).json({ error: "Login failed" })
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
 * Check if user is authenticated
 */
router.get("/status", async (req: Request, res: Response) => {
  res.json({
    authenticated: req.session?.authenticated === true,
    loginTime: req.session?.loginTime || null,
  })
})

export default router
