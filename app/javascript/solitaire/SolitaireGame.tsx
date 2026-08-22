import React, { useState, useEffect, useRef } from 'react'
import Board from '../components/Board'
import GameLayout from '../components/GameLayout'
import Toast, { ToastMessage, ToastType } from '../components/Toast'
import SolitaireSidebar from './SolitaireSidebar'
import {
  applySoloClaim,
  isRoundOver,
  restoreSoloDeal,
  startSoloDeal,
  type SoloDealState
} from '../lib/solo_deal'
import {
  fetchLeaderboard,
  fetchPersonalBests,
  getPlayerDisplayName,
  startSoloGame,
  submitSoloScore,
  type ClaimEvent,
  type LeaderboardEntry
} from '../lib/solo_api'

const LOCAL_STORAGE_KEY = 'setgame_solo_state_v2'
const BEST_TIMES_KEY = 'setgame_solo_best_times'
// Discard an in-progress solo game once the player has been away this long.
const IDLE_RESET_MS = 15 * 60 * 1000
// While playing with the tab visible, refresh the saved activity stamp this often.
const ACTIVITY_SAVE_INTERVAL_MS = 10_000

interface RecentClaim {
  cards: number[]
}

export type SoloStatus = 'playing' | 'paused' | 'round_over'

type SavedSoloState = {
  board: number[]
  deck: number[]
  status: SoloStatus
  recentClaims: RecentClaim[]
  startedAtMs: number
  elapsedMs: number
  gameId: string | null
  seed: number
  rngState: number
  events: ClaimEvent[]
  eligible: boolean
  // Wall-clock time of the last save (i.e. last meaningful activity).
  savedAtMs: number
}

function loadSavedGame(): SavedSoloState | null {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as SavedSoloState
    if (
      !Array.isArray(parsed.board) ||
      !Array.isArray(parsed.deck) ||
      (parsed.status !== 'playing' && parsed.status !== 'paused' && parsed.status !== 'round_over') ||
      !Array.isArray(parsed.recentClaims) ||
      typeof parsed.startedAtMs !== 'number' ||
      typeof parsed.elapsedMs !== 'number' ||
      typeof parsed.seed !== 'number'
    ) {
      return null
    }
    return {
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
      eligible: Boolean(parsed.eligible && parsed.gameId),
      rngState: typeof parsed.rngState === 'number' ? parsed.rngState : 0,
      gameId: parsed.gameId || null,
      // Older saves have no savedAtMs; approximate last activity from the
      // timer values that were current when the save was written.
      savedAtMs:
        typeof parsed.savedAtMs === 'number'
          ? parsed.savedAtMs
          : parsed.startedAtMs + Math.max(0, parsed.elapsedMs)
    }
  } catch {
    return null
  }
}

function saveGame(state: Omit<SavedSoloState, 'savedAtMs'>): void {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ ...state, savedAtMs: Date.now() })
    )
  } catch {
    // Ignore storage failures
  }
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

