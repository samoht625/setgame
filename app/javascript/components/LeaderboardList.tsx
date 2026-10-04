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
  detail: (entry: T) => string
  highlightPlayerId?: string
}

function LeaderboardList<T extends LeaderboardEntry>({ entries, detail, highlightPlayerId }: LeaderboardListProps<T>) {
  return (
    <ol className="mt-2 space-y-0.5">
      {entries.map((entry, index) => {
        const isMine = highlightPlayerId !== undefined && entry.player_id === highlightPlayerId
        return (
          <li
            key={`${entry.player_id}-${entry.completed_at}-${index}`}
            aria-current={isMine ? 'true' : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${isMine ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}
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
              <span className="text-[10px] text-neutral-600 dark:text-neutral-300">{detail(entry)}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default LeaderboardList
