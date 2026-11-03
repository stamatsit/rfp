import { useEffect, useId, useState, type ReactNode } from "react"
import { AlertCircle, Check, ChevronDown, RotateCcw, Square } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  BORDER_PRESETS,
  DEFAULT_FRAME,
  MAX_BORDER_PX,
  SHADOW_PRESETS,
  type FrameLayout,
  type FrameOutputFormat,
  type FrameSettings,
} from "@/lib/imageFrame"

const SLIDER_CLASS = `w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer
  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:cursor-pointer
  [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:border-0
  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-500 [&::-moz-range-thumb]:cursor-pointer`

const SEGMENT_TRACK = "flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl"
const segmentClass = (selected: boolean) =>
  `flex-1 min-w-0 py-1.5 px-1 rounded-lg text-[12px] font-medium transition-all ${
    selected
      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
  }`

const DIRECTION_NAMES: Record<number, string> = {
  0: "Up",
  45: "Up right",
  90: "Right",
  135: "Down right",
  180: "Down",
  225: "Down left",
  270: "Left",
  315: "Up left",
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 ${
          checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  )
}

function SliderRow({
  label,
  value,
  readout,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  readout: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  const id = useId()
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-[11px] text-slate-500 dark:text-slate-400">{label}</label>
        <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300">{readout}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={readout}
        onChange={(e) => onChange(Number(e.target.value))}
        className={SLIDER_CLASS}
      />
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
      <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  )
}

function valuesMatchDefaults(frame: FrameSettings): boolean {
  return (
    frame.borderSize === DEFAULT_FRAME.borderSize &&
    frame.borderUnit === DEFAULT_FRAME.borderUnit &&
    frame.shadowSoftness === DEFAULT_FRAME.shadowSoftness &&
    frame.shadowDistance === DEFAULT_FRAME.shadowDistance &&
    frame.shadowDarkness === DEFAULT_FRAME.shadowDarkness &&
    frame.shadowDirection === DEFAULT_FRAME.shadowDirection &&
    frame.fit === DEFAULT_FRAME.fit &&
    frame.background === DEFAULT_FRAME.background
  )
}

interface BorderShadowCardProps {
  frame: FrameSettings
  /** Null while both switches are off. */
  layout: FrameLayout | null
  outputWidth: number
  outputHeight: number
  format: FrameOutputFormat
  imageCount: number
  isCutout: boolean
  edgeBright: boolean
  onChange: (patch: Partial<FrameSettings>) => void
  onReset: () => void
  onApplyToAll: () => void
}

