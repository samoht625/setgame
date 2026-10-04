import { useCallback, useEffect, useRef } from 'react'
import { seconds, track } from '../lib/analytics'

type Round = { seenAt: number; started: boolean; sets: number; misses: number }

/**
 * Funnel analytics for the shared table. The table keeps running whether or not
 * anyone plays, so a player's game starts with their first claim in a round.
 */
export function useMultiplayerFunnel(playerId: string, status: string, sets: number, place: number | null) {
  const roundRef = useRef<Round | null>(null)

  useEffect(() => {
    if (playerId) track('multiplayer_join')
  }, [playerId])

  useEffect(() => {
    if (!playerId) return
    if (status === 'playing' && !roundRef.current) {
      roundRef.current = { seenAt: Date.now(), started: false, sets, misses: 0 }
    }
    const round = roundRef.current
    if (!round) return
    const elapsed = seconds(Date.now() - round.seenAt)
    if (round.started && sets > round.sets) {
      if (round.sets < 1) track('first_set', { mode: 'multi', seconds: elapsed })
      if (round.sets < 10 && sets >= 10) track('set_10', { mode: 'multi', seconds: elapsed })
    }
    round.sets = sets
    if (status === 'round_over') {
      roundRef.current = null
      if (round.started) {
        track('game_complete', { mode: 'multi', seconds: elapsed, misses: round.misses, sets, ...(place ? { place } : {}) })
      }
    }
  }, [playerId, status, sets, place])

  useEffect(() => {
    const quit = (reason: 'page_hide' | 'leave') => {
      const round = roundRef.current
      if (!round?.started) return
      round.started = false
      track('game_quit', { mode: 'multi', reason, sets: round.sets, seconds: seconds(Date.now() - round.seenAt) })
    }
    const onPageHide = () => quit('page_hide')
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      quit('leave')
    }
  }, [])

  const noteAttempt = useCallback(() => {
    const round = roundRef.current
    if (!round || round.started) return
    round.started = true
    track('game_start', { mode: 'multi' })
  }, [])

  const noteMiss = useCallback(() => {
    if (roundRef.current?.started) roundRef.current.misses += 1
  }, [])

  return { noteAttempt, noteMiss }
}
