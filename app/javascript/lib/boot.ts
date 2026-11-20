import type { DailyStatus } from './solo_api'
import type { PuzzleStatus } from './puzzle_api'
import { dailyDate } from './daily'
import { getPlayerId, isNewPlayer } from './player_id'

/** A friend's result from the shared link this page was opened with (?r=). */
export type SharedResult = { kind: 'daily' | 'puzzle'; number: number; elapsed_ms: number; rank?: number | null; total?: number | null }

export const BOOT_FRESH_MS = 30_000

type Boot = { player_id: string | null; daily?: DailyStatus; puzzle?: PuzzleStatus; shared?: SharedResult | null }
type Statuses = { daily: DailyStatus; puzzle: PuzzleStatus }
type KnownEntry<K extends keyof Statuses> = { status: Statuses[K]; playerId: string; hydratedAt: number }
type Known = { [K in keyof Statuses]?: KnownEntry<K> }

let known: Known | null = null
let boot: Boot | null | undefined
let bootedAt: number | null = null
const listeners = new Set<() => void>()

function bootData(): Boot | null {
  if (boot !== undefined) return boot
  try {
    boot = JSON.parse(document.getElementById('setgame-boot')?.textContent || 'null') as Boot | null
    if (boot) bootedAt = Date.now()
  } catch {
    boot = null
  }
  return boot
}

/** Timestamp (ms) when `setgame-boot` was parsed, or null if no boot payload existed. */
export function bootTimestamp(): number | null {
  bootData()
  return bootedAt
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
  const hydratedAt = bootedAt ?? Date.now()
  if (data.daily) known.daily = { status: data.daily, playerId, hydratedAt }
  if (data.puzzle) known.puzzle = { status: data.puzzle, playerId, hydratedAt }
  return known
}

/**
 * The latest status for `kind` this page has seen: first the one the server
 * rendered into the page (HomeController#load_boot_statuses), then each one
 * fetched since. Lets every mount (a hard refresh or a switch between games)
 * paint the right card and next game at once.
 * Only today's and only for the current player. Null otherwise.
 */
export function knownStatus<K extends keyof Statuses>(kind: K): Statuses[K] | null {
  const entry = seed()[kind] as KnownEntry<K> | undefined
  if (!entry || entry.status.date !== dailyDate() || entry.playerId !== getPlayerId()) return null
  return entry.status
}

/**
 * True when `knownStatus(kind)` is populated for today and the current player
 * and was hydrated (from boot JSON or an API fetch) less than `maxAgeMs` ago.
 */
export function isStatusFresh(kind: keyof Statuses, maxAgeMs = BOOT_FRESH_MS, now = Date.now()): boolean {
  const entry = seed()[kind]
  if (!entry || entry.status.date !== dailyDate() || entry.playerId !== getPlayerId()) return false
  return now - entry.hydratedAt < maxAgeMs
}

/** Records a status just fetched from the server for this player. */
export function rememberStatus<K extends keyof Statuses>(kind: K, status: Statuses[K]): Statuses[K] {
  ;(seed() as Record<string, unknown>)[kind] = { status, playerId: getPlayerId(), hydratedAt: Date.now() }
  listeners.forEach(listener => listener())
  return status
}

/** Calls `listener` whenever a newer status is remembered; returns the unsubscribe. */
export function onStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
