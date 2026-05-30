import { useEffect, useState } from 'react'
import { getPlayerId } from '../cable'

// Presence is best-effort decoration, so keep it cheap: a tiny JSON poll on a
// slow cadence, only while the tab is visible and the hook is enabled.
const POLL_INTERVAL_MS = 30_000

function countOthers(ids: unknown): number {
  if (!Array.isArray(ids)) return 0
  const me = getPlayerId()
  return new Set(ids.filter(id => typeof id === 'string' && id && id !== me)).size
}

// The server seeds the root element with the current online ids so the jewel
// can appear on first paint without an extra request.
function readSeededCount(): number {
  try {
    const raw = document.getElementById('root')?.dataset.onlineIds
    return raw ? countOthers(JSON.parse(raw)) : 0
  } catch {
    return 0
  }
}

// How many *other* people are currently in the multiplayer game.
export function usePresence(enabled: boolean): number {
  const [othersOnline, setOthersOnline] = useState<number>(readSeededCount)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/presence', { headers: { Accept: 'application/json' } })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setOthersOnline(countOthers(data.player_ids))
      } catch {
        // Best-effort; ignore network hiccups.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }

    refresh()
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])

  return othersOnline
}
