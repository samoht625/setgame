import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLeaderboard, fetchPersonalBests, type LeaderboardEntry } from '../lib/solo_api'

type Period = 'daily' | 'weekly' | 'monthly'

const EMPTY_LEADERBOARD: LeaderboardEntry[] = []

export function useSoloScores(period: Period) {
  const [revision, setRevision] = useState(0)
  const [scores, setScores] = useState<{
    period: Period
    leaderboard: LeaderboardEntry[]
    loading: boolean
    error: string | null
  }>(() => ({ period, leaderboard: EMPTY_LEADERBOARD, loading: true, error: null }))
  const [personalBests, setPersonalBests] = useState<{
    entries: Record<string, LeaderboardEntry | null>
    loading: boolean
    error: string | null
  }>(() => ({ entries: {}, loading: true, error: null }))

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  useEffect(() => {
    const request = new AbortController()
    setScores({ period, leaderboard: EMPTY_LEADERBOARD, loading: true, error: null })

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)])
    fetchLeaderboard(period, 20, signal)
      .then(leaderboard => {
        if (!request.signal.aborted) {
          setScores({ period, leaderboard: leaderboard.length ? leaderboard : EMPTY_LEADERBOARD, loading: false, error: null })
        }
      })
      .catch(() => {
        if (!request.signal.aborted) {
          setScores({ period, leaderboard: EMPTY_LEADERBOARD, loading: false, error: 'Could not load times.' })
        }
      })

    return () => request.abort()
  }, [period, revision])

  useEffect(() => {
    const request = new AbortController()
    setPersonalBests(previous => ({ ...previous, loading: true, error: null }))

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)])
    fetchPersonalBests(signal)
      .then(entries => {
        if (!request.signal.aborted) {
          setPersonalBests({ entries, loading: false, error: null })
        }
      })
      .catch(() => {
        if (!request.signal.aborted) {
          setPersonalBests(previous => ({ ...previous, loading: false, error: 'Could not load your best times.' }))
        }
      })

    return () => request.abort()
  }, [revision])

  return useMemo(() => ({
    period,
    leaderboard: scores.period === period ? scores.leaderboard : EMPTY_LEADERBOARD,
    personalBest: personalBests.entries[period] || null,
    loading: scores.period !== period || scores.loading,
    error: scores.period === period ? scores.error : null,
    personalBestLoading: personalBests.loading,
    personalBestError: personalBests.error,
    refresh
  }), [period, scores, personalBests, refresh])
}
