/**
 * AI Enhance / Upscale Hook
 *
 * Wraps UpscalerJS (TensorFlow.js) to provide client-side image upscaling
 * and quality enhancement via ESRGAN and MAXIM models.
 *
 * Models are lazily loaded on first use and cached for subsequent calls.
 * MAXIM models require input dimensions that are multiples of 64.
 */

import { useState, useCallback, useRef } from 'react'

// ── Operation catalogue ────────────────────────────────────────────────────

export interface EnhanceOp {
  id: string
  label: string
  desc: string
  category: 'upscale' | 'enhance'
  scale: number
}

export const ENHANCE_OPS: EnhanceOp[] = [
  { id: 'upscale-2x', label: 'Upscale 2x', desc: 'Double resolution', category: 'upscale', scale: 2 },
  { id: 'upscale-4x', label: 'Upscale 4x', desc: 'Quadruple resolution', category: 'upscale', scale: 4 },
  { id: 'denoise', label: 'Denoise', desc: 'Remove grain & noise', category: 'enhance', scale: 1 },
  { id: 'deblur', label: 'Deblur', desc: 'Fix motion & focus blur', category: 'enhance', scale: 1 },
  { id: 'low-light', label: 'Low Light Fix', desc: 'Brighten dark images', category: 'enhance', scale: 1 },
  { id: 'retouch', label: 'Auto Retouch', desc: 'AI photo enhancement', category: 'enhance', scale: 1 },
]

// ── Internal: lazy model loading ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedUpscaler: { opId: string; instance: any } | null = null

async function loadModel(opId: string) {
  switch (opId) {
    case 'upscale-2x':  return (await import('@upscalerjs/esrgan-slim/2x')).default
    case 'upscale-4x':  return (await import('@upscalerjs/esrgan-slim/4x')).default
    case 'denoise':     return (await import('@upscalerjs/maxim-denoising')).default
    case 'deblur':      return (await import('@upscalerjs/maxim-deblurring')).default
    case 'low-light':   return (await import('@upscalerjs/maxim-enhancement')).default
    case 'retouch':     return (await import('@upscalerjs/maxim-retouching')).default
    default:            throw new Error(`Unknown enhance operation: ${opId}`)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * MAXIM models need input dims that are multiples of 64 and within a
 * safe size to prevent WebGL OOM. Returns the original image if no
 * adjustment is needed.
 */
function preprocessMaxim(
  img: HTMLImageElement,
  maxDim = 768,
): { input: HTMLImageElement | HTMLCanvasElement; resized: boolean } {
  const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1)
  const w = Math.floor((img.naturalWidth * scale) / 64) * 64
  const h = Math.floor((img.naturalHeight * scale) / 64) * 64

  if (w === img.naturalWidth && h === img.naturalHeight) {
    return { input: img, resized: false }
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return { input: canvas, resized: true }
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseUpscalerReturn {
  enhance: (imageSrc: string, opId: string) => Promise<string | null>
  isProcessing: boolean
  progress: number
  status: string
  error: string | null
}

export function useUpscaler(): UseUpscalerReturn {
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  const enhance = useCallback(async (imageSrc: string, opId: string): Promise<string | null> => {
    const op = ENHANCE_OPS.find((o) => o.id === opId)
    if (!op) return null

    setIsProcessing(true)
    setProgress(0)
    setError(null)
    setStatus('Loading AI model...')
    abortRef.current = false

    try {
      // ── Load or reuse cached Upscaler instance ──────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let upscaler: any
      if (cachedUpscaler?.opId === opId) {
        upscaler = cachedUpscaler.instance
      } else {
        const Upscaler = (await import('upscaler')).default
        const model = await loadModel(opId)
        upscaler = new Upscaler({ model })
        cachedUpscaler = { opId, instance: upscaler }
      }

      if (abortRef.current) { setIsProcessing(false); return null }

      setStatus(
        op.category === 'upscale'
          ? `Upscaling ${op.scale}x — this may take a moment...`
          : `Applying ${op.label}...`,
      )

      // ── Load source image ───────────────────────────────────────────
      const img = await loadImage(imageSrc)

      // ── Pre-process for MAXIM models ────────────────────────────────
      let input: HTMLImageElement | HTMLCanvasElement = img
      let wasResized = false
      if (op.category === 'enhance') {
        const pre = preprocessMaxim(img)
        input = pre.input
        wasResized = pre.resized
      }

      // ── Run enhancement ─────────────────────────────────────────────
      const result: string = await upscaler.upscale(input, {
        patchSize: 64,
        padding: 2,
        progress: (p: number) => {
          if (!abortRef.current) setProgress(Math.round(p * 100))
        },
      })

      if (abortRef.current) { setIsProcessing(false); return null }

      // ── If MAXIM was resized, scale result back to original dims ────
      if (wasResized) {
        const resultImg = await loadImage(result)
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(resultImg, 0, 0, img.naturalWidth, img.naturalHeight)
        setIsProcessing(false)
        setStatus('')
        setProgress(100)
        return canvas.toDataURL('image/png')
      }

      setIsProcessing(false)
      setStatus('')
      setProgress(100)
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Enhancement failed'
      console.error('Enhancement failed:', err)
      setError(msg)
      setIsProcessing(false)
      setStatus('')
      return null
    }
  }, [])

  return { enhance, isProcessing, progress, status, error }
}
