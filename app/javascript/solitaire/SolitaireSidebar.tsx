import React from 'react'
import RecentSets from '../components/RecentSets'
import ScoreValue from '../components/ScoreValue'
import type { SoloStatus } from './SolitaireGame'
import type { LeaderboardEntry } from '../lib/solo_api'

interface BestTime {
  ms: number
  at: string
}

interface RecentClaim {
  cards: number[]
}

type Period = 'daily' | 'weekly' | 'monthly'

export interface SoloControlsProps {
  elapsedMs: number
  startedAtMs: number
  isStarting: boolean
  deckCount: number
  setsFound: number
  status: SoloStatus
  onTogglePause: () => void
  onRestart: () => void
  submitting?: boolean
  submissionError: string | null
  onRetrySubmission: () => void
  claimAnimationKey?: string | number | null
  children?: React.ReactNode
}

interface LeaderboardProps {
  leaderboard: LeaderboardEntry[]
  personalBest: LeaderboardEntry | null
  personalBestError?: string | null
  scoresLoading: boolean
  scoresError: string | null
  onRetryScores: () => void
  period: Period
  onPeriodChange: (period: Period) => void
}

export interface SolitaireSidebarProps extends LeaderboardProps {
  isFinished: boolean
  recentClaims: RecentClaim[]
}

const BEST_TIMES_KEY = 'setgame_solo_best_times'
const PERIODS: Period[] = ['daily', 'weekly', 'monthly']
const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
})

