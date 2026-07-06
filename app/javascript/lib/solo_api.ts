function playerId(): string {
  const key = 'setgame_player_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function headers(json = true): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'X-Player-Id': playerId()
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

export async function startSoloGame(): Promise<SoloGameStart | null> {
  try {
    const res = await fetch('/api/solo/games', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin'
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
}): Promise<{ ok: true; is_personal_best?: Record<string, boolean> } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/solo/scores', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || 'submit_failed' }
    return { ok: true, is_personal_best: data.is_personal_best }
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

export async function fetchLeaderboard(
  period: 'daily' | 'weekly' | 'monthly',
  limit = 20
): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(`/api/solo/leaderboard?period=${period}&limit=${limit}`, {
      headers: headers(false),
      credentials: 'same-origin'
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.entries || []
  } catch {
    return []
  }
}

export async function fetchPersonalBests(): Promise<Record<string, LeaderboardEntry | null>> {
  try {
    const res = await fetch('/api/solo/personal_bests', {
      headers: headers(),
      credentials: 'same-origin'
    })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

export function getPlayerDisplayName(): string | null {
  try {
    const id = playerId()
    return (
      localStorage.getItem(`setgame_player_name:${id}`) ||
      localStorage.getItem('setgame_name') ||
      null
    )
  } catch {
    return null
  }
}
