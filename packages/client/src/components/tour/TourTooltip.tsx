import { useRef, useState, useEffect } from "react"
import { ArrowLeft, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react"
import type { TourStep } from "./tourSteps"

interface TourTooltipProps {
  step: TourStep
  currentIndex: number
  totalSteps: number
  targetRect: DOMRect | null
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

const TOOLTIP_WIDTH = 340
const OFFSET = 16
const VIEWPORT_MARGIN = 16

function calculatePosition(
  targetRect: DOMRect | null,
  placement: TourStep["placement"],
  tooltipHeight: number
): { top: number; left: number } {
  if (!targetRect || placement === "center") {
    return {
      top: window.innerHeight / 2 - tooltipHeight / 2,
      left: window.innerWidth / 2 - TOOLTIP_WIDTH / 2,
    }
  }

  let top: number
  let left: number

  switch (placement) {
    case "bottom":
      top = targetRect.bottom + OFFSET
      left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2
      break
    case "top":
      top = targetRect.top - tooltipHeight - OFFSET
      left = targetRect.left + targetRect.width / 2 - TOOLTIP_WIDTH / 2
      break
    case "right":
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2
      left = targetRect.right + OFFSET
      break
    case "left":
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2
      left = targetRect.left - TOOLTIP_WIDTH - OFFSET
      break
    default:
      top = targetRect.bottom + OFFSET
      left = targetRect.left
  }

  // Clamp to viewport
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - tooltipHeight - VIEWPORT_MARGIN))
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_MARGIN))

  return { top, left }
}

export function TourTooltip({
  step,
  currentIndex,
  totalSteps,
  targetRect,
  onNext,
  onBack,
  onSkip,
}: TourTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipHeight, setTooltipHeight] = useState(200)

  useEffect(() => {
    if (tooltipRef.current) {
      setTooltipHeight(tooltipRef.current.offsetHeight)
    }
  }, [step.id])

  const isFirst = currentIndex === 0
  const isLast = currentIndex === totalSteps - 1
  const isWelcome = step.id === "welcome"
  const isComplete = step.id === "complete"
  const { top, left } = calculatePosition(targetRect, step.placement, tooltipHeight)

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] animate-tour-enter"
      style={{ top, left, width: TOOLTIP_WIDTH }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 shadow-2xl shadow-black/15 dark:shadow-black/40 overflow-hidden">
        {/* Header accent */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500" />

        <div className="p-5">
          {/* Icon for welcome/complete */}
          {(isWelcome || isComplete) && (
            <div className="flex justify-center mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isComplete
                  ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                  : "bg-gradient-to-br from-blue-500 to-cyan-600"
              }`}>
                {isComplete ? (
                  <CheckCircle2 size={24} className="text-white" />
                ) : (
                  <Sparkles size={24} className="text-white" />
                )}
              </div>
            </div>
          )}

          {/* Title */}
          <h3 className={`font-semibold text-slate-900 dark:text-white tracking-tight ${
            isWelcome || isComplete ? "text-center text-lg" : "text-[15px]"
          }`}>
            {step.title}
          </h3>

          {/* Description */}
          <p className={`mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 ${
            isWelcome || isComplete ? "text-center" : ""
          }`}>
            {step.description}
          </p>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-5 h-1.5 bg-blue-500"
                    : i < currentIndex
                      ? "w-1.5 h-1.5 bg-blue-300 dark:bg-blue-600"
                      : "w-1.5 h-1.5 bg-slate-200 dark:bg-slate-600"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between mt-5">
            {/* Skip */}
            {!isLast ? (
              <button
                onClick={onSkip}
                className="text-[12px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Skip tour
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {/* Back */}
              {!isFirst && (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium text-slate-600 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <ArrowLeft size={14} />
                  Back
                </button>
              )}

              {/* Next / Done */}
              <button
                onClick={onNext}
                className="flex items-center gap-1 px-4 py-1.5 text-[13px] font-medium text-white rounded-lg bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 shadow-sm transition-all active:scale-95"
              >
                {isLast ? "Get Started" : isWelcome ? "Start Tour" : "Next"}
                {!isLast && <ArrowRight size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
