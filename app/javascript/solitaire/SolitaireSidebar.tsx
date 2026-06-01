import React from 'react'
import type { SoloStatus } from './SolitaireGame'

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
  setsFound: number
  status: SoloStatus
  onTogglePause: () => void
  onRestart: () => void
  recentClaims: RecentClaim[]
}

const BEST_TIMES_KEY = 'setgame_solo_best_times'

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{children}</div>
)

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatDate(isoString: string): string {
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date)
}

function loadBestTimes(): BestTime[] {
  try {
    const stored = localStorage.getItem(BEST_TIMES_KEY)
    if (!stored) return []
    const times = JSON.parse(stored) as BestTime[]
    return times.sort((a, b) => a.ms - b.ms).slice(0, 5)
  } catch {
    return []
  }
}

const SolitaireSidebar: React.FC<SolitaireSidebarProps> = ({
  elapsedMs,
  deckCount,
  setsFound,
  status,
  onTogglePause,
  onRestart,
  recentClaims
}) => {
  const isFinished = status === 'round_over'
  const isPaused = status === 'paused'

  const [bestTimes, setBestTimes] = React.useState<BestTime[]>(loadBestTimes)

  React.useEffect(() => {
    setBestTimes(loadBestTimes())
  }, [isFinished])

  // The newest entry (by timestamp) gets highlighted after a finished round
  const newestAt = React.useMemo(() => {
    let newest = ''
    let newestTs = 0
    for (const t of bestTimes) {
      const ts = Date.parse(t.at)
      if (!Number.isNaN(ts) && ts > newestTs) {
        newestTs = ts
        newest = t.at
      }
    }
    return newest
  }, [bestTimes])

  const statusChip = isFinished
    ? { label: 'Finished', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' }
    : isPaused
      ? { label: 'Paused', classes: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200' }
      : { label: 'In play', classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      {/* Timer */}
      <div className="flex items-center justify-between">
        <SectionLabel>Time</SectionLabel>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChip.classes}`}>
          {statusChip.label}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="text-4xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
          {formatTime(elapsedMs)}
        </div>
        <div className="flex items-center gap-1">
          {!isFinished && (
            <button
              type="button"
              onClick={onTogglePause}
              className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title={isPaused ? 'Resume' : 'Pause'}
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            className="rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="New game"
            aria-label="New game"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm dark:border-neutral-800">
        <span className="text-neutral-500 dark:text-neutral-400">
          <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{deckCount}</span> cards left
        </span>
        <span className="text-neutral-500 dark:text-neutral-400">
          <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{setsFound}</span> sets found
        </span>
      </div>

      {/* Finished round summary */}
      {isFinished && (
        <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
          <div className="text-sm text-neutral-700 dark:text-neutral-300">
            Cleared the deck in <span className="font-semibold tabular-nums">{formatTime(elapsedMs)}</span>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Play again
          </button>
        </div>
      )}

      {/* Best times */}
      {bestTimes.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <SectionLabel>Best times</SectionLabel>
          <ol className="mt-2 space-y-1">
            {bestTimes.map((entry, index) => {
              const isBest = index === 0
              const isNewest = isFinished && entry.at === newestAt
              return (
                <li
                  key={`${entry.at}-${entry.ms}`}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
                    isNewest ? 'bg-amber-50 dark:bg-amber-950/50' : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`tabular-nums ${isBest ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}`}
                    >
                      {formatTime(entry.ms)}
                    </span>
                    {isBest && isNewest && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="h-3.5 w-3.5 text-amber-500"
                        aria-label="New best time"
                      >
                        <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                      </svg>
                    )}
                  </span>
                  <span className="text-xs text-neutral-400">{formatDate(entry.at)}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {/* Recent sets */}
      {recentClaims.length > 0 && (
        <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <SectionLabel>Last sets found</SectionLabel>
          <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {recentClaims.map((claim, index) => (
              <li key={index} className="flex gap-1">
                {claim.cards.map((cardId) => (
                  <img
                    key={cardId}
                    src={`/cards/${cardId}.png`}
                    alt={`Card ${cardId}`}
                    draggable={false}
                    className="h-9 w-auto rounded border border-neutral-200 bg-white object-contain md:h-10 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SolitaireSidebar
