import React, { useId, useState } from 'react'
import { secondaryButtonSmall } from '../lib/buttons'
import NameEditor from '../components/NameEditor'
import { getSavedName } from '../lib/player_name'
import LeaderboardList from '../components/LeaderboardList'
import { SectionLabel } from '../solitaire/SolitairePanel'
import { formatTime } from '../solitaire/time'
import { formatCountdown } from '../lib/daily'
import type { DailyEntry, DailyStatus } from '../lib/solo_api'

interface DailyStandingsProps {
  status: DailyStatus | null
  error: boolean
  onRetry: () => void
  playerId: string
  /** Show only the top of the leaderboard (the player's own row is always shown). */
  limit?: number
  /** Heading over the list; defaults to the deal's number. */
  label?: string
  /** Set when the player can put a name on their own (Anonymous) score. */
  onNameScore?: (name: string) => Promise<boolean>
  /** Set when the player has a finished run to compare against other finishers'. */
  onCompare?: (entry: DailyEntry) => void
  /** Shown while nobody has a time yet. */
  emptyText?: string
  /** Replaces the finisher count at the right of the heading (e.g. the countdown). */
  aside?: React.ReactNode
}

// Rows without a compare control keep its width, so the times stay in one column.
const compareSlot = 'flex h-8 w-8 shrink-0 -my-1.5 -mr-1'

const CompareButton: React.FC<{ entry: DailyEntry; onCompare: (entry: DailyEntry) => void }> = ({ entry, onCompare }) => (
  <button
    type="button"
    onClick={() => onCompare(entry)}
    aria-label={`Compare with ${entry.display_name || 'Anonymous'}`}
    title="Compare"
    className={`${compareSlot} items-center justify-center rounded-full text-[11px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100`}
  >
    vs
  </button>
)

/**
 * Under the player's own Anonymous row: a small "Add your name" action that
 * opens the name field in place. Nothing is focused until it's tapped, so a
 * phone keyboard doesn't cover the result.
 */
const NamePrompt: React.FC<{ onSave: (name: string) => Promise<boolean>; as?: 'li' | 'div' }> = ({ onSave, as: Tag = 'li' }) => {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  return (
    <Tag className="mt-1 block list-none pl-9">
      {open ? (
        <div role="group" aria-labelledby={titleId} className="flex">
          <span id={titleId} className="sr-only">Add your name to the leaderboard</span>
          <NameEditor compact initial={getSavedName() ?? ''} onSave={onSave} />
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={secondaryButtonSmall}>Add your name</button>
      )}
    </Tag>
  )
}

/** Today's leaderboard, with the player's row even when they are below the cut. */
export const DailyStandings: React.FC<DailyStandingsProps> = ({ status, error, onRetry, playerId, limit, label, onNameScore, onCompare, aside, emptyText = 'No times yet — clear today’s deal to take the top spot.' }) => {
  if (!status) {
    return error ? (
      <div className="mt-2 rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center dark:border-neutral-700">
        <p role="status" className="text-xs text-neutral-600 dark:text-neutral-300">Could not load today’s times.</p>
        <button type="button" onClick={onRetry} className={`${secondaryButtonSmall} mt-2`}>Try again</button>
      </div>
    ) : (
      <p role="status" className="mt-2 rounded-xl bg-neutral-50 px-3 py-6 text-center text-xs text-neutral-500 dark:bg-neutral-800/50 dark:text-neutral-400">Loading times…</p>
    )
  }

  const { result } = status.me
  const rankedBelowList = result && result.rank > status.leaderboard.length

  return (
    <div>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <SectionLabel>{label ?? `Daily Deal #${status.number}`}</SectionLabel>
        {aside ?? (
          <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
            {status.total} {status.total === 1 ? 'finisher' : 'finishers'}
          </span>
        )}
      </div>

      {status.leaderboard.length === 0 ? (
        <div className="mt-2 rounded-xl border border-dashed border-neutral-200 px-3 py-6 text-center dark:border-neutral-700">
          <p className="text-xs text-neutral-600 dark:text-neutral-300">{emptyText}</p>
        </div>
      ) : (
        <LeaderboardList
          entries={status.leaderboard}
          highlight={entry => entry.player_id === playerId}
          limit={limit}
          renderAfter={onNameScore ? (entry: DailyEntry, isMine) => (isMine && !entry.display_name ? <NamePrompt onSave={onNameScore} /> : null) : undefined}
          renderAction={onCompare ? (entry: DailyEntry, isMine) => (
            !isMine && entry.replay ? <CompareButton entry={entry} onCompare={onCompare} /> : <span aria-hidden="true" className={compareSlot} />
          ) : undefined}
        />
      )}

      {rankedBelowList && (
        <div aria-current="true" className="mt-1 flex items-center gap-2.5 rounded-lg bg-amber-50 px-2 py-1.5 dark:bg-amber-950/40">
          <span className="w-5 shrink-0 text-center text-[10px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">{result.rank}</span>
          <span className="min-w-0 flex-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">You</span>
          <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{formatTime(result.elapsed_ms)}</span>
          {onCompare && <span aria-hidden="true" className={compareSlot} />}
        </div>
      )}
      {rankedBelowList && onNameScore && <NamePrompt as="div" onSave={onNameScore} />}
    </div>
  )
}

interface DailyPanelProps {
  status: DailyStatus | null
  error: boolean
  onRetry: () => void
  playerId: string
  nowMs: number
  /** What rolls over at midnight, e.g. "deal" or "puzzle". */
  noun?: string
  label?: string
  emptyText?: string
}

/** Your streak, today's leaderboard and when the next deal lands. */
const DailyPanel: React.FC<DailyPanelProps> = ({ status, error, onRetry, playerId, nowMs, noun = 'deal', label, emptyText }) => {
  if (!status) return <DailyStandings status={status} error={error} onRetry={onRetry} playerId={playerId} />

  const { streak } = status.me
  const msLeft = Date.parse(status.next_at) - nowMs

  return (
    <div>
      <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
        streak > 0 ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-neutral-50 dark:bg-neutral-800/50'
      }`}>
        <span className={`text-xs font-medium ${streak > 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-neutral-600 dark:text-neutral-300'}`}>Your streak</span>
        <span className={`text-sm font-semibold tabular-nums ${streak > 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-neutral-600 dark:text-neutral-300'}`}>
          {streak} {streak === 1 ? 'day' : 'days'}
        </span>
      </div>

      <div className="mt-4">
        <DailyStandings status={status} error={error} onRetry={onRetry} playerId={playerId} label={label} emptyText={emptyText} />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
        {msLeft > 0 ? `Next ${noun} in ${formatCountdown(msLeft)}` : `A new ${noun} is ready`} · new {noun}s at midnight Pacific
      </p>
    </div>
  )
}

export default DailyPanel
