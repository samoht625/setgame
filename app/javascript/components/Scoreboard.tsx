import React, { useEffect, useRef, useState } from 'react'

interface RecentClaim {
  player_id: string
  cards: number[]
}

interface Placement {
  player_id: string
  name: string
  score: number
  place: number
}

interface ScoreboardProps {
  scores: Record<string, number>
  names: Record<string, string>
  playerId: string
  deckCount: number
  status: string
  onlinePlayerIds: string[]
  idlePlayerIds?: string[]
  countdown?: number
  placements?: Placement[]
  recentClaims?: RecentClaim[]
  isConnected?: boolean
  onUpdateName?: (name: string) => void
}

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-medium uppercase tracking-wide text-neutral-400">{children}</div>
)

const Scoreboard: React.FC<ScoreboardProps> = ({
  scores,
  names,
  playerId,
  deckCount,
  status,
  onlinePlayerIds,
  idlePlayerIds = [],
  countdown = 0,
  placements = [],
  recentClaims = [],
  isConnected = false,
  onUpdateName
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [tempName, setTempName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const startEditing = () => {
    setTempName(names[playerId] || '')
    setIsEditing(true)
  }

  const commit = () => {
    const next = tempName.trim().slice(0, 20)
    if (next && onUpdateName) onUpdateName(next)
    setIsEditing(false)
  }

  const cancel = () => setIsEditing(false)

  // Show online players sorted by score; make sure we always appear in the list
  const visibleIds = new Set(onlinePlayerIds)
  if (playerId) visibleIds.add(playerId)
  const sortedPlayers = Array.from(visibleIds)
    .map(pid => ({ pid, score: scores[pid] || 0 }))
    .sort((a, b) => b.score - a.score)

  const isRoundOver = status !== 'playing'

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5">
      {/* Players */}
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>Players</SectionLabel>
        <span className="flex items-center gap-1.5 text-xs text-neutral-400">
          <span
            className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
          {isConnected ? 'Live' : 'Reconnecting…'}
        </span>
      </div>

      {sortedPlayers.length === 0 ? (
        <div className="py-2 text-sm text-neutral-400">Waiting for players…</div>
      ) : (
        <ul className="space-y-1">
          {sortedPlayers.map(({ pid, score }) => {
            const isYou = pid === playerId
            const isIdle = idlePlayerIds.includes(pid)
            return (
              <li
                key={pid}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${
                  isYou ? 'bg-indigo-50' : ''
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  {isYou && isEditing ? (
                    <input
                      ref={inputRef}
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      onBlur={commit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commit()
                        if (e.key === 'Escape') cancel()
                      }}
                      placeholder="Your name"
                      maxLength={20}
                      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-sm focus:border-indigo-400 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={isYou ? startEditing : undefined}
                      className={`group flex min-w-0 items-center gap-1.5 text-sm ${
                        isYou ? 'cursor-pointer font-medium text-neutral-900' : 'cursor-default text-neutral-700'
                      }`}
                      title={isYou ? 'Click to edit your name' : undefined}
                    >
                      <span className="truncate">{names[pid] || (isYou ? 'You' : 'Player')}</span>
                      {isYou && (
                        <>
                          <span className="shrink-0 text-[11px] font-normal text-indigo-400">you</span>
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-3 w-3 shrink-0 text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </>
                      )}
                      {isIdle && <span className="shrink-0 text-[11px] text-neutral-400">idle</span>}
                    </button>
                  )}
                </div>
                <span className="text-base font-semibold tabular-nums text-neutral-900">{score}</span>
              </li>
            )
          })}
        </ul>
      )}

      {/* Deck and status */}
      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm">
        <span className="text-neutral-500">
          <span className="font-semibold tabular-nums text-neutral-900">{deckCount}</span> cards left
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            isRoundOver ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {isRoundOver ? 'Round over' : 'In play'}
        </span>
      </div>

      {/* Round results */}
      {isRoundOver && (
        <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3">
          {placements.length > 0 && (
            <ol className="space-y-1 text-sm">
              {placements.map(p => (
                <li key={p.player_id} className="flex items-center gap-2">
                  <span className="w-5 text-center">
                    {p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : `${p.place}.`}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="font-semibold tabular-nums">{p.score}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="text-sm text-neutral-600">
            Next round in <span className="font-semibold tabular-nums">{Math.max(0, countdown)}</span>…
          </div>
        </div>
      )}

      {/* Recent sets */}
      {recentClaims.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <SectionLabel>Last sets found</SectionLabel>
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {recentClaims.map((claim, index) => (
              <li key={index} className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {claim.cards.map((cardId) => (
                    <img
                      key={cardId}
                      src={`/cards/${cardId}.png`}
                      alt={`Card ${cardId}`}
                      draggable={false}
                      className="h-9 w-auto rounded border border-neutral-200 bg-white object-contain md:h-10"
                    />
                  ))}
                </div>
                <span className="min-w-0 truncate text-xs text-neutral-500">
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

export default Scoreboard
