import { getPlayerId } from './player_id'
import { getSavedName } from './player_name'

function headers(json = true): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'X-Player-Id': getPlayerId()
  }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export type SoloGameStart = {
  game_id: string
  seed: number
  rules_version: number
}

export type LeaderboardEntry = {
  player_id: string
  display_name: string | null
  elapsed_ms: number
  completed_at: string
}

export type ClaimEvent = {
  type: 'claim'
  cards: number[]
  t_ms: number
}

/** `replay`: the run's claim timing is on record, so it can be compared. */
export type DailyEntry = LeaderboardEntry & { misses: number | null; replay?: boolean }

export type DailyReplayRun = {
  display_name: string | null
  elapsed_ms: number
  rank: number
  claims: Array<{ cards: number[]; t_ms: number }>
}

export type DailyComparison = {
  date: string
  number: number
  seed: number
  me: DailyReplayRun
  them: DailyReplayRun
}

export type DailyStatus = {
  date: string
  number: number
  next_at: string
  total: number
  leaderboard: DailyEntry[]
  me: {
    attempted: boolean
    streak: number
    result: {
      display_name?: string | null
      elapsed_ms: number
      misses: number | null
      rank: number
      total: number
      share_token: string
      replay?: boolean
    } | null
  }
}

export type DailyStart = {
  date: string
  number: number
  next_at: string
  seed: number
  rules_version: number
  game_id: string
}

export async function startSoloGame(signal?: AbortSignal): Promise<SoloGameStart | null> {
  try {
    const res = await fetch('/api/solo/games', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000)
    })
    if (!res.ok) return null
    return (await res.json()) as SoloGameStart
  } catch {
    return null
  }
}

export async function submitSoloScore(body: {
  game_id: string
  elapsed_ms: number
  events: ClaimEvent[]
  misses?: number
  display_name?: string | null
}): Promise<{ ok: true; score?: LeaderboardEntry } | { ok: false; error: string; retryable: boolean }> {
  try {
    const res = await fetch('/api/solo/scores', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    })
    const data = await res.json()
    // The server checks ownership before reporting an already accepted game.
    if (res.status === 422 && data.error === 'already_completed') return { ok: true }
    if (!res.ok) return { ok: false, error: data.error || 'submit_failed', retryable: res.status >= 500 || res.status === 429 }
    return { ok: true, score: data.score }
  } catch {
    return { ok: false, error: 'network_error', retryable: true }
  }
}

/** Fire-and-forget: records how far an unfinished game got. Safe to call while the page is unloading. */
export function reportSoloProgress(gameId: string, setsFound: number): void {
  try {
    fetch(`/api/solo/games/${encodeURIComponent(gameId)}/progress`, {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify({ sets_found: setsFound }),
      keepalive: true
    }).catch(() => {})
  } catch {
    // Progress is best-effort analytics.
  }
}

export async function fetchLeaderboard(
  period: 'daily' | 'weekly' | 'monthly',
  limit = 20,
  signal?: AbortSignal
): Promise<LeaderboardEntry[]> {
  const res = await fetch(`/api/solo/leaderboard?period=${period}&limit=${limit}`, {
    headers: headers(false),
    credentials: 'same-origin',
    signal
  })
  if (!res.ok) throw new Error('Could not load leaderboard')
  const data = await res.json()
  return data.entries || []
}

export async function fetchPersonalBests(signal?: AbortSignal): Promise<Record<string, LeaderboardEntry | null>> {
  const res = await fetch('/api/solo/personal_bests', {
    headers: headers(false),
    credentials: 'same-origin',
    signal
  })
  if (!res.ok) throw new Error('Could not load personal bests')
  return await res.json()
}

export async function fetchDailyStatus(signal?: AbortSignal): Promise<DailyStatus> {
  const res = await fetch('/api/daily', {
    headers: headers(false),
    credentials: 'same-origin',
    signal
  })
  if (!res.ok) throw new Error('Could not load the daily')
  return await res.json()
}

/** The player's finished run and another finisher's from the same day, claim by claim. */
export async function fetchDailyComparison(date: string, playerId: string, signal?: AbortSignal): Promise<DailyComparison> {
  const query = new URLSearchParams({ date, player_id: playerId })
  const res = await fetch(`/api/daily/compare?${query}`, {
    headers: headers(false),
    credentials: 'same-origin',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error('Could not load the replay')
  return await res.json()
}

/** Deals today's one try, or says it's already been used. */
export async function startDailyGame(): Promise<DailyStart | 'already_played' | null> {
  try {
    const res = await fetch('/api/daily/games', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(8000)
    })
    if (res.status === 409) return 'already_played'
    if (!res.ok) return null
    return (await res.json()) as DailyStart
  } catch {
    return null
  }
}

export function getPlayerDisplayName(): string | null {
  return getSavedName()
}

/** Puts a name on the player's own score for today; the game id proves it's theirs. */
export async function nameDailyScore(gameId: string, displayName: string): Promise<boolean> {
  try {
    const res = await fetch('/api/daily/name', {
      method: 'PATCH',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify({ game_id: gameId, display_name: displayName }),
      signal: AbortSignal.timeout(8000)
    })
    return res.ok
  } catch {
    return false
  }
}
