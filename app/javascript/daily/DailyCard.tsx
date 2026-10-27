import React, { useId, useState } from 'react'
import { formatTime } from '../solitaire/time'
import { track } from '../lib/analytics'
import { formatCountdown, ordinal, type DailyShare } from '../lib/daily'
import MarkGrid from '../components/MarkGrid'
import type { DailyEntry, DailyStatus } from '../lib/solo_api'
import DailyCompare from './DailyCompare'
import { DailyStandings } from './DailyPanel'
import { primaryButton, secondaryButton, secondaryButtonSmall } from '../lib/buttons'
import { openSignInDialog } from '../components/SignInDialog'
import { openReminderDialog } from '../components/ReminderDialog'
import { signedInEmail, signInEnabled } from '../lib/player_id'
import { useReminder } from '../hooks/useReminder'
export { primaryButton, secondaryButton }

const LEADERBOARD_SIZE = 10

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
  /** Heading; defaults to the Daily Deal's. */
  title?: string
  /** The other daily mode, offered next to Share. */
  next?: { href: string; label: string }
  /** What rolls over at midnight, e.g. "deal" or "puzzle". */
  noun?: string
  emptyText?: string
  /** What the grid of squares under the time shows, for screen readers. */
  marksLabel?: string
}

/** What the Daily Deal (and the Puzzle) show once today's try is used: the result, today's leaderboard and what's next. */
const DailyCard: React.FC<DailyCardProps> = ({
  number, result, streak, note, status, statusError, onRetryStatus, playerId, nowMs, onShare, shareNote, onNextDeal, stale = false, onNameScore,
  title, next = { href: '/puzzle', label: 'Puzzle' }, noun = 'deal', emptyText, marksLabel = 'Your pace on each set'
}) => {
  const titleId = useId()
  const reminder = useReminder()
  // Offered once per card: until the reminder is on, then it goes quiet.
  const offerReminder = signInEnabled() && !(signedInEmail() && reminder?.enabled)
  const [comparing, setComparing] = useState<DailyEntry | null>(null)
  const msLeft = status ? Date.parse(status.next_at) - nowMs : null
  // Other finishers' runs are only for a player who has finished this deal too.
  const canCompare = !stale && Boolean(status?.me.result?.replay)
  const compare = (entry: DailyEntry) => {
    setComparing(entry)
    track('daily_compare', { rank: status!.leaderboard.indexOf(entry) + 1 })
  }
  const rank = result?.rank !== undefined && result.total !== undefined ? `${ordinal(result.rank)} of ${result.total}` : ''

  return (
    <main className="mx-auto w-full max-w-sm px-3 pb-safe pt-4 sm:pt-10">
      <section
        aria-labelledby={titleId}
        className="overflow-hidden rounded-2xl border border-neutral-200 bg-white text-center shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        <div className="px-5 pb-4 pt-4">
          <h1 id={titleId} className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {title ?? `Daily Deal #${number}`}
          </h1>
          {result ? (
            <>
              <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
                {formatTime(result.elapsedMs)}
              </div>
              <p className="mt-0.5 min-h-5 text-sm text-neutral-500 dark:text-neutral-400">
                {rank && <span>{rank}</span>}
                {rank && streak > 0 && <span aria-hidden="true"> · </span>}
                {streak > 0 && <span className="font-medium text-emerald-700 dark:text-emerald-300">{streak}-day streak</span>}
              </p>
              {result.marks && (
                <div className="mt-3 flex justify-center">
                  <MarkGrid marks={result.marks} label={marksLabel} />
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">You’ve used today’s try.</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">It wasn’t finished, so it isn’t on the leaderboard.</p>
              {streak > 0 && <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{streak}-day streak</p>}
            </>
          )}
          {note}
          <div className="mt-4 flex gap-2">
            {onShare && (
              <button type="button" onClick={onShare} className={`${primaryButton} flex-1`}>
                Share
              </button>
            )}
            <a href={next.href} className={`${onShare ? secondaryButton : primaryButton} inline-flex flex-1 items-center justify-center`}>
              {next.label}
            </a>
          </div>
          {shareNote && <p role="status" className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">{shareNote}</p>}
          {result && offerReminder && (
            <button
              type="button"
              onClick={() => (signedInEmail() ? openReminderDialog() : openSignInDialog({ reminder: true, source: 'card' }))}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
            >
              <BellIcon />
              Email me a daily reminder
            </button>
          )}
        </div>

        <div className="border-t border-neutral-100 px-5 py-4 text-left dark:border-neutral-800">
          <DailyStandings
            status={status}
            error={statusError}
            onRetry={onRetryStatus}
            playerId={playerId}
            limit={LEADERBOARD_SIZE}
            label="Leaderboard"
            onNameScore={onNameScore}
            onCompare={canCompare ? compare : undefined}
            emptyText={emptyText}
            aside={msLeft === null ? undefined : !stale && msLeft > 0 ? (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Next {noun} in {formatCountdown(msLeft)}</span>
            ) : (
              <button type="button" onClick={onNextDeal} className={secondaryButtonSmall}>
                Play today’s {noun}
              </button>
            )}
          />
        </div>
        {comparing && status && (
          <DailyCompare date={status.date} number={status.number} opponent={comparing} onClose={() => setComparing(null)} />
        )}
      </section>
    </main>
  )
}

const BellIcon: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
)

export default DailyCard