export function BorderShadowCard({
  frame,
  layout,
  outputWidth,
  outputHeight,
  format,
  imageCount,
  isCutout,
  edgeBright,
  onChange,
  onReset,
  onApplyToAll,
}: BorderShadowCardProps) {
  const [fineTuneOpen, setFineTuneOpen] = useState(false)
  // The typed value stays as typed until the field loses focus, so clearing the
  // box to retype does not snap back to a computed number.
  const [pixelDraft, setPixelDraft] = useState<string | null>(null)
  const [appliedToAll, setAppliedToAll] = useState(false)

  useEffect(() => {
    if (!appliedToAll) return
    const timer = setTimeout(() => setAppliedToAll(false), 2000)
    return () => clearTimeout(timer)
  }, [appliedToAll])

  const shortSide = Math.max(1, Math.min(outputWidth, outputHeight))
  const borderPercent = frame.borderUnit === "percent"
    ? frame.borderSize
    : Math.min(15, Math.max(0.5, (frame.borderSize / shortSide) * 100))
  const directionName = DIRECTION_NAMES[frame.shadowDirection]

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3">
      <Label className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Square size={12} />
        Border &amp; Shadow
      </Label>

      {/* White border */}
      <ToggleRow
        label="White border"
        checked={frame.borderOn}
        onChange={(borderOn) => onChange({ borderOn })}
      />
      {frame.borderOn && (
        <div className="space-y-3">
          <div className={SEGMENT_TRACK}>
            {BORDER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                aria-pressed={frame.borderUnit === "percent" && frame.borderSize === preset.size}
                onClick={() => {
                  setPixelDraft(null)
                  onChange({ borderSize: preset.size, borderUnit: "percent" })
                }}
                className={segmentClass(frame.borderUnit === "percent" && frame.borderSize === preset.size)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[1fr_76px] gap-3 items-end">
            <SliderRow
              label="Size"
              value={borderPercent}
              readout={`${borderPercent.toFixed(1).replace(/\.0$/, "")}%`}
              min={0.5}
              max={15}
              step={0.5}
              onChange={(borderSize) => {
                setPixelDraft(null)
                onChange({ borderSize, borderUnit: "percent" })
              }}
            />
            <div className="relative">
              <Input
                type="number"
                min={1}
                max={MAX_BORDER_PX}
                aria-label="Border size in pixels"
                value={pixelDraft ?? String(layout?.border ?? "")}
                onChange={(e) => {
                  setPixelDraft(e.target.value)
                  const typed = Number.parseInt(e.target.value, 10)
                  if (Number.isFinite(typed) && typed >= 1) {
                    onChange({ borderSize: Math.min(typed, MAX_BORDER_PX), borderUnit: "px" })
                  }
                }}
                onBlur={() => setPixelDraft(null)}
                className="h-8 pr-6 text-[12px] font-mono"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                px
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      {/* Drop shadow */}
      <ToggleRow
        label="Drop shadow"
        checked={frame.shadowOn}
        onChange={(shadowOn) => onChange({ shadowOn })}
      />
      {frame.shadowOn && (
        <div className="space-y-3">
          <div className={SEGMENT_TRACK}>
            {SHADOW_PRESETS.map((preset) => {
              const selected =
                frame.shadowSoftness === preset.softness &&
                frame.shadowDistance === preset.distance &&
                frame.shadowDarkness === preset.darkness
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange({
                    shadowSoftness: preset.softness,
                    shadowDistance: preset.distance,
                    shadowDarkness: preset.darkness,
                  })}
                  className={segmentClass(selected)}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            aria-expanded={fineTuneOpen}
            onClick={() => setFineTuneOpen(!fineTuneOpen)}
            className="w-full flex items-center justify-between text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            Fine tune
            <ChevronDown size={13} className={`transition-transform duration-200 ${fineTuneOpen ? "rotate-180" : ""}`} />
          </button>
          {fineTuneOpen && (
            <div className="space-y-3">
              <SliderRow
                label="Softness"
                value={frame.shadowSoftness}
                readout={`${frame.shadowSoftness}%`}
                min={0}
                max={15}
                step={0.5}
                onChange={(shadowSoftness) => onChange({ shadowSoftness })}
              />
              <SliderRow
                label="Distance"
                value={frame.shadowDistance}
                readout={`${frame.shadowDistance}%`}
                min={0}
                max={10}
                step={0.25}
                onChange={(shadowDistance) => onChange({ shadowDistance })}
              />
              <SliderRow
                label="Darkness"
                value={frame.shadowDarkness}
                readout={`${frame.shadowDarkness}%`}
                min={0}
                max={100}
                step={1}
                onChange={(shadowDarkness) => onChange({ shadowDarkness })}
              />
              <SliderRow
                label="Direction"
                value={frame.shadowDirection}
                readout={directionName ?? `${frame.shadowDirection}°`}
                min={0}
                max={355}
                step={5}
                onChange={(shadowDirection) => onChange({ shadowDirection })}
              />
            </div>
          )}

          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block">File background</span>
            <div className={SEGMENT_TRACK}>
              <button
                type="button"
                disabled={format === "jpeg"}
                aria-pressed={layout?.background === "transparent"}
                onClick={() => onChange({ background: "transparent" })}
                className={`${segmentClass(layout?.background === "transparent")} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Transparent
              </button>
              <button
                type="button"
                aria-pressed={layout?.background === "white"}
                onClick={() => onChange({ background: "white" })}
                className={segmentClass(layout?.background === "white")}
              >
                White
              </button>
            </div>
            {format === "jpeg" && (
              <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400 mt-1.5">
                JPEG can't be transparent, so the background is white. Use WebP or PNG for transparency.
              </p>
            )}
          </div>
        </div>
      )}

      {/* File size, once there is something to size */}
      {layout && (
        <>
          <div className="h-px bg-slate-100 dark:bg-slate-800" />
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 block">File size</span>
            <div className={SEGMENT_TRACK}>
              <button
                type="button"
                aria-pressed={layout.fit === "grow"}
                onClick={() => onChange({ fit: "grow" })}
                className={segmentClass(layout.fit === "grow")}
              >
                Grow canvas
              </button>
              <button
                type="button"
                aria-pressed={layout.fit === "exact"}
                onClick={() => onChange({ fit: "exact" })}
                className={`${segmentClass(layout.fit === "exact")} truncate`}
              >
                Keep {outputWidth}×{outputHeight}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 text-[12px]">
              <span className="text-slate-500 dark:text-slate-400">Final file</span>
              <span data-testid="frame-final-size" className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                {layout.fileWidth}×{layout.fileHeight}
              </span>
            </div>
          </div>

          {frame.borderOn && isCutout && (
            <Hint>The border puts your cutout on a white rectangle. For depth without the box, use only the shadow.</Hint>
          )}
          {frame.borderOn && !frame.shadowOn && !isCutout && edgeBright && (
            <Hint>This photo's edges are bright, so the white border may blend in. A shadow helps it stand out.</Hint>
          )}
        </>
      )}

      {/* Actions */}
      {(layout || !valuesMatchDefaults(frame)) && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setPixelDraft(null)
              onReset()
            }}
            disabled={valuesMatchDefaults(frame)}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-slate-400 transition-colors"
          >
            <RotateCcw size={11} />
            Reset
          </button>
          {imageCount > 1 && (
            <button
              type="button"
              onClick={() => {
                onApplyToAll()
                setAppliedToAll(true)
              }}
              className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              {appliedToAll && <Check size={11} />}
              {appliedToAll ? `Applied to ${imageCount} images` : `Apply to all ${imageCount} images`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
