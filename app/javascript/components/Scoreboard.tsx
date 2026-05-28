import React, { useEffect, useRef, useState } from 'react'

interface RecentClaim {
  player_id: string
  cards: number[]
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
  placements?: { player_id: string; name: string; score: number; place: number }[]
  recentClaims?: RecentClaim[]
  onUpdateName?: (name: string) => void
}

const Scoreboard: React.FC<ScoreboardProps> = ({ scores, names, playerId, deckCount, status, onlinePlayerIds, idlePlayerIds = [], countdown = 0, placements = [], recentClaims = [], onUpdateName }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [tempName, setTempName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // On mount, if we have a stored name for this player and it's not already set server-side, send it up once
  useEffect(() => {
    try {
      // Prefer per-playerId key; migrate from legacy generic key if present
      const perIdKey = `setgame_player_name:${playerId}`
      let stored = localStorage.getItem(perIdKey) || ''
      if (!stored) {
        const legacy = localStorage.getItem('setgame_name') || ''
        if (legacy) {
          stored = legacy
          try { localStorage.setItem(perIdKey, legacy) } catch (_) {}
        }
      }
      const current = names[playerId] || ''
      if (stored && !current && onUpdateName) {
        onUpdateName(stored)
      }
    } catch (_) {
      // ignore storage failures
    }
    // Only run when playerId changes or names updates for this id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, names[playerId]])

  const startEditing = () => {
    setTempName(names[playerId] || '')
    setIsEditing(true)
  }

  const commit = () => {
    const next = tempName.trim().slice(0, 20)
    if (onUpdateName) onUpdateName(next)
    setIsEditing(false)
  }

  const cancel = () => {
    setIsEditing(false)
  }
  // Filter to only online players and sort by score (0 if no score exists)
  const sortedPlayers = onlinePlayerIds
    .map(pid => ({ pid, score: scores[pid] || 0 }))
    .sort((a, b) => b.score - a.score)
  
  // Hide entire scoreboard until there is at least one player registered
  if (sortedPlayers.length === 0) return null

  return (
    <div className="bg-white p-5 md:p-6 rounded-2xl border border-neutral-200/80">

      <div className="space-y-1.5 mb-6">
        {sortedPlayers.map(({ pid, score }, index) => {
          const isYou = pid === playerId
          const canEdit = isYou
          return (
          <div
            key={pid}
            className={`px-3 py-2.5 rounded-lg transition-colors ${
              isYou ? 'bg-neutral-100 ring-1 ring-neutral-200' : 'hover:bg-neutral-50'
            }`}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {canEdit && isEditing ? (
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
                    className="px-2 py-1 border border-neutral-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={canEdit ? startEditing : undefined}
                    className={`group inline-flex items-center gap-1.5 font-medium ${canEdit ? '' : ''}`}
                    title={canEdit ? 'Click to edit your name' : undefined}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span>
                        {names[pid] || (pid === playerId ? 'You' : `Player ${index + 1}`)}
                      </span>
                      {idlePlayerIds.includes(pid) && (
                        <span className="inline-flex items-center text-xs text-gray-500">
                          <span className="w-2 h-2 rounded-full bg-gray-300 mr-1" />
                          idle
                        </span>
                      )}
                    </span>
                    {canEdit && (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3.5 w-3.5 text-gray-500 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <span className="text-lg font-semibold tabular-nums text-neutral-900">{score}</span>
            </div>
          </div>
        )})}
      </div>

      <div className="border-t border-neutral-100 pt-4">
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span className="font-medium">{deckCount} cards left</span>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${status === 'playing' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {status === 'playing' ? (
              <span className="font-medium text-neutral-600">Playing</span>
            ) : (
              <span className="font-medium text-amber-600">Round over</span>
            )}
          </div>
        </div>
        {status !== 'playing' && (
          <div className="mt-3 space-y-2">
            {placements.length > 0 && (
              <div className="text-sm">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">Results</div>
                <ol className="ml-0 space-y-0.5 list-none">
                  {placements.map(p => (
                    <li key={p.player_id} className="flex items-center gap-2">
                      <span className="w-5 text-center">
                        {p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : `${p.place}.`}
                      </span>
                      <span className="flex-1"><span className="font-medium">{p.name}</span> — {p.score}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="text-sm font-medium text-neutral-500">
              Starting new game in {Math.max(0, countdown)}...
            </div>
          </div>
        )}
      </div>

      {recentClaims.length > 0 && (
        <div className="border-t border-neutral-100 pt-4 mt-4">
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-400 mb-3">Last sets found</div>
          <div className="space-y-2 max-h-[calc(100vh-32rem)] overflow-y-auto">
            {recentClaims.map((claim, index) => (
              <div key={index} className="text-xs">
                <div className="font-medium text-neutral-600 mb-1">{names[claim.player_id] || 'Player'}</div>
                <div className="flex gap-1">
                  {claim.cards.map((cardId) => (
                    <div
                      key={cardId}
                      className="rounded-md overflow-hidden ring-1 ring-neutral-200 bg-white aspect-[4/3] h-10 md:h-12 flex items-center justify-center"
                    >
                      <img
                        src={`/cards/${cardId}.png`}
                        alt={`Card ${cardId}`}
                        className="max-w-full max-h-full object-contain"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Scoreboard

