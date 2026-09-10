import React from 'react'

interface RecentClaim {
  player_id: string
  cards: number[]
}

interface PlayersPanelProps {
  scores: Record<string, number>
  names: Record<string, string>
  playerId: string
  onlinePlayerIds: string[]
  idlePlayerIds?: string[]
  recentClaims?: RecentClaim[]
}

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{children}</div>
)

/** Everyone at the table, ranked by score, plus the last sets found. */
const PlayersPanel: React.FC<PlayersPanelProps> = ({
  scores,
  names,
  playerId,
  onlinePlayerIds,
  idlePlayerIds = [],
  recentClaims = []
}) => {
  // Show online players sorted by score; make sure we always appear in the list
  const visibleIds = new Set(onlinePlayerIds)
  if (playerId) visibleIds.add(playerId)
  const sortedPlayers = Array.from(visibleIds)
    .map(pid => ({ pid, score: scores[pid] || 0 }))
    .sort((a, b) => b.score - a.score)

  return (
    <div>
      {sortedPlayers.length === 0 ? (
        <div className="py-2 text-sm text-neutral-400 dark:text-neutral-500">Waiting for players…</div>
      ) : (
        <ul className="space-y-1">
          {sortedPlayers.map(({ pid, score }, index) => {
            const isYou = pid === playerId
            const isIdle = idlePlayerIds.includes(pid)
            return (
              <li
                key={pid}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${
                  isYou ? 'bg-neutral-100 dark:bg-neutral-800' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-neutral-400 dark:text-neutral-500">{index + 1}</span>
                  <span className={`truncate ${isYou ? 'font-medium text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}`}>
                    {names[pid] || (isYou ? 'You' : 'Player')}
                  </span>
                  {isYou && <span className="shrink-0 text-[11px] text-neutral-400">you</span>}
                  {isIdle && <span className="shrink-0 text-[11px] text-neutral-400">idle</span>}
                </div>
                <span className="text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{score}</span>
              </li>
            )
          })}
        </ul>
      )}

      {recentClaims.length > 0 && (
        <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <SectionLabel>Last sets found</SectionLabel>
          <ul className="mt-2 space-y-2">
            {recentClaims.map((claim, index) => (
              <li key={index} className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {claim.cards.map((cardId) => (
                    <img
                      key={cardId}
                      src={`/cards/${cardId}.png`}
                      alt={`Card ${cardId}`}
                      draggable={false}
                      className="h-9 w-auto rounded border border-neutral-200 bg-white object-contain md:h-10 dark:border-neutral-700 dark:bg-white"
                    />
                  ))}
                </div>
                <span className="min-w-0 truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {names[claim.player_id] || 'Player'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default PlayersPanel
