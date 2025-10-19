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
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      
      <div className="space-y-2 mb-6">
        {sortedPlayers.length > 0 ? (
          sortedPlayers.map(({ pid, score }, index) => {
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
                      className={`font-medium ${canEdit ? 'hover:underline' : ''}`}
                      title={canEdit ? 'Click to edit your name' : undefined}
                    >
                      {names[pid] || (pid === playerId ? 'You' : `Player ${index + 1}`)}
                    </button>
                  )}
                </div>
                <span className="text-xl font-bold">{score}</span>
              </div>
            </div>
          )})
        ) : (
          <div className="text-gray-500 text-center py-4">
            No scores yet
          </div>
        )}
      </div>
      
      <div className="border-t pt-4">
        <div className="flex items-center justify-between text-sm text-gray-700">
          <div className="flex items-center gap-2">
            {/* cards icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3 6a2 2 0 012-2h7a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" />
              <path d="M10 6a2 2 0 012-2h4a2 2 0 012 2v8a2 2 0 01-2 2h-4" />
            </svg>
            <span className="font-semibold">{deckCount}</span>
          </div>
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

