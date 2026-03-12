import { SlideRenderer } from "./slideRenderers"
import type { PitchDeckSlide } from "@/types/deck"

interface SlidePreviewProps {
  slide: PitchDeckSlide
  onUpdate: (partial: Partial<PitchDeckSlide>) => void
}

export function SlidePreview({ slide, onUpdate }: SlidePreviewProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
      <div
        className="w-full max-w-4xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.06)] rounded-lg overflow-hidden"
        style={{ aspectRatio: "16 / 9" }}
      >
        <SlideRenderer slide={slide} onUpdate={onUpdate} interactive />
      </div>
    </div>
  )
}
