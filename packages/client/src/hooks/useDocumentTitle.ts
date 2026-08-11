import { useEffect } from "react"

/**
 * Sets document.title for screen-reader announcements and browser tab context.
 * Format: "Page Name — Stamats Lab"
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} — Stamats Lab`
  }, [title])
}
