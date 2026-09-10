import React from 'react'
import RecentSets from '../components/RecentSets'
import type { LeaderboardEntry } from '../lib/solo_api'
import { formatTime } from './time'

interface BestTime {
  ms: number
  at: string
}

interface RecentClaim {
  cards: number[]
}

export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly'

interface SolitairePanelProps {
  isFinished: boolean
  recentClaims: RecentClaim[]
  leaderboard: LeaderboardEntry[]
  personalBest: LeaderboardEntry | null
  scoresLoading: boolean
  scoresError: string | null
  personalBestError?: string | null
  onRetryScores: () => void
  period: LeaderboardPeriod
  onPeriodChange: (period: LeaderboardPeriod) => void
}

const BEST_TIMES_KEY = 'setgame_solo_best_times'
const PERIODS: LeaderboardPeriod[] = ['daily', 'weekly', 'monthly']

// Gold / silver / bronze badges for the top three leaderboard ranks
const RANK_BADGES: string[] = [
  'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300'
]

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">{children}</div>
)

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
    const times: unknown = JSON.parse(stored)
    if (!Array.isArray(times)) return []
    return times.filter((time): time is BestTime => (
      time !== null && typeof time === 'object' &&
      Number.isFinite(time.ms) && time.ms >= 0 &&
      typeof time.at === 'string' && Number.isFinite(Date.parse(time.at))
    )).sort((a, b) => a.ms - b.ms).slice(0, 5)
  } catch {
    return []
  }
}

/**
 * Everything that isn't the board: the leaderboard, your own times and the
 * last sets you found. Lives in the side panel so it's a tap away, not
 * on-screen all the time.
 */
const SolitairePanel: React.FC<SolitairePanelProps> = ({
  isFinished,
  recentClaims,
  leaderboard,
  personalBest,
  scoresLoading,
  scoresError,
  personalBestError = null,
  onRetryScores,
  period,
  onPeriodChange
}) => {
  const [bestTimes, setBestTimes] = React.useState<BestTime[]>(loadBestTimes)

  React.useEffect(() => {
    setBestTimes(loadBestTimes())
  }, [isFinished])

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

  return (
    <div>
      <div className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
        {PERIODS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            aria-pressed={period === p}
            className={`min-h-9 flex-1 rounded-md px-2.5 text-xs font-medium capitalize transition-colors ${
              period === p
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-neutral-100'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {personalBest && (
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 dark:bg-emerald-950/40">
          <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">Your best</span>
          <span className="text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
            {formatTime(personalBest.elapsed_ms)}
          </span>
        </div>
      )}

      {personalBestError && (
        <div className="mt-2.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-200">
          <p role="status">{personalBestError}</p>
          <button type="button" onClick={onRetryScores} className="min-h-9 rounded-md font-medium underline underline-offset-4">Retry your best times</button>
        </div>
      )}

      {scoresLoading ? (
        <p role="status" className="mt-2.5 rounded-xl bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">Loading times…</p>
      ) : scoresError ? (
        <div className="mt-2.5 rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center dark:border-neutral-700">
          <p role="status" className="text-xs text-neutral-600 dark:text-neutral-300">{scoresError}</p>
          <button type="button" onClick={onRetryScores} className="mt-1 min-h-9 rounded-md px-3 text-xs font-medium underline underline-offset-4">Try again</button>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="mt-2.5 rounded-xl border border-dashed border-neutral-200 px-3 py-6 text-center dark:border-neutral-700">
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            No times yet — finish a game to claim the top spot.
          </p>
        </div>
      ) : (
        <ol className="mt-2 space-y-0.5">
          {leaderboard.map((entry, index) => (
            <li
              key={`${entry.player_id}-${entry.completed_at}-${index}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
                  RANK_BADGES[index] ?? 'text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {entry.display_name || 'Anonymous'}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {formatTime(entry.elapsed_ms)}
                </span>
                <span className="text-[10px] text-neutral-600 dark:text-neutral-300">
                  {formatDate(entry.completed_at)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {bestTimes.length > 0 && (
        <div className="mt-5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <SectionLabel>My times</SectionLabel>
          <ol className="mt-1.5 space-y-0.5">
            {bestTimes.map((entry, index) => {
              const isBest = index === 0
              const isNewest = isFinished && entry.at === newestAt
              return (
                <li
                  key={`${entry.at}-${entry.ms}`}
                  className={`flex items-center justify-between rounded-lg px-2 py-1.5 ${
                    isNewest ? 'bg-amber-50 dark:bg-amber-950/40' : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`text-sm tabular-nums ${
                        isBest
                          ? 'font-semibold text-neutral-900 dark:text-neutral-100'
                          : 'text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {formatTime(entry.ms)}
                    </span>
                    {isBest && (
                      <span className="rounded-full bg-neutral-900 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">
                        Best
                      </span>
                    )}
                    {isNewest && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                        New
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-neutral-600 dark:text-neutral-300">{formatDate(entry.at)}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <RecentSets claims={recentClaims} />
    </div>
  )
}

export default SolitairePanel
