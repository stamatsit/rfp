import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Undo2, Trash2, Loader2, Minus, Plus, Zap } from 'lucide-react'
import { useInpainting } from '@/hooks/useInpainting'

interface MagicEraserProps {
  isOpen: boolean
  onClose: () => void
  imageSrc: string
  onApply: (newImageDataUri: string) => void
}

export function MagicEraser({ isOpen, onClose, imageSrc, onApply }: MagicEraserProps) {
  const [brushSize, setBrushSize] = useState(40)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStatus, setProcessingStatus] = useState('')
  const [hasStrokes, setHasStrokes] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const displayCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const naturalDimsRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const [displayDims, setDisplayDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const undoStackRef = useRef<string[]>([])
  const isDrawingRef = useRef(false)
  const brushSizeRef = useRef(brushSize)
  brushSizeRef.current = brushSize
  const displayDimsRef = useRef(displayDims)
  displayDimsRef.current = displayDims

  const {
    inpaint,
    inpaintWithTelea,
    isModelReady,
    isModelLoading,
    modelProgress,
    preloadModel,
  } = useInpainting()

  // Compute display dimensions that fit the modal while preserving aspect ratio
  const getDisplayDims = useCallback(() => {
    const nat = naturalDimsRef.current
    if (!nat.w || !nat.h) return { w: 600, h: 400 }
    const maxW = Math.min(window.innerWidth - 80, 900)
    const maxH = Math.min(window.innerHeight - 200, 600)
    const scale = Math.min(maxW / nat.w, maxH / nat.h, 1)
    return { w: Math.round(nat.w * scale), h: Math.round(nat.h * scale) }
  }, [])

  // Draw source image + magenta mask overlay
  const redrawDisplay = useCallback(() => {
    const canvas = displayCanvasRef.current
    const src = sourceCanvasRef.current
    if (!canvas || !src) return

    const dims = displayDimsRef.current
    if (canvas.width !== dims.w || canvas.height !== dims.h) {
      canvas.width = dims.w
      canvas.height = dims.h
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, dims.w, dims.h)
    ctx.drawImage(src, 0, 0, dims.w, dims.h)

    // Draw mask as magenta overlay
    const mask = maskCanvasRef.current
    if (mask) {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = dims.w
      tempCanvas.height = dims.h
      const tempCtx = tempCanvas.getContext('2d')
      if (!tempCtx) return
      tempCtx.drawImage(mask, 0, 0, dims.w, dims.h)
      const maskPixels = tempCtx.getImageData(0, 0, dims.w, dims.h)

      for (let i = 0; i < maskPixels.data.length; i += 4) {
        if (maskPixels.data[i] > 128) {
          maskPixels.data[i] = 255
          maskPixels.data[i + 1] = 56
          maskPixels.data[i + 2] = 100
          maskPixels.data[i + 3] = 115
        } else {
          maskPixels.data[i + 3] = 0
        }
      }
      tempCtx.putImageData(maskPixels, 0, 0)
      ctx.drawImage(tempCanvas, 0, 0)
    }

    // Sync cursor canvas
    const cursorCanvas = cursorCanvasRef.current
    if (cursorCanvas && (cursorCanvas.width !== dims.w || cursorCanvas.height !== dims.h)) {
      cursorCanvas.width = dims.w
      cursorCanvas.height = dims.h
    }
  }, [])

  // Initialize from loaded image
  const initFromImage = useCallback((img: HTMLImageElement) => {
    const natW = img.naturalWidth || img.width
    const natH = img.naturalHeight || img.height
    naturalDimsRef.current = { w: natW, h: natH }

    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = natW
    srcCanvas.height = natH
    const srcCtx = srcCanvas.getContext('2d')
    if (!srcCtx) return
    srcCtx.drawImage(img, 0, 0, natW, natH)
    sourceCanvasRef.current = srcCanvas

    const mask = document.createElement('canvas')
    mask.width = natW
    mask.height = natH
    const mCtx = mask.getContext('2d')
    if (!mCtx) return
    mCtx.fillStyle = '#000000'
    mCtx.fillRect(0, 0, natW, natH)
    maskCanvasRef.current = mask

    const dims = getDisplayDims()
    setDisplayDims(dims)
    displayDimsRef.current = dims
    undoStackRef.current = []
    setHasStrokes(false)
    // Defer redraw to next tick so canvas has updated dimensions
    requestAnimationFrame(() => redrawDisplay())
  }, [redrawDisplay, getDisplayDims])

  // Load image on open
  useEffect(() => {
    if (!isOpen) return
    preloadModel()
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => initFromImage(img)
    img.onerror = () => {
      const img2 = new Image()
      img2.onload = () => initFromImage(img2)
      img2.src = imageSrc
    }
    img.src = imageSrc
  }, [isOpen, imageSrc, initFromImage, preloadModel])

  // Map screen coordinates to natural image coordinates
  const toMaskCoords = useCallback((clientX: number, clientY: number) => {
    const canvas = displayCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const nat = naturalDimsRef.current
    const dims = displayDimsRef.current
    const relX = (clientX - rect.left) / dims.w
    const relY = (clientY - rect.top) / dims.h
    return { x: relX * nat.w, y: relY * nat.h }
  }, [])

  const drawOnMask = useCallback((x: number, y: number) => {
    const mask = maskCanvasRef.current
    if (!mask) return
    const ctx = mask.getContext('2d')
    if (!ctx) return
    const nat = naturalDimsRef.current
    const dims = displayDimsRef.current
    const scaleFactor = nat.w / dims.w
    const r = (brushSizeRef.current * scaleFactor) / 2
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }, [])

  const interpolateStroke = useCallback((fx: number, fy: number, tx: number, ty: number) => {
    const dx = tx - fx, dy = ty - fy
    const dist = Math.sqrt(dx * dx + dy * dy)
    const nat = naturalDimsRef.current
    const dims = displayDimsRef.current
    const scaleFactor = nat.w / dims.w
    const step = Math.max((brushSizeRef.current * scaleFactor) / 4, 1)
    const steps = Math.ceil(dist / step)
    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps
      drawOnMask(fx + dx * t, fy + dy * t)
    }
  }, [drawOnMask])

  const drawCursor = useCallback((clientX: number, clientY: number) => {
    const canvas = cursorCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const x = clientX - rect.left
    const y = clientY - rect.top
    const bs = brushSizeRef.current

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(x, y, bs / 2, 0, Math.PI * 2)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x, y, bs / 2 + 1, 0, Math.PI * 2)
    ctx.stroke()

    const cs = 4
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x - cs, y); ctx.lineTo(x + cs, y)
    ctx.moveTo(x, y - cs); ctx.lineTo(x, y + cs)
    ctx.stroke()
  }, [])

  // Apply inpainting
  const applyErase = useCallback(async () => {
    const srcCanvas = sourceCanvasRef.current
    const mask = maskCanvasRef.current
    if (!srcCanvas || !mask) return

    const maskCtx = mask.getContext('2d')
    if (!maskCtx) return
    const maskPixels = maskCtx.getImageData(0, 0, mask.width, mask.height)
    let hasWhite = false
    for (let i = 0; i < maskPixels.data.length; i += 4) {
      if (maskPixels.data[i] > 128) { hasWhite = true; break }
    }
    if (!hasWhite) return

    setIsProcessing(true)
    undoStackRef.current.push(srcCanvas.toDataURL('image/png'))
    if (undoStackRef.current.length > 20) undoStackRef.current.shift()

    try {
      let result: string | null = null
      let usedAI = false

      if (isModelReady) {
        setProcessingStatus('AI erasing...')
        usedAI = true
        result = await inpaint(srcCanvas, mask)
      } else {
        setProcessingStatus(isModelLoading ? 'Erasing (AI loading...)' : 'Erasing...')
        result = inpaintWithTelea(srcCanvas, mask)
      }

      if (result) {
        const newImg = new Image()
        newImg.crossOrigin = 'anonymous'
        await new Promise<void>((resolve) => {
          newImg.onload = () => {
            const nat = naturalDimsRef.current
            const newSrc = document.createElement('canvas')
            newSrc.width = nat.w
            newSrc.height = nat.h
            const newSrcCtx = newSrc.getContext('2d')
            if (newSrcCtx) newSrcCtx.drawImage(newImg, 0, 0, nat.w, nat.h)
            sourceCanvasRef.current = newSrc

            const mCtx = mask.getContext('2d')
            if (mCtx) {
              mCtx.fillStyle = '#000000'
              mCtx.fillRect(0, 0, mask.width, mask.height)
            }
            setHasStrokes(false)
            redrawDisplay()
            resolve()
          }
          newImg.src = result!
        })
        setProcessingStatus(usedAI ? 'AI erase done' : 'Erase done')
        setTimeout(() => setProcessingStatus(''), 1200)
      } else {
        setProcessingStatus('Failed — try again')
        undoStackRef.current.pop()
        setTimeout(() => setProcessingStatus(''), 2000)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setProcessingStatus(`Error: ${msg}`)
      undoStackRef.current.pop()
      setTimeout(() => setProcessingStatus(''), 3000)
    } finally {
      setIsProcessing(false)
    }
  }, [isModelReady, isModelLoading, inpaint, inpaintWithTelea, redrawDisplay])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isProcessing) return
    e.preventDefault()
    e.stopPropagation()
    isDrawingRef.current = true
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const pos = toMaskCoords(e.clientX, e.clientY)
    drawOnMask(pos.x, pos.y)
    lastPosRef.current = pos
    setHasStrokes(true)
    redrawDisplay()
  }, [isProcessing, toMaskCoords, drawOnMask, redrawDisplay])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    drawCursor(e.clientX, e.clientY)
    if (!isDrawingRef.current) return
    e.preventDefault()
    const pos = toMaskCoords(e.clientX, e.clientY)
    if (lastPosRef.current) {
      interpolateStroke(lastPosRef.current.x, lastPosRef.current.y, pos.x, pos.y)
    } else {
      drawOnMask(pos.x, pos.y)
    }
    lastPosRef.current = pos
    redrawDisplay()
  }, [toMaskCoords, drawOnMask, interpolateStroke, redrawDisplay, drawCursor])

  const handlePointerUp = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    lastPosRef.current = null
    applyErase()
  }, [applyErase])

  const handlePointerLeave = useCallback(() => {
    const canvas = cursorCanvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  const handleUndo = useCallback(async () => {
    if (undoStackRef.current.length === 0) return
    const prevDataUri = undoStackRef.current.pop()!
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve) => {
      img.onload = () => {
        const nat = naturalDimsRef.current
        const srcCanvas = document.createElement('canvas')
        srcCanvas.width = nat.w
        srcCanvas.height = nat.h
        const srcCtx = srcCanvas.getContext('2d')
        if (srcCtx) srcCtx.drawImage(img, 0, 0, nat.w, nat.h)
        sourceCanvasRef.current = srcCanvas
        if (maskCanvasRef.current) {
          const mCtx = maskCanvasRef.current.getContext('2d')
          if (mCtx) {
            mCtx.fillStyle = '#000000'
            mCtx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
          }
        }
        setHasStrokes(false)
        redrawDisplay()
        resolve()
      }
      img.src = prevDataUri
    })
  }, [redrawDisplay])

  const handleClear = useCallback(() => {
    if (!maskCanvasRef.current) return
    const ctx = maskCanvasRef.current.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height)
    setHasStrokes(false)
    redrawDisplay()
  }, [redrawDisplay])

  const handleDone = useCallback(() => {
    if (isProcessing) return
    const src = sourceCanvasRef.current
    if (src && undoStackRef.current.length > 0) {
      onApply(src.toDataURL('image/png'))
    }
    onClose()
  }, [isProcessing, onApply, onClose])

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (isProcessing) return
      switch (e.key) {
        case '[': setBrushSize(s => Math.max(5, s - 8)); break
        case ']': setBrushSize(s => Math.min(200, s + 8)); break
        case 'z':
          if (e.metaKey || e.ctrlKey) { e.preventDefault(); handleUndo() }
          break
        case 'Escape': e.preventDefault(); handleDone(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, isProcessing, handleUndo, handleDone])

  if (!isOpen) return null

  const dims = displayDims

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDone} />

      {/* Modal */}
      <div ref={containerRef} className="relative z-10 flex flex-col items-center gap-3">
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-zinc-900/95 backdrop-blur-xl shadow-2xl border border-white/5">
          <TBtn onClick={() => setBrushSize(s => Math.max(5, s - 8))} title="Smaller [">
            <Minus size={13} />
          </TBtn>
          <div className="flex items-center gap-2 px-1">
            <input
              type="range" min={5} max={200} value={brushSize}
              onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
              className="w-16 h-1 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, #ec4899 ${((brushSize - 5) / 195) * 100}%, rgba(255,255,255,0.12) ${((brushSize - 5) / 195) * 100}%)`,
              }}
            />
            <span className="text-[10px] text-white/40 font-mono w-6 text-right tabular-nums">{brushSize}</span>
          </div>
          <TBtn onClick={() => setBrushSize(s => Math.min(200, s + 8))} title="Larger ]">
            <Plus size={13} />
          </TBtn>

          <div className="w-px h-4 bg-white/10 mx-1" />

          <TBtn onClick={handleUndo} title="Undo (Ctrl+Z)" disabled={undoStackRef.current.length === 0}>
            <Undo2 size={13} />
          </TBtn>
          {hasStrokes && (
            <TBtn onClick={handleClear} title="Clear mask">
              <Trash2 size={13} />
            </TBtn>
          )}

          <div className="w-px h-4 bg-white/10 mx-1" />

          <span className="text-[10px] text-white/30 px-1 whitespace-nowrap">Paint to erase</span>

          <TBtn onClick={handleDone} title="Done (Esc)">
            <X size={13} />
          </TBtn>

          {isModelLoading && (
            <>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <div className="flex items-center gap-1.5 px-1">
                <Loader2 size={9} className="text-pink-500 animate-spin" />
                <span className="text-[9px] text-white/35">AI {modelProgress}%</span>
              </div>
            </>
          )}
          {isModelReady && !isModelLoading && (
            <>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <div className="flex items-center gap-1 px-1">
                <Zap size={9} className="text-green-500" />
                <span className="text-[9px] text-green-500">AI</span>
              </div>
            </>
          )}
        </div>

        {/* Canvas area */}
        <div
          className="relative rounded-lg overflow-hidden shadow-2xl"
          style={{
            width: dims.w || 600,
            height: dims.h || 400,
            boxShadow: '0 0 0 2px rgba(236, 72, 153, 0.4), 0 0 30px rgba(236, 72, 153, 0.1)',
            cursor: isProcessing ? 'wait' : 'none',
          }}
        >
          <canvas
            ref={displayCanvasRef}
            width={dims.w} height={dims.h}
            className="absolute inset-0 pointer-events-none"
            style={{ width: dims.w, height: dims.h }}
          />
          <canvas
            ref={cursorCanvasRef}
            width={dims.w} height={dims.h}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            className="absolute inset-0 touch-none"
            style={{
              width: dims.w, height: dims.h,
              pointerEvents: isProcessing ? 'none' : 'auto',
            }}
          />

          {isProcessing && (
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <Loader2 size={20} className="text-pink-500 animate-spin" />
              <span className="text-[11px] font-medium text-white">{processingStatus}</span>
            </div>
          )}
        </div>

        {/* Status toast */}
        {processingStatus && !isProcessing && (
          <div className="px-3 py-1.5 rounded-lg bg-zinc-900/90 backdrop-blur shadow-lg">
            <span className="text-[10px] text-white/60">{processingStatus}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Toolbar button
function TBtn({ onClick, title, children, disabled }: { onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick} title={title} disabled={disabled}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-all flex-shrink-0 ${
        disabled
          ? 'text-white/20 cursor-default opacity-50'
          : 'text-white/55 hover:text-white hover:bg-white/10 cursor-pointer'
      }`}
    >
      {children}
    </button>
  )
}
