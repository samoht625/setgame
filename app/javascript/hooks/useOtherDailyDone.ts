import { useEffect, useState } from 'react'
import { fetchDailyStatus } from '../lib/solo_api'
import { fetchPuzzleStatus } from '../lib/puzzle_api'

const SAVE_KEYS = { daily: 'setgame_daily_v1', puzzle: 'setgame_puzzle_v1' } as const

/**
 * Whether this player is done with the other daily game today, from the
 * server (so it's right for a signed-in player on any device). The Daily
 * Deal counts once its one try is used; the Puzzle once it's finished (an
 * unfinished Puzzle resumes). Rechecked when another tab saves that game
 * and when this tab comes back into view. Null until known.
 */
export function useOtherDailyDone(other: 'daily' | 'puzzle', enabled = true): boolean | null {
  const [done, setDone] = useState<boolean | null>(null)

  useEffect(() => {
    if (!enabled) return
    let controller: AbortController | null = null
    const check = () => {
      controller?.abort()
      controller = new AbortController()
      const request = other === 'daily' ? fetchDailyStatus(controller.signal) : fetchPuzzleStatus(controller.signal)
      request
        .then(status => setDone(other === 'daily' ? status.me.attempted || Boolean(status.me.result) : Boolean(status.me.result)))
        .catch(() => { /* keep what we had */ })
    }
    const onStorage = (event: StorageEvent) => { if (event.key === SAVE_KEYS[other]) check() }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    check()
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      controller?.abort()
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [other, enabled])

  return done
}

export const PRACTICE_LINK = { href: '/practice', label: 'Play Practice' }
