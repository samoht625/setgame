import React, { useEffect, useRef, useState } from 'react'

interface ScoreboardProps {
  scores: Record<string, number>
  names: Record<string, string>
  playerId: string
  deckCount: number
  status: string
  onUpdateName?: (name: string) => void
}

const Scoreboard: React.FC<ScoreboardProps> = ({ scores, names, playerId, deckCount, status, onUpdateName }) => {
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
    if (onUpdateName) onUpdateName(next)
    setIsEditing(false)
  }

  const cancel = () => {
    setIsEditing(false)
  }
  // Get all unique player IDs from both scores and names
  const allPlayerIds = new Set([...Object.keys(scores), ...Object.keys(names)])
  
  // Sort players by score (0 if no score exists)
  const sortedPlayers = Array.from(allPlayerIds)
    .map(pid => ({ pid, score: scores[pid] || 0 }))
    .sort((a, b) => b.score - a.score)
  
  // Hide entire scoreboard until there is at least one player registered
  if (sortedPlayers.length === 0) return null

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      
      <div className="space-y-2 mb-6">
        {sortedPlayers.map(({ pid, score }, index) => {
          const isYou = pid === playerId
          const canEdit = isYou
          return (
          <div
            key={pid}
            className={`p-3 rounded ${
              isYou ? 'bg-blue-100 border-2 border-blue-500' : 'bg-gray-50'
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
                    className="px-2 py-1 border rounded text-sm bg-white"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={canEdit ? startEditing : undefined}
                    className={`group inline-flex items-center gap-1.5 font-medium ${canEdit ? '' : ''}`}
                    title={canEdit ? 'Click to edit your name' : undefined}
                  >
                    <span>
                      {names[pid] || (pid === playerId ? 'You' : `Player ${index + 1}`)}
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
              <span className="text-xl font-bold">{score}</span>
            </div>
          </div>
        )})}
      </div>
      
      <div className="border-t pt-4">
        <div className="flex items-center justify-between text-sm text-gray-700">
          <span className="font-semibold">{deckCount} cards left</span>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${status === 'playing' ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className={`font-semibold ${status === 'playing' ? 'text-green-700' : 'text-yellow-700'}`}>
              {status === 'playing' ? 'Playing' : 'Round over'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Scoreboard