const RANK_BADGES: string[] = [
  'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200'
]

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">{children}</div>
)

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatDate(isoString: string): string {
  return DATE_FORMATTER.format(new Date(isoString))
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

const SoloTimer = React.memo(function SoloTimer({ startedAtMs, elapsedMs, running, loading }: {
  startedAtMs: number
  elapsedMs: number
  running: boolean
  loading: boolean
}) {
  const [now, setNow] = React.useState(Date.now)

  React.useEffect(() => {
    if (!running) return
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running, startedAtMs])

  return (
    <div role="timer" aria-label="Elapsed time" className="text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 lg:text-4xl dark:text-neutral-100">
      {loading ? '—' : formatTime(Math.max(0, running ? now - startedAtMs : elapsedMs))}
    </div>
  )
})

export const SoloControls = React.memo(function SoloControls({
  elapsedMs,
  startedAtMs,
  isStarting,
  deckCount,
  setsFound,
  status,
  onTogglePause,
  onRestart,
  submitting = false,
  submissionError,
  onRetrySubmission,
  claimAnimationKey,
  children
}: SoloControlsProps) {
  const isFinished = status === 'round_over'
  const isPaused = status === 'paused'
  const statusChip = isStarting
    ? { label: 'Dealing', classes: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300' }
    : isFinished
      ? { label: 'Finished', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' }
      : isPaused
        ? { label: 'Paused', classes: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200' }
        : { label: 'In play', classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 lg:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 lg:grid-cols-2">
        <div className="col-span-2 mb-0.5 flex items-center justify-between gap-2 lg:mb-1">
          <SectionLabel>Time</SectionLabel>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium lg:px-2.5 lg:text-xs ${statusChip.classes}`}>
            {statusChip.label}
          </span>
        </div>
        <div className="col-start-1 row-start-2">
          <SoloTimer startedAtMs={startedAtMs} elapsedMs={elapsedMs} running={!isStarting && status === 'playing'} loading={isStarting} />
        </div>
        <div className="col-start-3 row-span-2 row-start-1 flex items-center gap-0.5 lg:col-start-2 lg:row-span-1 lg:row-start-2 lg:justify-self-end">
          {!isFinished && (
            <button
              type="button"
              onClick={onTogglePause}
              disabled={isStarting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              title={isPaused ? 'Resume' : 'Pause'}
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onRestart}
            disabled={isStarting}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            title="New game"
            aria-label="New game"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
          </button>
        </div>
        <div className="col-start-2 row-start-2 flex flex-col items-end gap-0.5 text-[11px] text-neutral-600 sm:text-xs lg:col-span-2 lg:col-start-1 lg:row-start-3 lg:mt-4 lg:flex-row lg:items-center lg:justify-between lg:border-t lg:border-neutral-100 lg:pt-3 lg:text-sm dark:text-neutral-300 lg:dark:border-neutral-800">
          <span className="whitespace-nowrap">
            <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{deckCount}</span> cards left
          </span>
          <span className="whitespace-nowrap">
            <ScoreValue value={setsFound} animationKey={claimAnimationKey} className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100" /> {setsFound === 1 ? 'set' : 'sets'} found
          </span>
        </div>
      </div>

      {submitting && (
        <p role="status" className="mt-2 text-xs text-blue-700 dark:text-blue-300">Submitting…</p>
      )}
      {submissionError && !submitting && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p role="status">{submissionError}</p>
          <button type="button" onClick={onRetrySubmission} className="mt-1 min-h-11 rounded-md px-1 font-semibold underline underline-offset-4">Retry submission</button>
        </div>
      )}

      {children}

      {isFinished && !isStarting && (
        <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/50">
          <div className="text-sm text-neutral-700 dark:text-neutral-300">
            Cleared the deck in <span className="font-semibold tabular-nums">{formatTime(elapsedMs)}</span>
          </div>
          <button
            type="button"
            onClick={onRestart}
            className="min-h-11 w-full rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
          >
            Play again
          </button>
        </div>
      )}
    </div>
  )
})

const SoloLeaderboard = React.memo(function SoloLeaderboard({
  leaderboard, personalBest, personalBestError, scoresLoading, scoresError, onRetryScores, period, onPeriodChange
}: LeaderboardProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Leaderboard</SectionLabel>
        <div className="flex shrink-0 rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
          {PERIODS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              aria-pressed={period === p}
              className={`min-h-11 rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
                period === p
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-600 dark:text-neutral-100'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {personalBest && (
        <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5 dark:bg-emerald-950/40">
          <span className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200">Your best</span>
          <span className="text-xs font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
            {formatTime(personalBest.elapsed_ms)}
          </span>
        </div>
      )}

      {personalBestError && (
        <div className="mt-2.5 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-200">
          <p role="status">{personalBestError}</p>
          <button type="button" onClick={onRetryScores} className="min-h-11 rounded-md font-medium underline underline-offset-4">Retry your best times</button>
        </div>
      )}

      {scoresLoading ? (
        <p role="status" className="mt-2.5 rounded-xl bg-neutral-50 px-3 py-5 text-center text-xs text-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-300">Loading times…</p>
      ) : scoresError ? (
        <div className="mt-2.5 rounded-xl border border-dashed border-neutral-300 px-3 py-3 text-center dark:border-neutral-700">
          <p role="status" className="text-xs text-neutral-600 dark:text-neutral-300">{scoresError}</p>
          <button type="button" onClick={onRetryScores} className="mt-1 min-h-11 rounded-md px-3 text-xs font-medium text-neutral-700 underline underline-offset-4 dark:text-neutral-200">Try again</button>
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="mt-2.5 rounded-xl border border-dashed border-neutral-300 px-3 py-5 text-center dark:border-neutral-700">
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            No times yet — finish a game to claim the top spot.
          </p>
        </div>
      ) : (
        <ol className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto">
          {leaderboard.map((entry, index) => (
            <li key={`${entry.player_id}-${entry.completed_at}-${index}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${RANK_BADGES[index] ?? 'text-neutral-600 dark:text-neutral-300'}`}>
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">
                {entry.display_name || 'Anonymous'}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-xs font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                  {formatTime(entry.elapsed_ms)}
                </span>
                <span className="text-[10px] text-neutral-600 dark:text-neutral-300">{formatDate(entry.completed_at)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
})

const SoloBestTimes = React.memo(function SoloBestTimes({ isFinished }: { isFinished: boolean }) {
  const [bestTimes, setBestTimes] = React.useState<BestTime[]>(loadBestTimes)

  React.useEffect(() => {
    setBestTimes(loadBestTimes())
  }, [isFinished])

  const newestAt = React.useMemo(() => {
    let newest = ''
    let newestTs = 0
    for (const time of bestTimes) {
      const timestamp = Date.parse(time.at)
      if (timestamp > newestTs) {
        newestTs = timestamp
        newest = time.at
      }
    }
    return newest
  }, [bestTimes])

  if (bestTimes.length === 0) return null

  return (
    <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <SectionLabel>My times</SectionLabel>
      <ol className="mt-1.5 space-y-0.5">
        {bestTimes.map((entry, index) => {
          const isBest = index === 0
          const isNewest = isFinished && entry.at === newestAt
          return (
            <li key={`${entry.at}-${entry.ms}`} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${isNewest ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className={`text-sm tabular-nums ${isBest ? 'font-semibold text-neutral-900 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-300'}`}>
                  {formatTime(entry.ms)}
                </span>
                {isBest && (
                  <span className="rounded-full bg-neutral-900 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-white dark:bg-neutral-100 dark:text-neutral-900">Best</span>
                )}
                {isNewest && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900 dark:text-amber-200">New</span>
                )}
              </span>
              <span className="shrink-0 text-[11px] text-neutral-600 dark:text-neutral-300">{formatDate(entry.at)}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
})

const SolitaireSidebar = React.memo(function SolitaireSidebar({ isFinished, recentClaims, ...leaderboardProps }: SolitaireSidebarProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 md:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <SoloLeaderboard {...leaderboardProps} />
      <SoloBestTimes isFinished={isFinished} />
      <RecentSets claims={recentClaims} />
    </div>
  )
})

export default SolitaireSidebar
