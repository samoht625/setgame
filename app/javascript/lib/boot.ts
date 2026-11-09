import type { DailyStatus } from './solo_api'
import type { PuzzleStatus } from './puzzle_api'
import { dailyDate } from './daily'
import { getPlayerId, isNewPlayer } from './player_id'

/** A friend's result from the shared link this page was opened with (?r=). */
export type SharedResult = { kind: 'daily' | 'puzzle'; number: number; elapsed_ms: number; rank?: number | null; total?: number | null }

type Boot = { player_id: string | null; daily?: DailyStatus; puzzle?: PuzzleStatus; shared?: SharedResult | null }
type Statuses = { daily: DailyStatus; puzzle: PuzzleStatus }
type Known = { [K in keyof Statuses]?: { status: Statuses[K]; playerId: string } }

let known: Known | null = null
let boot: Boot | null | undefined
const listeners = new Set<() => void>()

function bootData(): Boot | null {
  if (boot !== undefined) return boot
  try {
    boot = JSON.parse(document.getElementById('setgame-boot')?.textContent || 'null') as Boot | null
  } catch {
    boot = null
  }
  return boot
}

/** The shared result this page was opened with, for the game it's from. Anyone may see it; it's in the link. */
export function sharedResult(kind: SharedResult['kind']): SharedResult | null {
  const shared = bootData()?.shared
  return shared?.kind === kind ? shared : null
}

function seed(): Known {
  if (known) return known
  known = {}
  const data = bootData()
  if (!data) return known
  const mine = data.player_id ? data.player_id === getPlayerId() : isNewPlayer()
  if (!mine) return known
  const playerId = getPlayerId()
  if (data.daily) known.daily = { status: data.daily, playerId }
  if (data.puzzle) known.puzzle = { status: data.puzzle, playerId }
  return known
}

/**
 * The latest status for `kind` this page has seen: first the one the server
 * rendered into the page (HomeController#load_boot_statuses), then each one
 * fetched since. Lets every mount (a hard refresh or a switch between games)
 * paint the right card and next game at once; callers still fetch fresh.
 * Only today's and only for the current player. Null otherwise.
 */
export function knownStatus<K extends keyof Statuses>(kind: K): Statuses[K] | null {
  const entry = seed()[kind] as { status: Statuses[K]; playerId: string } | undefined
  if (!entry || entry.status.date !== dailyDate() || entry.playerId !== getPlayerId()) return null
  return entry.status
}

/** Records a status just fetched from the server for this player. */
export function rememberStatus<K extends keyof Statuses>(kind: K, status: Statuses[K]): Statuses[K] {
  ;(seed() as Record<string, unknown>)[kind] = { status, playerId: getPlayerId() }
  listeners.forEach(listener => listener())
  return status
}

/** Calls `listener` whenever a newer status is remembered; returns the unsubscribe. */
export function onStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
