import { useRef, useEffect, useCallback } from "react"

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

interface PanelConfig {
  defaultW: number
  defaultH: number
  minW: number
  minH: number
  maxW: number
  maxH: number
}

export function usePanelResize(
  panelRef: React.RefObject<HTMLDivElement | null>,
  positionRef: React.MutableRefObject<{ x: number; y: number }>,
  config: PanelConfig,
) {
  const sizeRef = useRef({ w: config.defaultW, h: config.defaultH })
  const isResizingRef = useRef(false)
  const resizeDirRef = useRef<ResizeDir>("se")
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 })

  const applySize = useCallback(() => {
    if (!panelRef.current) return
    panelRef.current.style.width = `${sizeRef.current.w}px`
    panelRef.current.style.height = `${sizeRef.current.h}px`
    panelRef.current.style.left = `${positionRef.current.x}px`
    panelRef.current.style.top = `${positionRef.current.y}px`
  }, [panelRef, positionRef])

  const startResize = useCallback((e: React.MouseEvent, dir: ResizeDir) => {
    e.preventDefault()
    e.stopPropagation()
    isResizingRef.current = true
    resizeDirRef.current = dir
    resizeStartRef.current = {
      x: e.clientX, y: e.clientY,
      w: sizeRef.current.w, h: sizeRef.current.h,
      px: positionRef.current.x, py: positionRef.current.y,
    }
    document.body.style.userSelect = "none"
  }, [positionRef])

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const dx = e.clientX - resizeStartRef.current.x
      const dy = e.clientY - resizeStartRef.current.y
      const dir = resizeDirRef.current
      const start = resizeStartRef.current

      let newW = start.w
      let newH = start.h
      let newX = start.px
      let newY = start.py

      // East
      if (dir.includes("e")) newW = Math.min(config.maxW, Math.max(config.minW, start.w + dx))
      // West
      if (dir.includes("w")) {
        const proposed = start.w - dx
        newW = Math.min(config.maxW, Math.max(config.minW, proposed))
        newX = start.px + (start.w - newW)
      }
      // South
      if (dir === "s" || dir === "se" || dir === "sw") newH = Math.min(config.maxH, Math.max(config.minH, start.h + dy))
      // North
      if (dir === "n" || dir === "ne" || dir === "nw") {
        const proposed = start.h - dy
        newH = Math.min(config.maxH, Math.max(config.minH, proposed))
        newY = start.py + (start.h - newH)
      }

      sizeRef.current = { w: newW, h: newH }
      positionRef.current = { x: newX, y: newY }
      applySize()
    }

    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false
        document.body.style.userSelect = ""
        document.body.style.cursor = ""
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
    return () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }
  }, [config, positionRef, applySize])

  // Yellow = restore default size (centered)
  const restoreDefault = useCallback(() => {
    sizeRef.current = { w: config.defaultW, h: config.defaultH }
    positionRef.current = {
      x: Math.max(20, (window.innerWidth - config.defaultW) / 2),
      y: Math.max(20, (window.innerHeight - config.defaultH) / 2),
    }
    applySize()
  }, [config, positionRef, applySize])

  // Green = maximize (1080 on longest side, maintain aspect ratio feel, center)
  const maximize = useCallback(() => {
    const maxLong = 1080
    const aspect = config.defaultW / config.defaultH
    let newW: number, newH: number
    if (aspect >= 1) {
      newW = Math.min(maxLong, window.innerWidth - 40)
      newH = Math.min(config.maxH, Math.round(newW / aspect), window.innerHeight - 40)
    } else {
      newH = Math.min(maxLong, window.innerHeight - 40)
      newW = Math.min(config.maxW, Math.round(newH * aspect), window.innerWidth - 40)
    }
    // Clamp
    newW = Math.min(config.maxW, Math.max(config.minW, newW))
    newH = Math.min(config.maxH, Math.max(config.minH, newH))

    sizeRef.current = { w: newW, h: newH }
    positionRef.current = {
      x: Math.max(20, (window.innerWidth - newW) / 2),
      y: Math.max(20, (window.innerHeight - newH) / 2),
    }
    applySize()
  }, [config, positionRef, applySize])

  return { sizeRef, startResize, restoreDefault, maximize, applySize }
}

// Resize handle components — 4 edges + 4 corners
const EDGE = 4  // px thickness for edge handles
const CORNER = 10 // px size for corner handles

export function ResizeHandles({ onResizeStart }: { onResizeStart: (e: React.MouseEvent, dir: ResizeDir) => void }) {
  return (
    <>
      {/* Edges */}
      <div onMouseDown={e => onResizeStart(e, "n")} className="absolute top-0 left-[10px] right-[10px] cursor-ns-resize" style={{ height: EDGE }} />
      <div onMouseDown={e => onResizeStart(e, "s")} className="absolute bottom-0 left-[10px] right-[10px] cursor-ns-resize" style={{ height: EDGE }} />
      <div onMouseDown={e => onResizeStart(e, "w")} className="absolute left-0 top-[10px] bottom-[10px] cursor-ew-resize" style={{ width: EDGE }} />
      <div onMouseDown={e => onResizeStart(e, "e")} className="absolute right-0 top-[10px] bottom-[10px] cursor-ew-resize" style={{ width: EDGE }} />
      {/* Corners */}
      <div onMouseDown={e => onResizeStart(e, "nw")} className="absolute top-0 left-0 cursor-nwse-resize" style={{ width: CORNER, height: CORNER }} />
      <div onMouseDown={e => onResizeStart(e, "ne")} className="absolute top-0 right-0 cursor-nesw-resize" style={{ width: CORNER, height: CORNER }} />
      <div onMouseDown={e => onResizeStart(e, "sw")} className="absolute bottom-0 left-0 cursor-nesw-resize" style={{ width: CORNER, height: CORNER }} />
      <div onMouseDown={e => onResizeStart(e, "se")} className="absolute bottom-0 right-0 cursor-nwse-resize" style={{ width: CORNER, height: CORNER }} />
    </>
  )
}
