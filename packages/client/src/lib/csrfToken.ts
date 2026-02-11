/**
 * CSRF Token Management
 *
 * Fetches and caches CSRF token from the server
 */

let cachedToken: string | null = null

/**
 * Get CSRF token from server (cached)
 */
export async function getCsrfToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken
  }

  try {
    const response = await fetch("/api/csrf-token", {
      credentials: "include",
    })

    if (!response.ok) {
      throw new Error("Failed to fetch CSRF token")
    }

    const data = await response.json()
    cachedToken = data.csrfToken
    return cachedToken as string
  } catch (error) {
    console.error("CSRF token fetch failed:", error)
    throw error
  }
}

/**
 * Clear cached token (call on logout or token error)
 */
export function clearCsrfToken() {
  cachedToken = null
}

/**
 * Add CSRF token to request headers
 */
export async function addCsrfHeader(headers: HeadersInit = {}): Promise<HeadersInit> {
  const token = await getCsrfToken()

  return {
    ...headers,
    "X-CSRF-Token": token,
  }
}
