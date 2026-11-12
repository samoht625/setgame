import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchLeaderboard, fetchPersonalBests, type LeaderboardEntry } from '../lib/solo_api'

type Period = 'daily' | 'weekly' | 'monthly'
type PerPeriod<T> = Partial<Record<Period, T>>

const PERIODS: Period[] = ['daily', 'weekly', 'monthly']
const EMPTY_LEADERBOARD: LeaderboardEntry[] = []
// A list fetched this recently isn't fetched again just because its tab was picked.
const FRESH_MS = 10000

function without<T>(record: PerPeriod<T>, period: Period): PerPeriod<T> {
  if (!(period in record)) return record
  const next = { ...record }
  delete next[period]
  return next
}

/**
 * Leaderboards + personal bests. Every period's leaderboard is cached, so
 * switching tabs shows the list at once (refetching it in the background when
 * it's stale) and a list still on its way leaves the last one on screen
 * instead of a loading placeholder. Opening fetches every period; refresh()
 * refetches the selected one and marks the rest stale. Personal bests are
 * fetched once per open and on refresh(). Nothing is fetched while `enabled`
 * is false (the panel is closed).
 */
export function useSoloScores(period: Period, enabled: boolean) {
  const [revision, setRevision] = useState(0)
  const [boards, setBoards] = useState<PerPeriod<LeaderboardEntry[]>>({})
  const [errors, setErrors] = useState<PerPeriod<string>>({})
  const [pending, setPending] = useState<PerPeriod<true>>({})
  const [personalBests, setPersonalBests] = useState<{
    entries: Record<string, LeaderboardEntry | null>
    loading: boolean
    error: string | null
  }>(() => ({ entries: {}, loading: true, error: null }))
  const requestsRef = useRef<PerPeriod<AbortController>>({})
  const fetchedAtRef = useRef<PerPeriod<number>>({})
  const periodRef = useRef(period)
  const revisionRef = useRef(revision)
  const lastShownRef = useRef<Period | null>(null)

  useEffect(() => {
    periodRef.current = period
  }, [period])

  const refresh = useCallback(() => setRevision(value => value + 1), [])

  const load = useCallback((p: Period) => {
    requestsRef.current[p]?.abort()
    const request = new AbortController()
    requestsRef.current[p] = request
    setPending(previous => ({ ...previous, [p]: true }))

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10000)])
    fetchLeaderboard(p, 20, signal)
      .then(leaderboard => {
        if (request.signal.aborted) return
        fetchedAtRef.current[p] = Date.now()
        setBoards(previous => ({ ...previous, [p]: leaderboard.length ? leaderboard : EMPTY_LEADERBOARD }))
        setErrors(previous => without(previous, p))
      })
      .catch(() => {
        if (request.signal.aborted) return
        setErrors(previous => ({ ...previous, [p]: 'Could not load times.' }))
      })
      .finally(() => {
        if (requestsRef.current[p] !== request) return
        delete requestsRef.current[p]
        setPending(previous => without(previous, p))
      })
  }, [])

  // Opening fetches the selected period first, then the others so their tabs are ready.
  useEffect(() => {
    if (!enabled) return
    const selected = periodRef.current
    load(selected)
    for (const p of PERIODS) if (p !== selected) load(p)

    return () => {
      for (const request of Object.values(requestsRef.current)) request?.abort()
      requestsRef.current = {}
      setPending({})
    }
  }, [enabled, load])

  useEffect(() => {
    if (revision === revisionRef.current) return
    revisionRef.current = revision
    if (!enabled) return
    fetchedAtRef.current = {}
    load(periodRef.current)
  }, [revision, enabled, load])

  useEffect(() => {
    if (!enabled || requestsRef.current[period]) return
    const fetchedAt = fetchedAtRef.current[period]
    if (fetchedAt !== undefined && Date.now() - fetchedAt < FRESH_MS) return
    load(period)
  }, [period, enabled, load])

  useEffect(() => {
    if (!enabled) return
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
  }, [revision, enabled])

  // The period whose rows are on screen: the selected one once it has loaded,
  // until then the last one shown (unless the selected one failed).
  const failed = !boards[period] && !pending[period] && errors[period] !== undefined
  let shownPeriod: Period | null = null
  if (boards[period]) shownPeriod = period
  else if (!failed && lastShownRef.current && boards[lastShownRef.current]) shownPeriod = lastShownRef.current

  useEffect(() => {
    if (boards[period]) lastShownRef.current = period
  }, [boards, period])

  return useMemo(() => ({
    period,
    /** The period `leaderboard` and `personalBest` belong to; differs from `period` while its list loads. */
    leaderboardPeriod: shownPeriod ?? period,
    leaderboard: shownPeriod ? boards[shownPeriod]! : EMPTY_LEADERBOARD,
    personalBest: personalBests.entries[shownPeriod ?? period] || null,
    // undefined until personal bests have loaded once.
    allTimeBest: personalBests.entries.all_time,
    /** True while the previous period's rows stand in for the selected one. */
    stale: shownPeriod !== null && shownPeriod !== period,
    loading: shownPeriod === null && !failed,
    error: failed ? errors[period]! : null,
    personalBestLoading: personalBests.loading,
    personalBestError: personalBests.error,
    refresh
  }), [period, shownPeriod, boards, failed, errors, personalBests, refresh])
}
