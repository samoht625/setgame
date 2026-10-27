import type { DailyStatus } from './solo_api'
import type { PuzzleStatus } from './puzzle_api'
import { dailyDate } from './daily'
import { getPlayerId, isNewPlayer } from './player_id'

type Boot = { player_id: string | null; daily?: DailyStatus; puzzle?: PuzzleStatus }
type Statuses = { daily: DailyStatus; puzzle: PuzzleStatus }

let boot: Boot | null | undefined
const taken = new Set<string>()

function read(): Boot | null {
  if (boot !== undefined) return boot
  try {
    boot = JSON.parse(document.getElementById('setgame-boot')?.textContent || 'null') as Boot | null
  } catch {
    boot = null
  }
  return boot
}

/**
 * Today's status for `kind` as the server rendered it into the page (see
 * HomeController#load_boot_statuses), so the first paint shows the right
 * card. Only for this browser's player, only today's, and only once per page
 * load; later mounts (switching games) fetch fresh. Null otherwise.
 */
export function takeBootStatus<K extends keyof Statuses>(kind: K): Statuses[K] | null {
  if (taken.has(kind)) return null
  taken.add(kind)
  const data = read()
  const status = data?.[kind] as Statuses[K] | undefined
  if (!data || !status || status.date !== dailyDate()) return null
  const mine = data.player_id ? data.player_id === getPlayerId() : isNewPlayer()
  return mine ? status : null
}
