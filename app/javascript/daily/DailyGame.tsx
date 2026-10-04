import React, { useEffect, useRef, useState } from 'react'
import Board from '../components/Board'
import GameLayout from '../components/GameLayout'
import SidePanel from '../components/SidePanel'
import Toast, { type ToastMessage, type ToastType } from '../components/Toast'
import { Hud, HudChip, HudDivider, HudIconButton, HudStat, RestartIcon, TrophyIcon } from '../components/Hud'
import ScoreValue from '../components/ScoreValue'
import { useSound } from '../components/SoundProvider'
import { useSidePanel } from '../hooks/useSidePanel'
import { SoloTimer } from '../solitaire/SolitaireHud'
import { formatTime } from '../solitaire/time'
import DailyPanel from './DailyPanel'
import { afterNextPaint } from '../lib/after_paint'
import { seconds, track } from '../lib/analytics'
import {
  dailyDate,
  dailyShareText,
  formatCountdown,
  missesLabel,
  ordinal,
  paceRow,
  shareText,
  type DailyShare
} from '../lib/daily'
import { getPlayerId } from '../lib/player_id'
import { applySoloClaim, isRoundOver, restoreSoloDeal, startSoloDeal } from '../lib/solo_deal'
import {
  fetchDailyStatus,
  getPlayerDisplayName,
  reportSoloProgress,
  startDailyGame,
  submitSoloScore,
  type ClaimEvent,
  type DailyStatus
} from '../lib/solo_api'

const SAVE_KEY = 'setgame_daily_v1'
// Session-scoped so a reload mid-game doesn't report the same quit twice.
const QUIT_REPORTED_KEY = 'setgame_daily_quit_reported'

type DailyRun = {
  date: string
  number: number
  ranked: boolean
  gameId: string | null
  seed: number
  board: number[]
  deck: number[]
  rngState: number
  status: 'playing' | 'finished'
  startedAtMs: number
  elapsedMs: number
  events: ClaimEvent[]
  // Invalid claims; shown and shared, but the server can't check them.
  misses: number
  submission?: 'pending' | 'submitted' | 'rejected'
}

// The ranked run stays put while practicing, so its result is always one tap away.
type DailySave = { ranked: DailyRun | null; practice: DailyRun | null }

type RankedResult = DailyShare & { rank?: number; total?: number }

const isCard = (id: unknown) => Number.isInteger(id) && (id as number) >= 1 && (id as number) <= 81

function isRun(value: unknown): value is DailyRun {
  if (!value || typeof value !== 'object') return false
  const run = value as DailyRun
  return (
    typeof run.date === 'string' &&
    Number.isInteger(run.number) &&
    typeof run.ranked === 'boolean' &&
    Number.isFinite(run.seed) &&
    Array.isArray(run.board) &&
    Array.isArray(run.deck) &&
    [...run.board, ...run.deck].every(isCard) &&
    Number.isFinite(run.rngState) &&
    (run.status === 'playing' || run.status === 'finished') &&
    Number.isFinite(run.startedAtMs) &&
    Number.isFinite(run.elapsedMs) &&
    Array.isArray(run.events) &&
    Number.isInteger(run.misses)
  )
}

/** Today's runs. An unfinished ranked run from yesterday is kept so it can still be finished. */
function loadSave(today: string): DailySave {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Partial<DailySave> | null
    const ranked = parsed?.ranked
    const practice = parsed?.practice
    return {
      ranked: isRun(ranked) && (ranked.date === today || ranked.status === 'playing') ? ranked : null,
      practice: isRun(practice) && practice.date === today ? practice : null
    }
  } catch {
    return { ranked: null, practice: null }
  }
}

function storeSave(save: DailySave): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    // Ignore storage failures
  }
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

const primaryButton = 'min-h-11 rounded-full bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300'
const secondaryButton = 'min-h-11 flex-1 rounded-full border border-neutral-300 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800'

