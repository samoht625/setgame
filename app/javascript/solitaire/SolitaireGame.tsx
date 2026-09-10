import React, { useState, useEffect, useRef } from 'react'
import Board from '../components/Board'
import GameLayout from '../components/GameLayout'
import SidePanel from '../components/SidePanel'
import Toast, { ToastMessage, ToastType } from '../components/Toast'
import SolitaireHud from './SolitaireHud'
import SolitairePanel, { type LeaderboardPeriod } from './SolitairePanel'
import { formatTime } from './time'
import PersonalBestCelebration from '../components/PersonalBestCelebration'
import { useSound } from '../components/SoundProvider'
import { useSoloScores } from '../hooks/useSoloScores'
import { useSidePanel } from '../hooks/useSidePanel'
import {
  applySoloClaim,
  isRoundOver,
  restoreSoloDeal,
  startSoloDeal,
  type SoloDealState
} from '../lib/solo_deal'
import {
  getPlayerDisplayName,
  startSoloGame,
  submitSoloScore,
  type ClaimEvent
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
  submissionStatus?: 'pending' | 'submitted' | 'rejected'
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
      ![...parsed.board, ...parsed.deck].every(id => Number.isInteger(id) && id >= 1 && id <= 81) ||
      new Set([...parsed.board, ...parsed.deck]).size !== parsed.board.length + parsed.deck.length ||
      (parsed.status !== 'playing' && parsed.status !== 'paused' && parsed.status !== 'round_over') ||
      !Array.isArray(parsed.recentClaims) ||
      !parsed.recentClaims.every(claim => claim && Array.isArray(claim.cards) && claim.cards.length === 3 && claim.cards.every(id => Number.isInteger(id) && id >= 1 && id <= 81)) ||
      !Number.isFinite(parsed.startedAtMs) ||
      !Number.isFinite(parsed.elapsedMs) || parsed.elapsedMs < 0 ||
      !Number.isFinite(parsed.seed)
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

const SolitaireGame: React.FC = () => {
  const { playSelection, playSet } = useSound()
  const [bestImprovementMs, setBestImprovementMs] = useState<number | null>(null)
  const [claimAnimationKey, setClaimAnimationKey] = useState(0)
  const [board, setBoard] = useState<number[]>([])
  const [deck, setDeck] = useState<number[]>([])
  const [status, setStatus] = useState<SoloStatus>('playing')
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [rejectedCards, setRejectedCards] = useState<number[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([])
  const [startedAtMs, setStartedAtMs] = useState(Date.now())
  const [period, setPeriod] = useState<LeaderboardPeriod>('daily')
  const [submitting, setSubmitting] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const submissionStatusRef = useRef<SavedSoloState['submissionStatus']>(undefined)
  const [isStarting, setIsStarting] = useState(true)
  const panel = useSidePanel()
  const scores = useSoloScores(period, panel.open)
  const startRequestRef = useRef<AbortController | null>(null)
  const gameGenerationRef = useRef(0)
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
      eligible: opts.eligible,
      submissionStatus: submissionStatusRef.current
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
      savedAtMs?: number
    }
  ) => {
    dealStateRef.current = deal
    setBoard([...deal.board])
    setDeck([...deal.deck])

    eligibleRef.current = opts.eligible
    gameIdRef.current = opts.gameId ?? null
    seedRef.current = opts.seed

    const ev = opts.events || []
    eventsRef.current = ev

    const claims = opts.recentClaims || []
    setRecentClaims(claims)
    recentClaimsRef.current = claims

    const started = opts.startedAtMs ?? Date.now()
    setStartedAtMs(started)
    setElapsedMs(opts.elapsedMs ?? 0)

    const st = opts.status || 'playing'
    setStatus(st)
    setIsStarting(false)
    setSelectedCards([])
    setRejectedCards([])
    submittedRef.current = st === 'round_over'

    if (opts.savedAtMs !== undefined) {
      lastActivityAtRef.current = opts.savedAtMs
      return
    }

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

  const startNewGame = async () => {
    startRequestRef.current?.abort()
    const request = new AbortController()
    startRequestRef.current = request
    gameGenerationRef.current += 1
    setIsStarting(true)
    setSubmitting(false)
    setSubmissionError(null)
    setBestImprovementMs(null)
    submissionStatusRef.current = undefined
    setSelectedCards([])
    setRejectedCards([])
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)

    const remote = await startSoloGame(request.signal)
    if (request.signal.aborted) return
    startRequestRef.current = null
    submittedRef.current = false
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
      const stored: unknown = JSON.parse(localStorage.getItem(BEST_TIMES_KEY) || '[]')
      const times = (Array.isArray(stored) ? stored : []).filter((time): time is { ms: number; at: string } => (
        time !== null && typeof time === 'object' && Number.isFinite(time.ms) && time.ms > 0 &&
        typeof time.at === 'string' && Number.isFinite(Date.parse(time.at))
      ))
      const previousBest = Math.min(...times.map(time => time.ms))
      if (Number.isFinite(previousBest) && finalMs < previousBest) setBestImprovementMs(previousBest - finalMs)
      times.push({ ms: finalMs, at: new Date().toISOString() })
      times.sort((a, b) => a.ms - b.ms)
      localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(times.slice(0, 10)))
    } catch {
      // Local records are optional when browser storage is unavailable.
    }

    if (!eligibleRef.current || !gameIdRef.current) {
      if (!eligibleRef.current) {
        showToast('Finished — not submitted (ineligible)', 'error')
      }
      return
    }

    await submitFinishedGame(finalMs, claimEvents)
  }

  const submitFinishedGame = async (finalMs: number, claimEvents: ClaimEvent[]) => {
    if (submitting || !eligibleRef.current || !gameIdRef.current) return
    setSubmitting(true)
    setSubmissionError(null)
    const generation = gameGenerationRef.current
    const res = await submitSoloScore({
      game_id: gameIdRef.current,
      elapsed_ms: finalMs,
      events: claimEvents,
      display_name: getPlayerDisplayName()
    })
    if (generation !== gameGenerationRef.current) return
    setSubmitting(false)

    submissionStatusRef.current = res.ok ? 'submitted' : res.retryable ? 'pending' : 'rejected'
    const saved = loadSavedGame()
    if (saved?.gameId === gameIdRef.current && saved?.status === 'round_over') {
      saveGame({ ...saved, submissionStatus: submissionStatusRef.current })
    }

    if (res.ok) {
      showToast(`Submitted! ${formatTime(finalMs)}`, 'success')
      scores.refresh()
    } else if (res.retryable) {
      setSubmissionError('Your time is saved. Retry when you’re connected.')
    } else {
      showToast(res.error || 'Submit failed', 'error')
    }
  }

  const claimSet = (cardIds: number[]) => {
    const deal = dealStateRef.current
    if (!deal || status !== 'playing') return

    // Apply the claim in sorted order — the submitted event is sorted and the
    // server replays it in that order. Card positions after a replace-in-place
    // depend on iteration order, and board order feeds the (order-sensitive)
    // full-board reshuffle, so applying in selection order could desync the
    // replay and get a legitimate run rejected.
    const sortedCards = [...cardIds].sort((a, b) => a - b)
    const result = applySoloClaim(deal, sortedCards)
    if (!result.ok) {
      showToast(result.error, 'error')
      flashRejection(cardIds)
      setSelectedCards([])
      return
    }

    const tMs = Date.now() - startedAtMs
    const event: ClaimEvent = {
      type: 'claim',
      cards: sortedCards,
      t_ms: tMs
    }
    const newEvents = [...eventsRef.current, event]
    eventsRef.current = newEvents

    setBoard([...deal.board])
    setDeck([...deal.deck])
    setSelectedCards([])
    setClaimAnimationKey(value => value + 1)
    playSet()
    showToast('Set found!', 'success')

    const updatedRecentClaims = [{ cards: cardIds }, ...recentClaims].slice(0, 8)
    setRecentClaims(updatedRecentClaims)
    recentClaimsRef.current = updatedRecentClaims

    if (isRoundOver(deal)) {
      submissionStatusRef.current = eligibleRef.current ? 'pending' : undefined
      setStatus('round_over')
      setElapsedMs(tMs)
      // The game is over, so the leaderboard is now the interesting thing. On
      // phones it would cover the finish card, so there it stays a tap away.
      if (panel.isDesktop) panel.setOpen(true)
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
    if (isStarting || status !== 'playing') return
    if (Date.now() - lastActivityAtRef.current >= IDLE_RESET_MS) {
      startFreshAfterIdle()
      return
    }

    const nextSelected = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3
        ? [...selectedCards, cardId]
        : selectedCards

    if (nextSelected.length > selectedCards.length && nextSelected.length < 3) playSelection()
    setSelectedCards(nextSelected)
    if (nextSelected.length === 3) {
      claimSet(nextSelected)
    }
  }

  const markIneligible = (reason: string) => {
    if (!eligibleRef.current) return
    eligibleRef.current = false
    showToast(reason, 'error')
  }

  const togglePause = () => {
    if (isStarting) return
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
    if (isStarting || status !== 'playing') return

    const saveActivity = () => {
      if (document.visibilityState !== 'visible' || startRequestRef.current) return
      const now = Date.now()
      if (now - lastActivityAtRef.current >= IDLE_RESET_MS) {
        startFreshAfterIdle()
        return
      }

      lastActivityAtRef.current = now
      if (now - lastActivitySaveRef.current >= ACTIVITY_SAVE_INTERVAL_MS && dealStateRef.current) {
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
    }

    const timer = setInterval(saveActivity, 1000)
    document.addEventListener('visibilitychange', saveActivity)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', saveActivity)
    }
  }, [isStarting, status, startedAtMs])

  useEffect(() => {
    const saved = loadSavedGame()
    const staleInProgress =
      saved !== null &&
      saved.status !== 'round_over' &&
      Date.now() - saved.savedAtMs >= IDLE_RESET_MS
    if (staleInProgress) {
      // The player was away 15+ minutes: discard the stale game, deal fresh.
      startFreshAfterIdle()
    } else if (saved && (saved.board.length > 0 || saved.status === 'round_over')) {
      const deal = restoreSoloDeal(saved.board, saved.deck, saved.rngState)
      const wasPaused = saved.status === 'paused'
      submissionStatusRef.current = saved.submissionStatus
      const pendingSubmission = saved.status === 'round_over' && saved.submissionStatus === 'pending'
      if (pendingSubmission) setSubmissionError('Your time is saved. Retry when you’re connected.')
      applyDeal(deal, {
        gameId: saved.gameId,
        seed: saved.seed,
        eligible: saved.eligible && !wasPaused && (saved.status !== 'round_over' || pendingSubmission),
        status: saved.status,
        elapsedMs:
          saved.status === 'playing' ? Date.now() - saved.startedAtMs : saved.elapsedMs,
        startedAtMs:
          saved.status === 'playing' ? saved.startedAtMs : Date.now() - saved.elapsedMs,
        recentClaims: saved.recentClaims,
        events: saved.events,
        savedAtMs: saved.savedAtMs
      })
    } else {
      void startNewGame()
    }
    return () => {
      startRequestRef.current?.abort()
      gameGenerationRef.current += 1
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    }
  }, [])

  const isFinished = !isStarting && status === 'round_over'

  const finishCard = (
    <>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
        {formatTime(elapsedMs)}
      </div>
      <div className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">Cleared the deck</div>
      {bestImprovementMs !== null && <PersonalBestCelebration improvementMs={bestImprovementMs} />}
      {submitting && (
        <p role="status" className="mt-2 text-xs text-blue-600 dark:text-blue-400">Submitting…</p>
      )}
      {submissionError && !submitting && (
        <div className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p role="status">{submissionError}</p>
          <button
            type="button"
            onClick={() => void submitFinishedGame(elapsedMs, eventsRef.current)}
            className="mt-1 min-h-9 rounded-md px-1 font-semibold underline underline-offset-4"
          >
            Retry submission
          </button>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void startNewGame()}
          className="min-h-11 flex-1 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          Play again
        </button>
        {!panel.open && (
          <button
            type="button"
            onClick={() => panel.setOpen(true)}
            className="min-h-11 rounded-full border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            Leaderboard
          </button>
        )}
      </div>
    </>
  )

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <GameLayout
        hud={
          <SolitaireHud
            elapsedMs={elapsedMs}
            startedAtMs={startedAtMs}
            isStarting={isStarting}
            deckCount={deck.length}
            setsFound={eventsRef.current.length}
            claimAnimationKey={claimAnimationKey}
            status={status}
            onTogglePause={togglePause}
            onRestart={() => void startNewGame()}
            panelOpen={panel.open}
            onTogglePanel={panel.toggle}
          />
        }
        board={
          <Board
            cards={board}
            selectedCards={selectedCards}
            rejectedCards={rejectedCards}
            onCardClick={handleCardClick}
            claiming={isStarting}
            loading={isStarting}
            gameOver={isFinished}
            gameOverContent={finishCard}
            paused={!isStarting && status === 'paused'}
            onResume={togglePause}
          />
        }
        panel={
          <SidePanel open={panel.open} onClose={() => panel.setOpen(false)} title="Leaderboard" isDesktop={panel.isDesktop}>
            <SolitairePanel
              isFinished={isFinished}
              recentClaims={recentClaims}
              leaderboard={scores.leaderboard}
              personalBest={scores.personalBest}
              scoresLoading={scores.loading}
              scoresError={scores.error}
              personalBestError={scores.personalBestError}
              onRetryScores={scores.refresh}
              period={period}
              onPeriodChange={setPeriod}
            />
          </SidePanel>
        }
      />
    </>
  )
}

export default SolitaireGame
