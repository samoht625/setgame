import React, { useId } from 'react'
import { formatTime } from '../solitaire/time'
import { formatCountdown, ordinal, type DailyShare } from '../lib/daily'
import type { DailyStatus } from '../lib/solo_api'
import { DailyStandings } from './DailyPanel'

const LEADERBOARD_SIZE = 10

export const primaryButton = 'min-h-11 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300'
export const secondaryButton = 'min-h-11 rounded-full border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800'

interface DailyCardProps {
  number: number
  /** Null when today's try was started but never finished. */
  result: (DailyShare & { rank?: number; total?: number }) | null
  streak: number
  /** Submission state of a just-finished run. */
  note?: React.ReactNode
  status: DailyStatus | null
  statusError: boolean
  onRetryStatus: () => void
  playerId: string
  nowMs: number
  onShare?: () => void
  shareNote: string | null
  onNextDeal: () => void
  /** The result shown is from an earlier day (a run finished after midnight), so today's deal is already open. */
  stale?: boolean
  /** Set when the player's score is Anonymous and they can put a name on it. */
  onNameScore?: (name: string) => Promise<boolean>
}

/** What /daily shows once today's try is used: the result, today's leaderboard and what's next. */
const DailyCard: React.FC<DailyCardProps> = ({
  number, result, streak, note, status, statusError, onRetryStatus, playerId, nowMs, onShare, shareNote, onNextDeal, stale = false, onNameScore
}) => {
  const titleId = useId()
  const msLeft = status ? Date.parse(status.next_at) - nowMs : null
  const rank = result?.rank !== undefined && result.total !== undefined ? `${ordinal(result.rank)} of ${result.total}` : ''

  return (
    <main className="mx-auto w-full max-w-sm px-3 pb-safe pt-4 sm:pt-10">
      <section
        aria-labelledby={titleId}
        className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="px-5 pb-5 pt-4">
          <h1 id={titleId} className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Set Daily #{number}
          </h1>
          {result ? (
            <>
              <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
                {formatTime(result.elapsedMs)}
              </div>
              <div className="mt-0.5 min-h-5 text-sm text-neutral-500 dark:text-neutral-400">{rank}</div>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">You’ve used today’s try.</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">It wasn’t finished, so it isn’t on the leaderboard.</p>
            </>
          )}
          {streak > 0 && (
            <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{streak}-day streak</p>
          )}
          {note}
          <div className="mt-4 flex gap-2">
            {onShare && (
              <button type="button" onClick={onShare} className={`${primaryButton} flex-1`}>
                Share
              </button>
            )}
            <a href="/" className={`${onShare ? secondaryButton : primaryButton} inline-flex flex-1 items-center justify-center`}>
              Play solo
            </a>
          </div>
          {shareNote && <p role="status" className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">{shareNote}</p>}
        </div>

        <div className="border-t border-neutral-100 px-5 py-4 text-left dark:border-neutral-800">
          <DailyStandings status={status} error={statusError} onRetry={onRetryStatus} playerId={playerId} limit={LEADERBOARD_SIZE} label="Today’s leaderboard" onNameScore={onNameScore} />
        </div>

        {msLeft !== null && (
          <div className="border-t border-neutral-100 px-5 py-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            {!stale && msLeft > 0 ? (
              <>Next deal in {formatCountdown(msLeft)}</>
            ) : (
              <button type="button" onClick={onNextDeal} className="min-h-9 font-medium text-neutral-900 underline underline-offset-4 dark:text-neutral-100">
                Play today’s deal
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default DailyCard
