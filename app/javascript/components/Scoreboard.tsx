import React from 'react'

interface ScoreboardProps {
  scores: Record<string, number>
  playerId: string
  deckCount: number
  status: string
}

const Scoreboard: React.FC<ScoreboardProps> = ({ scores, playerId, deckCount, status }) => {
  const sortedScores = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold mb-4">Scoreboard</h2>
      
      <div className="space-y-2 mb-6">
        {sortedScores.length > 0 ? (
          sortedScores.map(([pid, score], index) => (
            <div
              key={pid}
              className={`p-3 rounded ${
                pid === playerId ? 'bg-blue-100 border-2 border-blue-500' : 'bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {pid === playerId ? 'You' : `Player ${index + 1}`}
                </span>
                <span className="text-xl font-bold">{score}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-gray-500 text-center py-4">
            No scores yet
          </div>
        )}
      </div>
      
      <div className="border-t pt-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">Deck:</span>
          <span className="font-semibold">{deckCount} cards</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-gray-600">Status:</span>
          <span className={`font-semibold ${
            status === 'playing' ? 'text-green-600' : 'text-yellow-600'
          }`}>
            {status === 'playing' ? 'Playing' : 'Round Over'}
          </span>
        </div>
      </div>
    </div>
  )
}

export default Scoreboard

