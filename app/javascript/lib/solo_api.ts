import { getPlayerId } from './player_id'

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
  display_name?: string | null
}): Promise<{ ok: true; is_personal_best?: Record<string, boolean> } | { ok: false; error: string; retryable: boolean }> {
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
    return { ok: true, is_personal_best: data.is_personal_best }
  } catch {
    return { ok: false, error: 'network_error', retryable: true }
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

export function getPlayerDisplayName(): string | null {
  try {
    const id = getPlayerId()
    return (
      localStorage.getItem(`setgame_player_name:${id}`) ||
      localStorage.getItem('setgame_name') ||
      null
    )
  } catch {
    return null
  }
}
