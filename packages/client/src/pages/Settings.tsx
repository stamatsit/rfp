// Re-export from SettingsPanel for backwards compatibility
export {
  loadSettings,
  saveSettings,
  getVisibleTiles,
  type TileConfig
} from "@/components/SettingsPanel"

import { useEffect } from "react"
import { useNavigate } from "react-router-dom"

// Settings page now redirects to home since settings is a floating panel
export function Settings() {
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to home - settings is accessed via the gear icon in header
    navigate("/", { replace: true })
  }, [navigate])

  return null
}
