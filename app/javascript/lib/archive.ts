import { isNewPlayer } from './player_id'
import { apiFetch, headers } from './solo_api'
import type { PuzzleClaim } from './puzzle_api'

// A past day's page (/daily/:number, /puzzle/:number) lets the day be played
// again as practice. Nothing about a practice run is sent to the server, and
// it is kept under its own key: the day's ranked saves are only ever read.
const SAVE_KEY = 'setgame_archive_v1'
// Must match SAVE_KEY in DailyGame.tsx and PuzzleGame.tsx.
const RANKED_SAVE_KEYS = { daily: 'setgame_daily_v1', puzzle: 'setgame_puzzle_v1' } as const

export type ArchiveKind = 'daily' | 'puzzle'

/** A closed day as its page describes it (ArchivedDay#play_data). */
export type ArchiveDay = {
  number: number
  /** YYYY-MM-DD */
  date: string
  /** How many players finished it on the day. */
  total: number
  /** The top of that day's leaderboard, fastest first. */
  times: number[]
} & (
  /** The Puzzle's 12 cards. */
  | { kind: 'puzzle'; cards: number[] }
  /** The Daily Deal's seed, which deals the whole game. */
  | { kind: 'daily'; seed: number }
)

/** The player's ranked result from the day itself. */
export type RankedResult = { elapsedMs: number; misses: number | null; rank?: number; total?: number; marks?: string }

/** A finished practice run. */
export type PracticeResult = { elapsedMs: number; misses: number; marks?: string; finishedAtMs: number }

export type PuzzlePractice = { kind: 'puzzle'; day: string; startedAtMs: number; found: PuzzleClaim[]; misses: number; attempts: string }
export type DealPractice = { kind: 'daily'; day: string; startedAtMs: number; board: number[]; deck: number[]; rngState: number; sets: number; misses: number }
export type PracticeRun = PuzzlePractice | DealPractice

type ArchiveSave = { results: Record<string, PracticeResult>; run: PracticeRun | null }

const isCard = (id: unknown) => Number.isInteger(id) && (id as number) >= 1 && (id as number) <= 81
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

export const dayKey = (day: ArchiveDay) => `${day.kind}:${day.number}`

/** The day in the page's data-archive attribute; null when it isn't one this script can deal. */
export function readArchiveDay(json: string | undefined): ArchiveDay | null {
  try {
    const day = JSON.parse(json || 'null') as unknown
    if (!isObject(day) || !isCount(day.number) || typeof day.date !== 'string' || !isCount(day.total)) return null
    if (!Array.isArray(day.times) || !day.times.every(isCount)) return null
    if (day.kind === 'puzzle') return Array.isArray(day.cards) && day.cards.length === 12 && day.cards.every(isCard) ? (day as ArchiveDay) : null
    return day.kind === 'daily' && Number.isFinite(day.seed) ? (day as ArchiveDay) : null
  } catch {
    return null
  }
}

function isResult(value: unknown): value is PracticeResult {
  return isObject(value) && isCount(value.elapsedMs) && isCount(value.misses) && Number.isFinite(value.finishedAtMs)
}

function isRun(value: unknown): value is PracticeRun {
  if (!isObject(value) || typeof value.day !== 'string' || !Number.isFinite(value.startedAtMs) || !isCount(value.misses)) return false
  if (value.kind === 'puzzle') return Array.isArray(value.found) && typeof value.attempts === 'string'
  if (value.kind !== 'daily') return false
  return Array.isArray(value.board) && Array.isArray(value.deck) && [...value.board, ...value.deck].every(isCard) && Number.isFinite(value.rngState) && isCount(value.sets)
}

function load(): ArchiveSave {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Partial<ArchiveSave> | null
    const results: Record<string, PracticeResult> = {}
    if (isObject(saved?.results)) {
      for (const [key, value] of Object.entries(saved.results)) if (isResult(value)) results[key] = value
    }
    return { results, run: isRun(saved?.run) ? saved.run : null }
  } catch {
    return { results: {}, run: null }
  }
}

function store(save: ArchiveSave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // Without storage the practice run lasts as long as the page.
  }
}

export function practiceResult(day: ArchiveDay): PracticeResult | null {
  return load().results[dayKey(day)] ?? null
}

/** The practice run of this day that was left unfinished, if any. */
export function practiceRun(day: ArchiveDay): PracticeRun | null {
  const run = load().run
  return run && run.day === dayKey(day) && run.kind === day.kind ? run : null
}

/** One practice run is kept at a time; starting another day's replaces it. */
export function savePracticeRun(run: PracticeRun | null): void {
  store({ ...load(), run })
}

export function savePracticeResult(day: ArchiveDay, result: PracticeResult): void {
  const save = load()
  store({ results: { ...save.results, [dayKey(day)]: result }, run: save.run?.day === dayKey(day) ? null : save.run })
}

/** The ranked run of this day that this browser still holds, if it was finished. Read only. */
export function savedRankedResult(day: Pick<ArchiveDay, 'kind' | 'date'>): RankedResult | null {
  try {
    const saved = JSON.parse(localStorage.getItem(RANKED_SAVE_KEYS[day.kind]) || 'null') as unknown
    const run = day.kind === 'daily' && isObject(saved) ? saved.ranked : saved
    if (!isObject(run) || run.date !== day.date || run.status !== 'finished' || !isCount(run.elapsedMs)) return null
    return {
      elapsedMs: run.elapsedMs,
      misses: isCount(run.misses) ? run.misses : null,
      marks: day.kind === 'puzzle' && typeof run.attempts === 'string' ? run.attempts : undefined
    }
  } catch {
    return null
  }
}

