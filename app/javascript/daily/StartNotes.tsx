import React from 'react'
import { formatTime } from '../solitaire/time'
import { ordinal } from '../lib/daily'
import type { SharedResult } from '../lib/boot'
import { primaryButton } from '../lib/buttons'
import { openTour } from '../rules/Tour'
import StreakPill from './StreakPill'

/** On the start card of a friend's shared link: their time, to beat. */
export const Challenge: React.FC<{ shared: SharedResult; number: number; name: string }> = ({ shared, number, name }) => {
  const standing = shared.rank && shared.total && shared.rank <= shared.total ? ` · ${ordinal(shared.rank)} of ${shared.total}` : ''
  return (
    <div data-challenge className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="text-xs">
        {shared.number === number ? 'Your friend’s time today' : `Your friend’s time on ${name} #${shared.number}`}
      </p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">
        {formatTime(shared.elapsed_ms)}
        <span className="text-sm font-normal text-amber-900/80 dark:text-amber-100/80">{standing}</span>
      </p>
      <p className="text-sm font-medium">Can you beat it?</p>
    </div>
  )
}

interface StartCardProps {
  /** A friend's time to beat, on a shared link. */
  challenge?: React.ReactNode
  /** What the game is and what a try costs: a line each. */
  lines: [string, string]
  action?: string
  onStart: () => void
  starting: boolean
  streak: number
  /** The player is new to the rules: offer the tour. */
  offerRules: boolean
}

/**
 * What the Daily Deal and the Puzzle show before a run. Everything leads to
 * the one button: two lines above it, and under it only what this player has
 * (a streak) or may need (the tour).
 */
export const StartCard: React.FC<StartCardProps> = ({ challenge, lines, action = 'Start', onStart, starting, streak, offerRules }) => (
  <>
    {challenge}
    <p className="mt-2 text-sm text-neutral-800 dark:text-neutral-100">
      {lines[0]}
      <br />
      {lines[1]}
    </p>
    <button type="button" onClick={onStart} disabled={starting} className={`${primaryButton} mt-4 w-full`}>
      {action}
    </button>
    {/* The tour's button is taller than its text, for a finger; the row gives that back below. */}
    {(streak > 0 || offerRules) && (
      <div className={`mt-3 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 ${offerRules ? '-mb-2' : ''}`}>
        {streak > 0 && <StreakPill streak={streak} />}
        {offerRules && (
          <button
            type="button"
            data-rules-offer
            onClick={openTour}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-full px-3 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            How to play
          </button>
        )}
      </div>
    )}
  </>
)
