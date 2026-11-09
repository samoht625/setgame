import React from 'react'
import { formatTime } from '../solitaire/time'
import { ordinal } from '../lib/daily'
import type { SharedResult } from '../lib/boot'
import { openTour, RULE_LINE } from '../rules/Tour'

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

/** On a new player's start card: the rule in a line, and the tour. */
export const RulesOffer: React.FC = () => (
  <p data-rules-offer className="mt-3 text-balance text-xs text-neutral-600 dark:text-neutral-300">
    {RULE_LINE}{' '}
    <button type="button" onClick={openTour} className="cursor-pointer font-medium text-neutral-900 underline underline-offset-2 dark:text-neutral-100">
      How to play
    </button>
  </p>
)
