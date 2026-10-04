import React from 'react'
import type { LeaderboardEntry } from '../lib/solo_api'
import { formatTime } from '../solitaire/time'

// Gold / silver / bronze badges for the top three leaderboard ranks
const RANK_BADGES: string[] = [
  'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300'
]

interface LeaderboardListProps<T extends LeaderboardEntry> {
  entries: T[]
  /** The small line under each time. */
  detail?: (entry: T) => string
  /** Marks the player's own entry. */
  highlight?: (entry: T) => boolean
  /** Show only the top of the list, plus the player's own entry if it falls below. */
  limit?: number
}

function LeaderboardList<T extends LeaderboardEntry>({ entries, detail, highlight, limit }: LeaderboardListProps<T>) {
  const rows = entries.map((entry, index) => ({ entry, rank: index + 1, isMine: highlight?.(entry) ?? false }))
  let shown = rows
  if (limit !== undefined && rows.length > limit) {
    const mine = rows.slice(limit).find(row => row.isMine)
    shown = mine ? [...rows.slice(0, limit), mine] : rows.slice(0, limit)
  }

  return (
    <ol className="mt-2 space-y-0.5">
      {shown.map(({ entry, rank, isMine }, index) => (
        <React.Fragment key={`${entry.player_id}-${entry.completed_at}-${rank}`}>
          {index > 0 && rank > shown[index - 1]!.rank + 1 && (
            <li aria-hidden="true" className="px-2 text-center text-xs leading-3 text-neutral-400 dark:text-neutral-500">⋯</li>
          )}
          <li
            aria-current={isMine ? 'true' : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${isMine ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}
          >
            <span
              className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums ${
                RANK_BADGES[rank - 1] ?? 'text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {rank}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {entry.display_name || 'Anonymous'}
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
                {formatTime(entry.elapsed_ms)}
              </span>
              {detail && <span className="text-[10px] text-neutral-600 dark:text-neutral-300">{detail(entry)}</span>}
            </span>
          </li>
        </React.Fragment>
      ))}
    </ol>
  )
}

export default LeaderboardList