const DailyGame: React.FC = () => {
  const { playSelection, playSet } = useSound()
  const panel = useSidePanel()
  const nowMs = useNow(30_000)
  const [save, setSave] = useState<DailySave>(() => loadSave(dailyDate()))
  const saveRef = useRef(save)
  const [status, setStatus] = useState<DailyStatus | null>(null)
  const [statusError, setStatusError] = useState(false)
  const [statusRevision, setStatusRevision] = useState(0)
  const [starting, setStarting] = useState(false)
  const [clockPending, setClockPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [rejectedCards, setRejectedCards] = useState<number[]>([])
  const [claimAnimationKey, setClaimAnimationKey] = useState(0)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressSentRef = useRef<{ gameId: string; sets: number } | null>(null)
  const panelWasOpenRef = useRef(panel.open)

  const run = save.practice ?? save.ranked
  const playerId = getPlayerId()

  const commit = (next: DailySave) => {
    saveRef.current = next
    setSave(next)
    storeSave(next)
  }

  const putRun = (next: DailyRun) => {
    commit(next.ranked ? { ...saveRef.current, ranked: next } : { ...saveRef.current, practice: next })
  }

  const currentRun = () => saveRef.current.practice ?? saveRef.current.ranked

  const refreshStatus = () => setStatusRevision(value => value + 1)

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

  useEffect(() => {
    const request = new AbortController()
    fetchDailyStatus(AbortSignal.any([request.signal, AbortSignal.timeout(10000)]))
      .then(data => {
        if (request.signal.aborted) return
        setStatus(data)
        setStatusError(false)
      })
      .catch(() => {
        if (!request.signal.aborted) setStatusError(true)
      })
    return () => request.abort()
  }, [statusRevision])

  useEffect(() => {
    if (panel.open && !panelWasOpenRef.current) refreshStatus()
    panelWasOpenRef.current = panel.open
  }, [panel.open])

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
  }, [])

  // The clock starts when the dealt cards are on screen, not when they were requested.
  useEffect(() => {
    if (!clockPending) return
    return afterNextPaint(() => {
      const current = currentRun()
      if (current?.status === 'playing' && current.events.length === 0) {
        putRun({ ...current, startedAtMs: Date.now() })
      }
      setClockPending(false)
    })
  }, [clockPending])

  const syncProgress = (current: DailyRun) => {
    const sets = current.events.length
    if (!current.ranked || !current.gameId || sets === 0) return
    const sent = progressSentRef.current
    if (sent?.gameId === current.gameId && sent.sets >= sets) return
    progressSentRef.current = { gameId: current.gameId, sets }
    reportSoloProgress(current.gameId, sets)
  }

  const isPlaying = run?.status === 'playing' && !clockPending
  useEffect(() => {
    if (!isPlaying) return
    const onPageHide = () => {
      const current = currentRun()
      if (current?.status !== 'playing') return
      const key = `${current.date}:${current.ranked ? 'ranked' : 'practice'}:${current.startedAtMs}`
      let reported = false
      try {
        reported = sessionStorage.getItem(QUIT_REPORTED_KEY) === key
        sessionStorage.setItem(QUIT_REPORTED_KEY, key)
      } catch {
        // Without session storage a reload may report the same quit twice.
      }
      if (!reported) {
        track('game_quit', {
          mode: 'daily',
          reason: 'page_hide',
          sets: current.events.length,
          seconds: seconds(Date.now() - current.startedAtMs)
        })
      }
      syncProgress(current)
    }
    const onVisibilityChange = () => {
      const current = currentRun()
      if (document.visibilityState === 'hidden' && current?.status === 'playing') syncProgress(current)
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isPlaying])

  const begin = async (wantRanked: boolean) => {
    if (starting) return
    setStarting(true)
    setSelectedCards([])
    setRejectedCards([])
    const started = await startDailyGame()
    setStarting(false)
    if (!started) {
      showToast('Couldn’t load today’s deal. Check your connection.', 'error')
      return
    }

    const deal = startSoloDeal(started.seed)
    const fresh: DailyRun = {
      date: started.date,
      number: started.number,
      ranked: started.ranked,
      gameId: started.game_id,
      seed: started.seed,
      board: deal.board,
      deck: deal.deck,
      rngState: deal.rng.getState(),
      status: 'playing',
      startedAtMs: Date.now(),
      elapsedMs: 0,
      events: [],
      misses: 0
    }
    commit(fresh.ranked ? { ranked: fresh, practice: null } : { ...saveRef.current, practice: fresh })
    setClockPending(true)
    track('game_start', { mode: 'daily', ranked: fresh.ranked })
    if (wantRanked && !fresh.ranked) showToast('Today’s ranked try is used — this one is practice', 'error')
  }

  const submit = async (finished: DailyRun) => {
    if (!finished.gameId || submitting) return
    setSubmitting(true)
    const res = await submitSoloScore({
      game_id: finished.gameId,
      elapsed_ms: finished.elapsedMs,
      events: finished.events,
      misses: finished.misses,
      display_name: getPlayerDisplayName()
    })
    setSubmitting(false)
    const latest = saveRef.current.ranked
    if (latest?.gameId !== finished.gameId) return
    putRun({ ...latest, submission: res.ok ? 'submitted' : res.retryable ? 'pending' : 'rejected' })
    if (res.ok) {
      refreshStatus()
    } else if (!res.retryable) {
      showToast(res.error || 'Submit failed', 'error')
      syncProgress(latest)
    }
  }

  const claimSet = (cardIds: number[]) => {
    const current = currentRun()
    if (!current || current.status !== 'playing') return

    // Sorted, like the solo game: the server replays claims in this order.
    const sortedCards = [...cardIds].sort((a, b) => a - b)
    const deal = restoreSoloDeal(current.board, current.deck, current.rngState)
    const result = applySoloClaim(deal, sortedCards)
    setSelectedCards([])
    if (!result.ok) {
      putRun({ ...current, misses: current.misses + 1 })
      showToast(result.error, 'error')
      flashRejection(cardIds)
      return
    }

    const tMs = Date.now() - current.startedAtMs
    const events: ClaimEvent[] = [...current.events, { type: 'claim', cards: sortedCards, t_ms: tMs }]
    const finished = isRoundOver(deal)
    const next: DailyRun = {
      ...current,
      board: deal.board,
      deck: deal.deck,
      rngState: deal.rng.getState(),
      events,
      elapsedMs: tMs,
      status: finished ? 'finished' : 'playing',
      submission: finished && current.ranked ? 'pending' : current.submission
    }
    putRun(next)
    setClaimAnimationKey(value => value + 1)
    playSet()

    if (events.length === 1) track('first_set', { mode: 'daily', seconds: seconds(tMs) })
    if (events.length === 10) track('set_10', { mode: 'daily', seconds: seconds(tMs) })
    if (!finished) {
      showToast('Set found!', 'success')
      return
    }

    track('game_complete', {
      mode: 'daily',
      seconds: seconds(tMs),
      misses: next.misses,
      sets: events.length,
      ranked: next.ranked
    })
    if (next.ranked) {
      // As in solo: show the leaderboard beside the board, but not over it on phones.
      if (panel.isDesktop) panel.setOpen(true, { persist: false })
      void submit(next)
    }
  }

  const handleCardClick = (cardId: number) => {
    if (!run || run.status !== 'playing' || clockPending || starting) return
    const nextSelected = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3
        ? [...selectedCards, cardId]
        : selectedCards
    if (nextSelected.length > selectedCards.length && nextSelected.length < 3) playSelection()
    setSelectedCards(nextSelected)
    if (nextSelected.length === 3) claimSet(nextSelected)
  }

  const share = async (result: DailyShare) => {
    const outcome = await shareText(dailyShareText(result))
    track('daily_share', { outcome })
    if (outcome === 'copied') showToast('Result copied — paste it anywhere')
    else if (outcome === 'failed') showToast('Couldn’t copy your result', 'error')
  }

  const backToResult = () => commit({ ...saveRef.current, practice: null })

  const goToToday = () => {
    commit(loadSave(dailyDate()))
    setStatus(null)
    refreshStatus()
  }

  const serverResult = status?.me.result ?? null
  const rankedRun = save.ranked?.status === 'finished' ? save.ranked : null
  const statusMatchesRanked = status !== null && rankedRun !== null && status.date === rankedRun.date
  const rankedResult: RankedResult | null = rankedRun
    ? {
        number: rankedRun.number,
        elapsedMs: rankedRun.elapsedMs,
        misses: rankedRun.misses,
        claimMs: rankedRun.events.map(event => event.t_ms),
        rank: statusMatchesRanked ? serverResult?.rank : undefined,
        total: statusMatchesRanked ? serverResult?.total : undefined
      }
    : status && serverResult
      ? {
          number: status.number,
          elapsedMs: serverResult.elapsed_ms,
          misses: serverResult.misses ?? 0,
          claimMs: serverResult.claim_ms,
          rank: serverResult.rank,
          total: serverResult.total
        }
      : null
  const streak = status && (!run || run.date === status.date) ? status.me.streak : 0
  const number = run?.number ?? status?.number

  const nextDeal = status && (
    Date.parse(status.next_at) > nowMs ? (
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        Next deal in {formatCountdown(Date.parse(status.next_at) - nowMs)}
      </p>
    ) : (
      <button type="button" onClick={goToToday} className="mt-3 min-h-9 text-xs font-medium underline underline-offset-4">
        Play today’s deal
      </button>
    )
  )

  const submissionNote = rankedRun && (
    submitting ? (
      <p role="status" className="mt-2 text-xs text-blue-600 dark:text-blue-400">Submitting…</p>
    ) : rankedRun.submission === 'pending' ? (
      <div className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p role="status">Your time is saved. Retry when you’re connected.</p>
        <button type="button" onClick={() => void submit(rankedRun)} className="mt-1 min-h-9 rounded-md px-1 font-semibold underline underline-offset-4">
          Retry submission
        </button>
      </div>
    ) : rankedRun.submission === 'rejected' ? (
      <p role="status" className="mt-2 text-xs text-rose-700 dark:text-rose-300">This run couldn’t be verified, so it isn’t ranked.</p>
    ) : null
  )

  const resultCard = (result: RankedResult) => (
    <>
      <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
        {formatTime(result.elapsedMs)}
      </div>
      <div className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
        {missesLabel(result.misses)}
        {result.rank !== undefined && result.total !== undefined && ` · ${ordinal(result.rank)} of ${result.total}`}
      </div>
      <div role="img" aria-label="Pace: one square per three sets, green is fastest" className="mt-3 text-lg leading-none tracking-[0.15em]">
        {paceRow(result.claimMs)}
      </div>
      {streak > 0 && (
        <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{streak}-day streak</p>
      )}
      {submissionNote}
      <button type="button" onClick={() => void share(result)} className={`${primaryButton} mt-4 w-full`}>
        Share
      </button>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => void begin(false)} disabled={starting} className={secondaryButton}>
          Practice
        </button>
        {!panel.open && (
          <button type="button" onClick={() => panel.setOpen(true)} className={secondaryButton}>
            Leaderboard
          </button>
        )}
      </div>
      {nextDeal}
    </>
  )

  let overlay: { label: string; content: React.ReactNode } | null = null
  if (starting || run?.status === 'playing') {
    overlay = null
  } else if (run && !run.ranked) {
    overlay = {
      label: `Practice · Daily #${run.number}`,
      content: (
        <>
          <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
            {formatTime(run.elapsedMs)}
          </div>
          <div className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{missesLabel(run.misses)} · not ranked</div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => void begin(false)} disabled={starting} className={`${primaryButton} flex-1`}>
              Practice again
            </button>
            {rankedResult && (
              <button type="button" onClick={backToResult} className={secondaryButton}>
                Your result
              </button>
            )}
          </div>
        </>
      )
    }
  } else if (rankedResult) {
    overlay = { label: `Set Daily #${rankedResult.number}`, content: resultCard(rankedResult) }
  } else if (status?.me.attempted) {
    overlay = {
      label: `Set Daily #${status.number}`,
      content: (
        <>
          <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">You’ve used today’s ranked try.</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            It wasn’t finished, so it isn’t on the leaderboard. You can still practice this deal.
          </p>
          <button type="button" onClick={() => void begin(false)} disabled={starting} className={`${primaryButton} mt-4 w-full`}>
            Practice this deal
          </button>
          {nextDeal}
        </>
      )
    }
  } else if (status) {
    overlay = {
      label: `Set Daily #${status.number}`,
      content: (
        <>
          <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">Same deal for everyone today.</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            One ranked try. The clock starts when the cards appear and runs until you clear the deck.
          </p>
          <button type="button" onClick={() => void begin(true)} disabled={starting} className={`${primaryButton} mt-4 w-full`}>
            Start
          </button>
          {streak > 0 && (
            <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{streak}-day streak — keep it going</p>
          )}
        </>
      )
    }
  } else {
    overlay = {
      label: 'Set Daily',
      content: statusError ? (
        <>
          <p role="status" className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">Couldn’t load today’s deal.</p>
          <button type="button" onClick={refreshStatus} className={`${primaryButton} mt-4 w-full`}>Try again</button>
        </>
      ) : (
        <p role="status" className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">Loading today’s deal…</p>
      )
    }
  }

  const chip = starting
    ? { label: 'Dealing', tone: 'neutral' as const }
    : run && !run.ranked
      ? { label: 'Practice', tone: 'amber' as const }
      : run?.status === 'finished'
        ? { label: 'Finished', tone: 'amber' as const }
        : number !== undefined
          ? { label: `Daily #${number}`, tone: 'neutral' as const }
          : null

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <GameLayout
        hud={
          <Hud
            actions={
              <>
                {run && !run.ranked && (
                  <HudIconButton label="New practice" onClick={() => void begin(false)} disabled={starting}>
                    <RestartIcon />
                  </HudIconButton>
                )}
                <HudIconButton label="Leaderboard" onClick={panel.toggle} active={panel.open} aria-expanded={panel.open}>
                  <TrophyIcon />
                </HudIconButton>
              </>
            }
          >
            <SoloTimer
              startedAtMs={run?.startedAtMs ?? 0}
              elapsedMs={run?.status === 'finished' ? run.elapsedMs : 0}
              running={isPlaying}
              loading={!run || starting}
            />
            {chip && <HudChip tone={chip.tone}>{chip.label}</HudChip>}
            {run && !starting && (
              <>
                <HudDivider />
                <HudStat value={run.deck.length} label="cards left" shortLabel="left" />
                <HudStat
                  value={<ScoreValue value={run.events.length} animationKey={claimAnimationKey} />}
                  label={run.events.length === 1 ? 'set found' : 'sets found'}
                  shortLabel={run.events.length === 1 ? 'set' : 'sets'}
                />
              </>
            )}
          </Hud>
        }
        board={
          <Board
            cards={run && !starting ? run.board : []}
            selectedCards={selectedCards}
            rejectedCards={rejectedCards}
            onCardClick={handleCardClick}
            claiming={clockPending}
            loading={starting}
            gameOver={overlay !== null}
            gameOverLabel={overlay?.label}
            gameOverContent={overlay?.content}
          />
        }
        panel={
          <SidePanel open={panel.open} onClose={() => panel.setOpen(false)} title="Leaderboard" isDesktop={panel.isDesktop}>
            <DailyPanel status={status} error={statusError} onRetry={refreshStatus} playerId={playerId} nowMs={nowMs} />
          </SidePanel>
        }
      />
    </>
  )
}

export default DailyGame
