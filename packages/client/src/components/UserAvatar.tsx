import { useState } from "react"

// Deterministic color from name — no pink/fuchsia
const AVATAR_COLORS = [
  "bg-blue-500", "bg-cyan-500", "bg-teal-500", "bg-emerald-500",
  "bg-green-500", "bg-indigo-500", "bg-violet-500", "bg-slate-500",
  "bg-sky-500", "bg-amber-500",
]

function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function getInitials(name: string | undefined): string {
  if (!name) return "?"
  const parts = name.replace(/@.*$/, "").split(/[.\-_\s]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return (parts[0]?.[0] || "?").toUpperCase()
}

interface UserAvatarProps {
  user: { name: string; avatarUrl: string | null; id: string }
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeMap = {
  sm: "w-6 h-6 text-[10px]",
  md: "w-10 h-10 text-sm",
  lg: "w-20 h-20 text-2xl",
}

export function UserAvatar({ user, size = "md", className = "" }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const sizeClass = sizeMap[size]
  const initials = getInitials(user.name)
  const colorClass = AVATAR_COLORS[hashName(user.name || "user") % AVATAR_COLORS.length]

  if (user.avatarUrl && !imgError) {
    // Cache-bust with a param based on URL to force reload after upload
    const src = user.avatarUrl + (user.avatarUrl.includes("?") ? "&" : "?") + "v=1"
    return (
      <img
        src={src}
        alt={user.name || "User"}
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }

  return (
    <div className={`${sizeClass} ${colorClass} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 ${className}`}>
      {initials}
    </div>
  )
}
