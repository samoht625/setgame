import React from 'react'

interface BestTime {
  ms: number
  at: string
}

interface RecentClaim {
  cards: number[]
}

interface SolitaireSidebarProps {
  elapsedMs: number
  deckCount: number
  isFinished: boolean
  onRestartRound: () => void
  recentClaims: RecentClaim[]
}

const SolitaireSidebar: React.FC<SolitaireSidebarProps> = ({
  elapsedMs,
  deckCount,
  isFinished,
  onRestartRound,
  recentClaims
}) => {
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date)
  }

  const bestTimes = (): BestTime[] => {
    try {
      const stored = localStorage.getItem('setgame_solo_best_times')
      if (!stored) return []
      const times = JSON.parse(stored) as BestTime[]
      return times.sort((a, b) => a.ms - b.ms).slice(0, 10)
    } catch {
      return []
    }
  }

  const [bestTimesList, setBestTimesList] = React.useState<BestTime[]>(bestTimes())

  React.useEffect(() => {
    setBestTimesList(bestTimes())
  }, [isFinished])

  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-lg">
      {/* Timer with restart button */}
      <div className="mb-6">
        <div className="text-sm text-gray-600 mb-2">Time</div>
        <div className="flex items-center justify-between">
          <div className="text-4xl font-bold text-gray-900">
            {formatTime(elapsedMs)}
          </div>
          <button
            onClick={onRestartRound}
            className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
            title="Restart round"
            aria-label="Restart round"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Cards left (shown when playing) */}
      {!isFinished && (
        <div className="border-t pt-4 mb-4">
          <div className="flex items-center justify-between text-sm text-gray-700">
            <span className="font-semibold">{deckCount} cards left</span>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="font-semibold text-green-700">Playing</span>
            </div>
          </div>
        </div>
      )}

      {/* Best times (shown when finished) */}
      {isFinished && bestTimesList.length > 0 && (
        <div className="border-t pt-4">
          <div className="text-sm font-semibold mb-2">Best Times</div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {bestTimesList.map((entry, index) => {
              const isBestScore = index === 0
              const isNewest = entry.at === bestTimesList[bestTimesList.length - 1]?.at
              const isNewBest = isBestScore && isNewest && isFinished
              const containerBase = 'text-xs p-2 rounded border flex items-center justify-between'
              const containerStyles = isNewBest
                ? 'bg-amber-50 border-amber-200'
                : isNewest && isFinished
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-gray-50 border-gray-200'
              return (
                <div key={index} className={`${containerBase} ${containerStyles}`}>
                  <div className="flex-1 min-w-0">
                    <div className={`${isBestScore ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                      {formatTime(entry.ms)}
                    </div>
                    <div className="text-gray-600 text-[11px] leading-tight">
                      {formatDate(entry.at)}
                    </div>
                  </div>
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {isNewBest && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-4 h-4 text-amber-500"
                        aria-label="New best time"
                      >
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                      </svg>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Last sets found */}
      {recentClaims.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">Last sets found</div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recentClaims.map((claim, index) => (
              <div key={index} className="text-xs">
                <div className="flex gap-1">
                  {claim.cards.map((cardId) => (
                    <div
                      key={cardId}
                      className="rounded overflow-hidden border border-gray-200 bg-white aspect-[4/3] h-10 md:h-12 flex items-center justify-center"
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

export default SolitaireSidebar

