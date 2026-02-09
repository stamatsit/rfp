import { useState, useRef, useCallback } from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"

export function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const [resizing, setResizing] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setResizing(true)

      const startX = e.clientX
      const startWidth = imgRef.current?.offsetWidth || 300
      const naturalWidth = imgRef.current?.naturalWidth || 1
      const naturalHeight = imgRef.current?.naturalHeight || 1
      const aspectRatio = naturalWidth / naturalHeight

      const handleMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX
        const newWidth = Math.max(80, Math.min(760, startWidth + dx))
        const newHeight = Math.round(newWidth / aspectRatio)
        updateAttributes({ width: newWidth, height: newHeight })
      }

      const handleMouseUp = () => {
        setResizing(false)
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }

      document.body.style.cursor = "se-resize"
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [updateAttributes]
  )

  const width = node.attrs.width ? Number(node.attrs.width) : undefined
  const height = node.attrs.height ? Number(node.attrs.height) : undefined

  return (
    <NodeViewWrapper className="relative inline-block my-2" data-drag-handle>
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        width={width}
        height={height}
        className={`max-w-full rounded transition-shadow ${
          selected ? "ring-2 ring-emerald-500 ring-offset-2" : ""
        } ${resizing ? "" : "cursor-grab"}`}
        draggable={false}
        style={width ? { width: `${width}px`, height: height ? `${height}px` : "auto" } : undefined}
      />
      {/* Resize handles — visible when selected */}
      {selected && (
        <>
          {/* Bottom-right (primary resize handle) */}
          <div
            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-emerald-500 border border-white rounded-sm cursor-se-resize shadow-sm z-10"
            onMouseDown={handleResizeStart}
          />
          {/* Bottom-left */}
          <div
            className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-emerald-500 border border-white rounded-sm cursor-sw-resize shadow-sm z-10"
            onMouseDown={handleResizeStart}
          />
          {/* Top-right */}
          <div
            className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-emerald-500 border border-white rounded-sm cursor-ne-resize shadow-sm z-10"
            onMouseDown={handleResizeStart}
          />
          {/* Top-left */}
          <div
            className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-emerald-500 border border-white rounded-sm cursor-nw-resize shadow-sm z-10"
            onMouseDown={handleResizeStart}
          />
        </>
      )}
    </NodeViewWrapper>
  )
}