/**
 * The player's ranked result for this day from the server, which remembers
 * every day they played; null when they didn't finish it. A browser the
 * server has never seen can't have, so it isn't asked.
 */
export async function fetchRankedResult(day: ArchiveDay, signal?: AbortSignal): Promise<RankedResult | null> {
  if (isNewPlayer()) return null
  const res = await apiFetch(`/api/archive/${day.kind}/${day.number}`, { headers: headers(false), credentials: 'same-origin', signal })
  if (!res.ok) throw new Error('Could not load the result')
  const result = ((await res.json()) as { result: { elapsed_ms: number; misses: number | null; rank: number; total: number; marks: string } | null }).result
  return result && { elapsedMs: result.elapsed_ms, misses: result.misses, rank: result.rank, total: result.total, marks: result.marks || undefined }
}

/**
 * Where a practice time would have landed on the day's leaderboard, behind
 * anyone with the same time. Null when it's slower than every time the page
 * lists and there were more finishers than that.
 */
export function practicePlace(elapsedMs: number, day: ArchiveDay): number | null {
  const ahead = day.times.filter(time => time <= elapsedMs).length
  return ahead < day.times.length || day.times.length >= day.total ? ahead + 1 : null
}

/** A day's tile on /archive: its key ('puzzle:21') and date (YYYY-MM-DD). */
export type ArchiveTile = { key: string; kind: ArchiveKind; date: string }

/**
 * What the player has done with an archived day, as its tile shows it:
 * finished it when it was live (ranked), finished a practice run of it since,
 * left a practice run of it unfinished, or none of those.
 */
export type DayPlay =
  | { state: 'ranked'; elapsedMs: number }
  | { state: 'practice'; elapsedMs: number }
  | { state: 'running' }
  | { state: 'unplayed' }

/** What this browser remembers of the tiles' days: times by day key, and the day of the unfinished practice run. */
export type RememberedPlays = { ranked: Record<string, number>; practice: Record<string, number>; running: string | null }

/** The player's ranked times on record with the server, by day key. */
export type RankedTimes = Record<string, number>

const TILE_KEY = /^(daily|puzzle):[1-9][0-9]{0,5}$/
const TILE_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A tile from its data-archive-tile and data-archive-date attributes; null when they aren't a day's. */
export function readArchiveTile(key: string | undefined, date: string | undefined): ArchiveTile | null {
  if (!key || !date || !TILE_KEY.test(key) || !TILE_DATE.test(date)) return null
  return { key, kind: key.startsWith('puzzle') ? 'puzzle' : 'daily', date }
}

/** The plays of these days kept in this browser: finished ranked runs still saved, and practice. Read only. */
export function rememberedPlays(tiles: ArchiveTile[]): RememberedPlays {
  const save = load()
  const remembered: RememberedPlays = { ranked: {}, practice: {}, running: null }
  for (const tile of tiles) {
    const ranked = savedRankedResult(tile)
    if (ranked) remembered.ranked[tile.key] = ranked.elapsedMs
    const practice = save.results[tile.key]
    if (practice) remembered.practice[tile.key] = practice.elapsedMs
    if (save.run?.day === tile.key && save.run.kind === tile.kind) remembered.running = tile.key
  }
  return remembered
}

/** The ranked times in the server's answer for a page of the archive (Api::ArchiveController#index). */
export function readRankedTimes(body: unknown): RankedTimes {
  const times: RankedTimes = {}
  if (!isObject(body)) return times
  for (const kind of ['daily', 'puzzle'] as const) {
    const played = body[kind]
    if (!isObject(played)) continue
    for (const [number, result] of Object.entries(played)) {
      const key = `${kind}:${number}`
      if (TILE_KEY.test(key) && isObject(result) && isCount(result.elapsed_ms)) times[key] = result.elapsed_ms
    }
  }
  return times
}

/**
 * The player's ranked times for the days on one page of /archive, from the
 * server, which remembers every day they played. A browser the server has
 * never seen has none, so it isn't asked.
 */
export async function fetchRankedTimes(page: number, signal?: AbortSignal): Promise<RankedTimes> {
  if (isNewPlayer()) return {}
  const res = await apiFetch(`/api/archive?page=${page}`, { headers: headers(false), credentials: 'same-origin', signal })
  if (!res.ok) throw new Error('Could not load the played days')
  return readRankedTimes(await res.json())
}

/**
 * Each tile's state. A ranked finish outranks practice, and the server's
 * record of it outranks this browser's. `server` is undefined until it has
 * answered and null when it couldn't be reached: until it answers, a day
 * this browser knows nothing of is left unmarked rather than called unplayed.
 */
export function dayPlays(tiles: ArchiveTile[], remembered: RememberedPlays, server: RankedTimes | null | undefined): Record<string, DayPlay | undefined> {
  const plays: Record<string, DayPlay | undefined> = {}
  for (const { key } of tiles) {
    const ranked = server?.[key] ?? remembered.ranked[key]
    const practice = remembered.practice[key]
    if (ranked !== undefined) plays[key] = { state: 'ranked', elapsedMs: ranked }
    else if (practice !== undefined) plays[key] = { state: 'practice', elapsedMs: practice }
    else if (remembered.running === key) plays[key] = { state: 'running' }
    else if (server) plays[key] = { state: 'unplayed' }
  }
  return plays
}
