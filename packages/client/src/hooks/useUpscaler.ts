/**
 * AI Enhance / Upscale Hook
 *
 * Runs image enhancement server-side via Replicate (real models that
 * preserve the photo), replacing the previous in-browser TensorFlow.js
 * path which required WebGL and failed/timed-out in many environments.
 *
 * Flow: downscale the source to a safe size → POST to /api/ai/enhance to
 * create a Replicate prediction → poll /api/ai/enhance-status until the
 * server returns the finished image as a data URL.
 */

import { useState, useCallback, useRef } from 'react'
import { addCsrfHeader } from '@/lib/csrfToken'

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

// ── Helpers ──────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Downscale the source before upload so request/response payloads stay
 * reasonable and the upscaled output stays within sane bounds. For upscale
 * ops the input is capped so output ≈ 4096px on the long side; other ops
 * cap the long side at 2048px. Returns a JPEG data URL.
 */
async function prepareForUpload(imageSrc: string, op: EnhanceOp): Promise<string> {
  const img = await loadImage(imageSrc)
  if (
    !Number.isFinite(img.naturalWidth) || !Number.isFinite(img.naturalHeight) ||
    img.naturalWidth < 1 || img.naturalHeight < 1
  ) {
    throw new Error('Image failed to decode (invalid dimensions)')
  }

  // Keep the *result* well under Vercel's ~4.5MB function-response limit
  // (the finished image is proxied back same-origin as binary). Cap so the
  // upscaled output lands around ~2048px on the long side.
  const maxDim = op.category === 'upscale' ? Math.max(1, Math.floor(2048 / op.scale)) : 1536
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  let w = img.naturalWidth
  let h = img.naturalHeight
  if (longest > maxDim) {
    const ratio = maxDim / longest
    w = Math.max(1, Math.round(w * ratio))
    h = Math.max(1, Math.round(h * ratio))
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function readError(res: Response): Promise<string | null> {
  try {
    const data = await res.json()
    return data?.error || null
  } catch {
    return null
  }
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
    setStatus('Preparing image...')
    abortRef.current = false

    const runningLabel = op.category === 'upscale'
      ? `Upscaling ${op.scale}x — this can take 10–30s...`
      : `Applying ${op.label}...`

    try {
      const prepared = await prepareForUpload(imageSrc, op)
      if (abortRef.current) { setIsProcessing(false); return null }

      setStatus(runningLabel)
      const headers = await addCsrfHeader({ 'Content-Type': 'application/json' })
      const createRes = await fetch('/api/ai/enhance', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ image: prepared, op: opId }),
      })
      if (!createRes.ok) {
        throw new Error((await readError(createRes)) || `Enhance request failed (${createRes.status})`)
      }
      const created = await createRes.json()
      if (!created?.id) throw new Error('No prediction returned')

      const startedAt = Date.now()
      // Poll until the server returns the finished image (cap ~3 min).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (abortRef.current) { setIsProcessing(false); return null }
        await sleep(2000)
        // Niche models scale to zero on Replicate; a cold boot ("starting")
        // can take a few minutes before inference even begins, so allow up to 6.
        if (Date.now() - startedAt > 360_000) {
          throw new Error('Timed out — the model is taking too long to start. Try again in a moment.')
        }
        const statusRes = await fetch(`/api/ai/enhance-status?id=${encodeURIComponent(created.id)}`, {
          credentials: 'include',
        })
        if (!statusRes.ok) continue // transient — keep polling
        const s = await statusRes.json()
        if (s.status === 'succeeded') {
          setStatus('Finishing...')
          // Fetch the finished image same-origin (binary) → data URL so it's
          // usable on a canvas (convert/crop/download) without CORS taint.
          const resultRes = await fetch(`/api/ai/enhance-result?id=${encodeURIComponent(created.id)}`, {
            credentials: 'include',
          })
          if (!resultRes.ok) {
            throw new Error((await readError(resultRes)) || 'Could not retrieve result')
          }
          const blob = await resultRes.blob()
          const dataUrl: string = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          setProgress(100)
          setStatus('')
          setIsProcessing(false)
          return dataUrl
        }
        if (s.status === 'failed' || s.status === 'canceled') {
          throw new Error(s.error || 'Enhancement failed on the server')
        }
        // "starting" = cold boot (can take 1–3 min); "processing" = running.
        setStatus(s.status === 'starting' ? 'Starting model — first run can take a few minutes...' : runningLabel)
      }
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
