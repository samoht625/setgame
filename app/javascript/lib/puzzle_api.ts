import { apiFetch, headers, type DailyStatus } from './solo_api'

export type PuzzleClaim = { cards: number[]; t_ms: number }

/** Same shape as the Daily Deal's status, so its leaderboard and result card can show it. */
export type PuzzleStatus = DailyStatus

export type PuzzleStart = {
  date: string
  number: number
  next_at: string
  game_id: string
  cards: number[]
  started_at: string
  /** Sets already found on a run started earlier today. */
  found: PuzzleClaim[]
}

export async function fetchPuzzleStatus(signal?: AbortSignal): Promise<PuzzleStatus> {
  const res = await apiFetch('/api/puzzle', { headers: headers(false), credentials: 'same-origin', signal })
  if (!res.ok) throw new Error('Could not load the puzzle')
  return await res.json()
}

/** Deals today's board (or resumes today's unfinished run), or says it's done. */
export async function startPuzzle(): Promise<PuzzleStart | 'already_played' | null> {
  try {
    const res = await apiFetch('/api/puzzle/games', {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(8000)
    })
    if (res.status === 409) return 'already_played'
    if (!res.ok) return null
    return (await res.json()) as PuzzleStart
  } catch {
    return null
  }
}

/** Fire-and-forget: saves the sets found so far, so a wiped browser can resume. */
export function reportPuzzleProgress(gameId: string, claims: PuzzleClaim[]): void {
  try {
    apiFetch(`/api/puzzle/games/${encodeURIComponent(gameId)}/progress`, {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify({ claims }),
      keepalive: true
    }).catch(() => {})
  } catch {
    // Best effort.
  }
}

export async function finishPuzzle(body: {
  game_id: string
  elapsed_ms: number
  claims: PuzzleClaim[]
  misses: number
  display_name: string | null
}): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
  try {
    const res = await apiFetch(`/api/puzzle/games/${encodeURIComponent(body.game_id)}/finish`, {
      method: 'POST',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    })
    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => ({}))
    return { ok: false, error: data.error || 'submit_failed', retryable: res.status >= 500 || res.status === 429 }
  } catch {
    return { ok: false, error: 'network_error', retryable: true }
  }
}

export async function namePuzzleRun(gameId: string, displayName: string): Promise<boolean> {
  try {
    const res = await apiFetch('/api/puzzle/name', {
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
