import React from 'react'
import RecentSets from './RecentSets'
import ScoreValue from './ScoreValue'

interface RecentClaim {
  player_id: string
  cards: number[]
}

interface PlayersPanelProps {
  scores: Record<string, number>
  /** Per-player keys that change on live claims so restored scores don't animate. */
  scoreAnimationKeys?: Record<string, string>
  names: Record<string, string>
  playerId: string
  onlinePlayerIds: string[]
  idlePlayerIds?: string[]
  recentClaims?: RecentClaim[]
}

const EMPTY_IDS: string[] = []
const EMPTY_CLAIMS: RecentClaim[] = []

/** Everyone at the table, ranked by score, plus the last sets found. */
const PlayersPanel: React.FC<PlayersPanelProps> = ({
  scores,
  scoreAnimationKeys,
  names,
  playerId,
  onlinePlayerIds,
  idlePlayerIds = EMPTY_IDS,
  recentClaims = EMPTY_CLAIMS
}) => {
  // Show online players sorted by score; make sure we always appear in the list
  const sortedPlayers = React.useMemo(() => {
    const visibleIds = new Set(onlinePlayerIds)
    if (playerId) visibleIds.add(playerId)
    return Array.from(visibleIds)
      .map(pid => ({ pid, score: scores[pid] || 0 }))
      .sort((a, b) => b.score - a.score)
  }, [onlinePlayerIds, playerId, scores])

  return (
    <div>
      {sortedPlayers.length === 0 ? (
        <div className="py-2 text-sm text-neutral-600 dark:text-neutral-300">Waiting for players…</div>
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
                  <span className="w-4 shrink-0 text-xs tabular-nums text-neutral-600 dark:text-neutral-300">{index + 1}</span>
                  <span className={`truncate ${isYou ? 'font-medium text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}`}>
                    {names[pid] || (isYou ? 'You' : 'Player')}
                  </span>
                  {isYou && <span className="shrink-0 text-[11px] text-neutral-600 dark:text-neutral-300">you</span>}
                  {isIdle && <span className="shrink-0 text-[11px] text-neutral-600 dark:text-neutral-300">idle</span>}
                </div>
                <ScoreValue
                  value={score}
                  animationKey={scoreAnimationKeys?.[pid]}
                  className="text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-100"
                />
              </li>
            )
          })}
        </ul>
      )}

      <RecentSets claims={recentClaims} names={names} />
    </div>
  )
}

export default React.memo(PlayersPanel)
