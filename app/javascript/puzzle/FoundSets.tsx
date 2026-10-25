import React from 'react'
import CardFace, { describeCard } from '../components/CardFace'
import type { PuzzleClaim } from '../lib/puzzle_api'

const slotRow = 'flex gap-1.5 rounded-lg border p-1'
const miniCard = 'min-w-0 flex-1 overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-neutral-500/50 dark:bg-[#f1f0ec]'

/**
 * The six slots for the Puzzle's sets, filled in as they're found. Each found
 * set is three real mini cards. Phones get a 2×3 grid under the board, tablets
 * 3×2, and wide screens a slim column beside the board so it all fits on screen.
 */
const FoundSets: React.FC<{ found: PuzzleClaim[]; total: number; latestKey?: number }> = ({ found, total, latestKey }) => (
  <ol
    aria-label="Sets found"
    className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:mt-0 lg:w-60 lg:shrink-0 lg:grid-cols-1 lg:gap-2.5"
  >
    {Array.from({ length: total }, (_, index) => {
      const claim = found[index]
      return claim ? (
        <li
          key={`${index}-${claim.cards.join('-')}`}
          aria-label={claim.cards.map(describeCard).join(', ')}
          data-found-set
          className={`${slotRow} border-transparent ${index === found.length - 1 && latestKey ? 'animate-card-in' : ''}`}
        >
          {claim.cards.map(cardId => (
            <span key={cardId} className={miniCard}>
              <CardFace cardId={cardId} decorative className="block h-auto w-full" />
            </span>
          ))}
        </li>
      ) : (
        <li key={index} aria-hidden="true" className={`${slotRow} border-dashed border-neutral-300 dark:border-neutral-700`}>
          {[0, 1, 2].map(slot => <span key={slot} className="aspect-[258/167] min-w-0 flex-1 border border-transparent" />)}
        </li>
      )
    })}
  </ol>
)

export default FoundSets
