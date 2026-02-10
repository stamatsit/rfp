import { useState, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { tourSteps, type TourStep } from "./tourSteps"
import { TourOverlay } from "./TourOverlay"
import { TourTooltip } from "./TourTooltip"

interface GuidedTourProps {
  isOpen: boolean
  onComplete: () => void
}

export function GuidedTour({ isOpen, onComplete }: GuidedTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [filteredSteps, setFilteredSteps] = useState<TourStep[]>([])

  // Filter steps based on which target elements actually exist in the DOM
  useEffect(() => {
    if (!isOpen) return
    const available = tourSteps.filter((step) => {
      if (!step.targetSelector) return true // centered steps always shown
      return document.querySelector(step.targetSelector) !== null
    })
    setFilteredSteps(available)
    setCurrentStepIndex(0)
  }, [isOpen])

  // Update target rect when step changes
  const updateTargetRect = useCallback(() => {
    if (!isOpen || filteredSteps.length === 0) return
    const step = filteredSteps[currentStepIndex]
    if (!step?.targetSelector) {
      setTargetRect(null)
      return
    }
    const el = document.querySelector(step.targetSelector)
    if (el) {
      setTargetRect(el.getBoundingClientRect())
    } else {
      setTargetRect(null)
    }
  }, [isOpen, currentStepIndex, filteredSteps])

  useEffect(() => {
    updateTargetRect()

    // Scroll target into view if needed
    if (isOpen && filteredSteps.length > 0) {
      const step = filteredSteps[currentStepIndex]
      if (step?.targetSelector) {
        const el = document.querySelector(step.targetSelector)
        if (el) {
          const rect = el.getBoundingClientRect()
          const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight
          if (!isInView) {
            el.scrollIntoView({ behavior: "smooth", block: "center" })
            // Recalculate after scroll settles
            setTimeout(updateTargetRect, 400)
          }
        }
      }
    }
  }, [currentStepIndex, isOpen, filteredSteps, updateTargetRect])

  // Handle window resize and scroll
  useEffect(() => {
    if (!isOpen) return
    const handleReposition = () => updateTargetRect()
    window.addEventListener("resize", handleReposition)
    window.addEventListener("scroll", handleReposition, true)
    return () => {
      window.removeEventListener("resize", handleReposition)
      window.removeEventListener("scroll", handleReposition, true)
    }
  }, [isOpen, updateTargetRect])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onComplete()
        return
      }
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault()
        handleNext()
        return
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        handleBack()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, currentStepIndex, filteredSteps.length])

  const handleNext = useCallback(() => {
    if (currentStepIndex < filteredSteps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      onComplete()
    }
  }, [currentStepIndex, filteredSteps.length, onComplete])

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }, [currentStepIndex])

  if (!isOpen || filteredSteps.length === 0) return null

  const currentStep = filteredSteps[currentStepIndex]
  if (!currentStep) return null

  return createPortal(
    <>
      <TourOverlay
        targetRect={targetRect}
        padding={currentStep.spotlightPadding ?? 8}
        isVisible={true}
        onClick={() => {}} // Clicking overlay does nothing (prevents accidental dismiss)
      />
      <TourTooltip
        step={currentStep}
        currentIndex={currentStepIndex}
        totalSteps={filteredSteps.length}
        targetRect={targetRect}
        onNext={handleNext}
        onBack={handleBack}
        onSkip={onComplete}
      />
    </>,
    document.body
  )
}