const SolitaireGame: React.FC = () => {
  const [board, setBoard] = useState<number[]>([])
  const [deck, setDeck] = useState<number[]>([])
  const [status, setStatus] = useState<SoloStatus>('playing')
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [rejectedCards, setRejectedCards] = useState<number[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([])
  const [setsFound, setSetsFound] = useState(0)
  const [startedAtMs, setStartedAtMs] = useState(Date.now())
  const [eligible, setEligible] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [personalBest, setPersonalBest] = useState<LeaderboardEntry | null>(null)
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [submitting, setSubmitting] = useState(false)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dealStateRef = useRef<SoloDealState | null>(null)
  const eventsRef = useRef<ClaimEvent[]>([])
  const eligibleRef = useRef(false)
  const gameIdRef = useRef<string | null>(null)
  const seedRef = useRef(0)
  const submittedRef = useRef(false)
  const recentClaimsRef = useRef<RecentClaim[]>([])
  // Wall-clock time of the last meaningful activity (save or visible timer tick).
  const lastActivityAtRef = useRef(Date.now())
  const lastActivitySaveRef = useRef(0)

  useEffect(() => {
    recentClaimsRef.current = recentClaims
  }, [recentClaims])

  const showToast = (text: string, type: ToastType = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ text, type })
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2500)
  }

  const flashRejection = (cards: number[]) => {
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    setRejectedCards(cards)
    rejectTimeoutRef.current = setTimeout(() => setRejectedCards([]), 650)
  }

  const writeSave = (
    deal: SoloDealState,
    opts: {
      status: SoloStatus
      recentClaims: RecentClaim[]
      startedAtMs: number
      elapsedMs: number
      gameId: string | null
      seed: number
      events: ClaimEvent[]
      eligible: boolean
    }
  ) => {
    saveGame({
      board: deal.board,
      deck: deal.deck,
      status: opts.status,
      recentClaims: opts.recentClaims,
      startedAtMs: opts.startedAtMs,
      elapsedMs: opts.elapsedMs,
      gameId: opts.gameId,
      seed: opts.seed,
      rngState: deal.rng.getState(),
      events: opts.events,
      eligible: opts.eligible
    })
    lastActivityAtRef.current = Date.now()
  }

  const applyDeal = (
    deal: SoloDealState,
    opts: {
      gameId: string | null
      seed: number
      eligible: boolean
      status?: SoloStatus
      elapsedMs?: number
      startedAtMs?: number
      recentClaims?: RecentClaim[]
      events?: ClaimEvent[]
    }
  ) => {
    dealStateRef.current = deal
    setBoard([...deal.board])
    setDeck([...deal.deck])

    eligibleRef.current = opts.eligible
    setEligible(opts.eligible)
    gameIdRef.current = opts.gameId ?? null
    seedRef.current = opts.seed

    const ev = opts.events || []
    eventsRef.current = ev

    const claims = opts.recentClaims || []
    setRecentClaims(claims)
    setSetsFound(claims.length)

    const started = opts.startedAtMs ?? Date.now()
    setStartedAtMs(started)
    setElapsedMs(opts.elapsedMs ?? 0)

    const st = opts.status || 'playing'
    setStatus(st)
    setSelectedCards([])
    submittedRef.current = st === 'round_over'

    writeSave(deal, {
      status: st,
      recentClaims: claims,
      startedAtMs: started,
      elapsedMs: opts.elapsedMs ?? 0,
      gameId: opts.gameId ?? null,
      seed: opts.seed,
      events: ev,
      eligible: opts.eligible
    })
  }

  const refreshScores = async (p: 'daily' | 'weekly' | 'monthly') => {
    const [lb, pb] = await Promise.all([fetchLeaderboard(p), fetchPersonalBests()])
    setLeaderboard(lb)
    setPersonalBest(pb[p] || null)
  }

  const startNewGame = async () => {
    submittedRef.current = false
    const remote = await startSoloGame()
    if (remote) {
      const deal = startSoloDeal(remote.seed)
      applyDeal(deal, {
        gameId: remote.game_id,
        seed: remote.seed,
        eligible: true,
        status: 'playing',
        events: []
      })
      return
    }

    const localSeed = crypto.getRandomValues(new Uint32Array(1))[0]!
    const deal = startSoloDeal(localSeed)
    applyDeal(deal, {
      gameId: null,
      seed: localSeed,
      eligible: false,
      status: 'playing',
      events: []
    })
    showToast("Offline — won't count for leaderboard", 'error')
  }

  const startFreshAfterIdle = () => {
    // Stamp activity first so overlapping timer ticks don't re-trigger the reset.
    lastActivityAtRef.current = Date.now()
    showToast('New game — previous game was idle for 15+ minutes', 'success')
    void startNewGame()
  }

  const finishGame = async (finalMs: number, claimEvents: ClaimEvent[]) => {
    if (submittedRef.current) return
    submittedRef.current = true

    try {
      const times = JSON.parse(localStorage.getItem(BEST_TIMES_KEY) || '[]') as {
        ms: number
        at: string
      }[]
      times.push({ ms: finalMs, at: new Date().toISOString() })
      times.sort((a, b) => a.ms - b.ms)
      localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(times.slice(0, 10)))
    } catch {
      // ignore
    }

    if (!eligibleRef.current || !gameIdRef.current) {
      if (!eligibleRef.current) {
        showToast('Finished — not submitted (ineligible)', 'error')
      }
      return
    }

    setSubmitting(true)
    const res = await submitSoloScore({
      game_id: gameIdRef.current,
      elapsed_ms: finalMs,
      events: claimEvents,
      display_name: getPlayerDisplayName()
    })
    setSubmitting(false)

    if (res.ok) {
      showToast(`Submitted! ${formatTime(finalMs)}`, 'success')
      void refreshScores(period)
    } else {
      showToast(res.error || 'Submit failed', 'error')
    }
  }

  const claimSet = (cardIds: number[]) => {
    const deal = dealStateRef.current
    if (!deal || status !== 'playing') return

    const result = applySoloClaim(deal, cardIds)
    if (!result.ok) {
      showToast(result.error, 'error')
      flashRejection(cardIds)
      setSelectedCards([])
      return
    }

    const tMs = Date.now() - startedAtMs
    const event: ClaimEvent = {
      type: 'claim',
      cards: [...cardIds].sort((a, b) => a - b),
      t_ms: tMs
    }
    const newEvents = [...eventsRef.current, event]
    eventsRef.current = newEvents

    setBoard([...deal.board])
    setDeck([...deal.deck])
    setSelectedCards([])
    showToast('Set found!', 'success')

    const updatedRecentClaims = [{ cards: cardIds }, ...recentClaims].slice(0, 8)
    setRecentClaims(updatedRecentClaims)
    setSetsFound(prev => prev + 1)

    if (isRoundOver(deal)) {
      setStatus('round_over')
      setElapsedMs(tMs)
      writeSave(deal, {
        status: 'round_over',
        recentClaims: updatedRecentClaims,
        startedAtMs,
        elapsedMs: tMs,
        gameId: gameIdRef.current,
        seed: seedRef.current,
        events: newEvents,
        eligible: eligibleRef.current
      })
      void finishGame(tMs, newEvents)
      return
    }

    writeSave(deal, {
      status: 'playing',
      recentClaims: updatedRecentClaims,
      startedAtMs,
      elapsedMs: tMs,
      gameId: gameIdRef.current,
      seed: seedRef.current,
      events: newEvents,
      eligible: eligibleRef.current
    })
  }

  const handleCardClick = (cardId: number) => {
    if (status !== 'playing') return

    const nextSelected = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3
        ? [...selectedCards, cardId]
        : selectedCards

    setSelectedCards(nextSelected)
    if (nextSelected.length === 3) {
      claimSet(nextSelected)
    }
  }

  const markIneligible = (reason: string) => {
    if (!eligibleRef.current) return
    eligibleRef.current = false
    setEligible(false)
    showToast(reason, 'error')
  }

  const togglePause = () => {
    if (status === 'playing') {
      const nowElapsed = Date.now() - startedAtMs
      setElapsedMs(nowElapsed)
      setStatus('paused')
      setSelectedCards([])
      markIneligible('Paused — this run will not count for the leaderboard')
      if (dealStateRef.current) {
        writeSave(dealStateRef.current, {
          status: 'paused',
          recentClaims,
          startedAtMs,
          elapsedMs: nowElapsed,
          gameId: gameIdRef.current,
          seed: seedRef.current,
          events: eventsRef.current,
          eligible: false
        })
      }
    } else if (status === 'paused') {
      if (Date.now() - lastActivityAtRef.current >= IDLE_RESET_MS) {
        startFreshAfterIdle()
        return
      }
      const newStart = Date.now() - elapsedMs
      setStartedAtMs(newStart)
      setStatus('playing')
      if (dealStateRef.current) {
        writeSave(dealStateRef.current, {
          status: 'playing',
          recentClaims,
          startedAtMs: newStart,
          elapsedMs,
          gameId: gameIdRef.current,
          seed: seedRef.current,
          events: eventsRef.current,
          eligible: false
        })
      }
    }
  }

  useEffect(() => {
    if (status === 'playing') {
      timerRef.current = setInterval(() => {
        const now = Date.now()
        setElapsedMs(now - startedAtMs)
        if (document.visibilityState !== 'visible') return

        // Returning to a backgrounded tab after a long absence: start fresh.
        if (now - lastActivityAtRef.current >= IDLE_RESET_MS) {
          startFreshAfterIdle()
          return
        }

        lastActivityAtRef.current = now
        // Periodically persist so savedAtMs tracks presence, not just moves.
        if (
          now - lastActivitySaveRef.current >= ACTIVITY_SAVE_INTERVAL_MS &&
          dealStateRef.current
        ) {
          lastActivitySaveRef.current = now
          writeSave(dealStateRef.current, {
            status: 'playing',
            recentClaims: recentClaimsRef.current,
            startedAtMs,
            elapsedMs: now - startedAtMs,
            gameId: gameIdRef.current,
            seed: seedRef.current,
            events: eventsRef.current,
            eligible: eligibleRef.current
          })
        }
      }, 100)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [status, startedAtMs])

  useEffect(() => {
    const saved = loadSavedGame()
    const staleInProgress =
      saved !== null &&
      saved.status !== 'round_over' &&
      Date.now() - saved.savedAtMs >= IDLE_RESET_MS
    if (staleInProgress) {
      // The player was away 15+ minutes: discard the stale game, deal fresh.
      startFreshAfterIdle()
    } else if (saved && saved.board.length > 0) {
      const deal = restoreSoloDeal(saved.board, saved.deck, saved.rngState)
      const wasPaused = saved.status === 'paused'
      applyDeal(deal, {
        gameId: saved.gameId,
        seed: saved.seed,
        eligible: saved.eligible && !wasPaused && saved.status !== 'round_over',
        status: saved.status,
        elapsedMs:
          saved.status === 'playing' ? Date.now() - saved.startedAtMs : saved.elapsedMs,
        startedAtMs:
          saved.status === 'playing' ? saved.startedAtMs : Date.now() - saved.elapsedMs,
        recentClaims: saved.recentClaims,
        events: saved.events
      })
      if (wasPaused) {
        eligibleRef.current = false
        setEligible(false)
      }
    } else {
      void startNewGame()
    }
    void refreshScores(period)

    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void refreshScores(period)
  }, [period])

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <GameLayout
        board={
          <Board
            cards={board}
            selectedCards={selectedCards}
            rejectedCards={rejectedCards}
            onCardClick={handleCardClick}
            claiming={false}
            gameOver={status === 'round_over'}
            paused={status === 'paused'}
          />
        }
        sidebar={
          <SolitaireSidebar
            elapsedMs={elapsedMs}
            deckCount={deck.length}
            setsFound={setsFound}
            status={status}
            onTogglePause={togglePause}
            onRestart={() => void startNewGame()}
            recentClaims={recentClaims}
            leaderboard={leaderboard}
            personalBest={personalBest}
            period={period}
            onPeriodChange={setPeriod}
            submitting={submitting}
          />
        }
      />
    </>
  )
}

export default SolitaireGame
