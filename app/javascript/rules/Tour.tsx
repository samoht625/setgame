import React, { useEffect, useId, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { isNewPlayer } from '../lib/player_id'
import RulesDemo from './RulesDemo'

const TOUR_KEY = 'setgame_tour_v1'

const STEPS = [
  { demo: 'features', title: 'Every card has 4 features' },
  { demo: 'set', title: 'A set: each feature all same or all different' }
] as const

/**
 * Whether to show the tour: first visit only. Players who were here before the
 * tour existed already had a player id, so they skip it too.
 */
export function shouldShowTour(): boolean {
  try {
    const seen = localStorage.getItem(TOUR_KEY)
    // 'pending': shown but not dismissed yet (say, the page was reloaded mid-tour).
    if (seen) return seen === 'pending'
    if (!isNewPlayer()) {
      localStorage.setItem(TOUR_KEY, 'returning')
      return false
    }
    localStorage.setItem(TOUR_KEY, 'pending')
    return true
  } catch {
    return false
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_KEY, 'done')
  } catch {
    // Without storage the tour may show again next visit.
  }
}

/** A short first-visit walkthrough of the rules. The game waits until it's dismissed. */
const Tour: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [step, setStep] = useState(0)
  const titleId = useId()
  const nextRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const last = step === STEPS.length - 1

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    track('tour_start')
    return () => dialog?.close()
  }, [])

  useEffect(() => {
    nextRef.current?.focus()
  }, [step])

  const finish = (completed: boolean) => {
    markTourSeen()
    track(completed ? 'tour_complete' : 'tour_skip', completed ? undefined : { step: step + 1 })
    onDone()
  }

  // A native modal dialog: focus stays inside and the page behind is inert, so
  // nothing (like Start on the daily) can be reached until the tour is closed.
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault()
        finish(false)
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden border-0 bg-transparent p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] open:flex backdrop:bg-neutral-900/35 backdrop:backdrop-blur-[1px] sm:items-start sm:pt-24 dark:backdrop:bg-black/55"
    >
      <div className="animate-dialog-in w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2 id={titleId} className="mb-3 text-center text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {STEPS[step]!.title}
        </h2>
        <RulesDemo step={STEPS[step]!.demo} />
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => finish(false)} className="min-h-10 rounded-full px-3 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100">
            Skip
          </button>
          <span className="flex flex-1 justify-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, index) => (
              <span key={index} className={`h-1.5 w-1.5 rounded-full ${index === step ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-300 dark:bg-neutral-600'}`} />
            ))}
          </span>
          <button
            ref={nextRef}
            type="button"
            onClick={() => (last ? finish(true) : setStep(step + 1))}
            className="min-h-10 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            {last ? 'Got it' : 'Next'}
          </button>
        </div>
      </div>
    </dialog>
  )
}

export default Tour
