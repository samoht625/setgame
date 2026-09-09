import React from 'react'
import CardFace from './CardFace'

interface RecentSetsProps {
  claims: ReadonlyArray<{ cards: readonly number[]; player_id?: string }>
  names?: Record<string, string>
}

const RecentSets = React.memo(function RecentSets({ claims, names }: RecentSetsProps) {
  if (claims.length === 0) return null

  return (
    <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">Last sets found</div>
      <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
        {claims.map((claim, index) => (
          <li key={index} className="flex items-center justify-between gap-2">
            <div className="flex shrink-0 gap-1">
              {claim.cards.map(cardId => (
                <CardFace
                  key={cardId}
                  cardId={cardId}
                  className="h-9 w-auto shrink-0 rounded border border-neutral-200 md:h-10 dark:border-neutral-700"
                />
              ))}
            </div>
            {claim.player_id !== undefined && (
              <span className="min-w-0 truncate text-xs text-neutral-600 dark:text-neutral-300">
                {names?.[claim.player_id] || 'Player'}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
})

export default RecentSets
