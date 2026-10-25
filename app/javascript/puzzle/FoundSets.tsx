import React from 'react'
import CardFace, { describeCard } from '../components/CardFace'
import type { PuzzleClaim } from '../lib/puzzle_api'

/** The six slots under the Puzzle's board, filled in as sets are found. */
const FoundSets: React.FC<{ found: PuzzleClaim[]; total: number; latestKey?: number }> = ({ found, total, latestKey }) => (
  <ol aria-label="Sets found" className="mt-3 grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-6">
    {Array.from({ length: total }, (_, index) => {
      const claim = found[index]
      return claim ? (
        <li
          key={`${index}-${claim.cards.join('-')}`}
          aria-label={claim.cards.map(describeCard).join(', ')}
          data-found-set
          className={`flex gap-1 rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900 ${index === found.length - 1 && latestKey ? 'animate-card-in' : ''}`}
        >
          {claim.cards.map(cardId => (
            <CardFace key={cardId} cardId={cardId} decorative className="h-auto min-w-0 flex-1 rounded-[3px] bg-white ring-1 ring-neutral-200 dark:bg-[#f1f0ec] dark:ring-0" />
          ))}
        </li>
      ) : (
        <li key={index} aria-hidden="true" className="flex gap-1 rounded-lg border border-dashed border-neutral-300 p-1 dark:border-neutral-700">
          {[0, 1, 2].map(slot => <span key={slot} className="aspect-[258/167] min-w-0 flex-1" />)}
        </li>
      )
    })}
  </ol>
)

export default FoundSets
