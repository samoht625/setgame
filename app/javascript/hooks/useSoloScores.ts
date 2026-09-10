import { useCallback, useEffect, useState } from 'react'
import { fetchLeaderboard, fetchPersonalBests, type LeaderboardEntry } from '../lib/solo_api'

type Period = 'daily' | 'weekly' | 'monthly'

/**
 * Leaderboard + personal best for a period. Nothing is fetched while
 * `enabled` is false (the panel is closed); opening it fetches fresh data.
 */
export function useSoloScores(period: Period, enabled: boolean) {
  const [revision, setRevision] = useState(0)
  const [scores, setScores] = useState<{
    period: Period
    leaderboard: LeaderboardEntry[]
    personalBest: LeaderboardEntry | null
    loading: boolean
    error: string | null
  }>({ period, leaderboard: [], personalBest: null, loading: true, error: null })

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    if (!enabled) return
    const request = new AbortController()
    setScores({ period, leaderboard: [], personalBest: null, loading: true, error: null })

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)])
    Promise.all([fetchLeaderboard(period, 20, signal), fetchPersonalBests(signal)])
      .then(([leaderboard, personalBests]) => {
        if (!request.signal.aborted) {
          setScores({ period, leaderboard, personalBest: personalBests[period] || null, loading: false, error: null })
        }
      })
      .catch(() => {
        if (!request.signal.aborted) {
          setScores({ period, leaderboard: [], personalBest: null, loading: false, error: 'Could not load times.' })
        }
      })

    return () => request.abort()
  }, [period, revision, enabled])

  return scores.period === period
    ? { ...scores, refresh }
    : { period, leaderboard: [], personalBest: null, loading: true, error: null, refresh }
}
