import React, { useEffect, useId, useRef, useState } from 'react'
import { track } from '../lib/analytics'
import { isNewPlayer } from '../lib/player_id'
import RulesDemo from './RulesDemo'

const TOUR_KEY = 'setgame_tour_v1'
const OPEN_EVENT = 'setgame:tour'
/** How long a first-time player is offered the rules on the start cards and shown them on a miss. */
const NEW_FOR_MS = 24 * 60 * 60 * 1000
const MISS_HINTS = 3

const STEPS = [
  { demo: 'features', title: 'Every card has 4 features' },
  { demo: 'set', title: 'A set: each feature all same or all different' }
] as const

export const RULE_LINE = 'Find 3 cards where each feature is all the same or all different.'

export function openTour(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** Opens the tour whenever openTour() is called (the start cards' How to play). */
export function useTourOpener(): [boolean, () => void] {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])
  return [open, () => setOpen(false)]
}

/**
 * A first-time player, for their first day, until they've opened the tour.
 * They play straight away; the start cards offer the tour and a miss says
 * what a set is. Players from before this have a player id, so they aren't.
 */
export function newToRules(): boolean {
  try {
    const seen = localStorage.getItem(TOUR_KEY)
    if (seen) {
      // 'pending': the tour used to open by itself and was never closed.
      if (seen === 'pending') return true
      const since = Number(seen.match(/^new:(\d+)$/)?.[1])
      return Number.isFinite(since) && Date.now() - since < NEW_FOR_MS
    }
    localStorage.setItem(TOUR_KEY, isNewPlayer() ? `new:${Date.now()}` : 'returning')
    return isNewPlayer()
  } catch {
    return false
  }
}

let missHints = 0

/** What a miss says: for a player new to the rules, their first few misses also say what a set is. */
export function missMessage(error: string): string {
  if (error !== 'Not a valid set' && error !== 'Not a set') return error
  if (missHints >= MISS_HINTS || !newToRules()) return error
  missHints += 1
  return 'Not a set: each feature must be all the same or all different'
}

function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_KEY, 'done')
  } catch {
    // Without storage the tour may show again next visit.
  }
}

/** A short walkthrough of the rules, opened from a new player's start card. */
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

  // A native modal dialog: focus stays inside and the page behind is inert until it's closed.
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={event => {
        event.preventDefault()
        finish(false)
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden border-0 bg-transparent p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] open:flex sm:items-start sm:pt-24"
    >
      <div className="animate-dialog-in w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2 id={titleId} className="mb-3 text-center text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {STEPS[step]!.title}
        </h2>
        <RulesDemo step={STEPS[step]!.demo} />
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={() => finish(false)} className="min-h-10 rounded-full border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800">
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
