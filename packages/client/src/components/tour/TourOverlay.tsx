interface TourOverlayProps {
  targetRect: DOMRect | null
  padding?: number
  isVisible: boolean
  onClick: () => void
}

export function TourOverlay({ targetRect, padding = 8, isVisible, onClick }: TourOverlayProps) {
  if (!isVisible) return null

  // No target — full dark overlay (for centered/welcome steps)
  if (!targetRect) {
    return (
      <div
        className="fixed inset-0 z-[9998] bg-slate-900/65 backdrop-blur-[2px] transition-opacity duration-400"
        onClick={onClick}
      />
    )
  }

  // Spotlight: a positioned div whose box-shadow creates the dark surround
  return (
    <>
      {/* Click guard — blocks clicks outside the spotlight */}
      <div className="fixed inset-0 z-[9998]" onClick={onClick} />
      {/* Spotlight cutout */}
      <div
        className="fixed z-[9998] pointer-events-none transition-all duration-500 ease-out"
        style={{
          top: targetRect.top - padding,
          left: targetRect.left - padding,
          width: targetRect.width + padding * 2,
          height: targetRect.height + padding * 2,
          borderRadius: 16,
          boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.65)",
        }}
      />
    </>
  )
}
