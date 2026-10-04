import React, { useEffect, useRef, useState } from 'react'
import Board from '../components/Board'
import GameLayout from '../components/GameLayout'
import SidePanel from '../components/SidePanel'
import Toast, { type ToastMessage, type ToastType } from '../components/Toast'
import { Hud, HudChip, HudDivider, HudStat } from '../components/Hud'
import { useGameMenu } from '../components/GameMenu'
import ScoreValue from '../components/ScoreValue'
import { useSound } from '../components/SoundProvider'
import { useSidePanel } from '../hooks/useSidePanel'
import { SoloTimer } from '../solitaire/SolitaireHud'
import DailyPanel from './DailyPanel'
import DailyCard, { primaryButton } from './DailyCard'
import { afterNextPaint } from '../lib/after_paint'
import { seconds, track } from '../lib/analytics'
import {
  dailyDate,
  dailyShareText,
  shareText,
  type DailyShare
} from '../lib/daily'
import { getPlayerId } from '../lib/player_id'
import { NAME_HINT, NAME_MAX_LENGTH, cleanName, getSavedName, onNameChange, saveName } from '../lib/player_name'
import { applySoloClaim, isRoundOver, restoreSoloDeal, startSoloDeal } from '../lib/solo_deal'
import {
  fetchDailyStatus,
  getPlayerDisplayName,
  nameDailyScore,
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
  gameId: string
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

// Today's one try. Stored under `ranked` so runs saved before practice was removed still load.
type DailySave = { ranked: DailyRun | null }

type DailyResult = DailyShare & { rank?: number; total?: number }

const isCard = (id: unknown) => Number.isInteger(id) && (id as number) >= 1 && (id as number) <= 81

function isRun(value: unknown): value is DailyRun {
  if (!value || typeof value !== 'object') return false
  const run = value as DailyRun
  return (
    typeof run.date === 'string' &&
    Number.isInteger(run.number) &&
    typeof run.gameId === 'string' &&
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

/** Today's run. An unfinished run from yesterday is kept so it can still be finished. */
function loadSave(today: string): DailySave {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Partial<DailySave> | null
    const ranked = parsed?.ranked
    return { ranked: isRun(ranked) && (ranked.date === today || ranked.status === 'playing') ? ranked : null }
  } catch {
    return { ranked: null }
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
  const [shareNote, setShareNote] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shareNoteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressSentRef = useRef<{ gameId: string; sets: number } | null>(null)
  // Asked once, before Start, only of players who haven't given a name yet.
  const [askName] = useState(() => !getSavedName())
  const [introName, setIntroName] = useState(() => getSavedName() ?? '')
  const namedScoreRef = useRef<string | null>(null)
  const showingTimes = panel.open
  const showedTimesRef = useRef(showingTimes)

  const run = save.ranked
  const playerId = getPlayerId()

  const commit = (next: DailySave) => {
    saveRef.current = next
    setSave(next)
    storeSave(next)
  }

  const putRun = (next: DailyRun) => commit({ ranked: next })

  const currentRun = () => saveRef.current.ranked

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
    if (showingTimes && !showedTimesRef.current) refreshStatus()
    showedTimesRef.current = showingTimes
  }, [showingTimes])

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    if (shareNoteTimeoutRef.current) clearTimeout(shareNoteTimeoutRef.current)
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
    if (sets === 0) return
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
      const key = `${current.date}:ranked:${current.startedAtMs}`
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

  const begin = async () => {
    if (starting) return
    // The name is optional and never blocks starting; one the leaderboard won't take is just not saved.
    const name = askName ? cleanName(introName) : null
    if (name) saveName(name)
    setStarting(true)
    setSelectedCards([])
    setRejectedCards([])
    const started = await startDailyGame()
    setStarting(false)
    if (started === 'already_played') {
      showToast('You’ve already played today’s deal', 'error')
      refreshStatus()
      return
    }
    if (!started) {
      showToast('Couldn’t load today’s deal. Check your connection.', 'error')
      return
    }

    const deal = startSoloDeal(started.seed)
    const fresh: DailyRun = {
      date: started.date,
      number: started.number,
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
    commit({ ranked: fresh })
    setClockPending(true)
    track('game_start', { mode: 'daily', ranked: true })
  }

  const submit = async (finished: DailyRun) => {
    if (submitting) return
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
      submission: finished ? 'pending' : current.submission
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
      ranked: true
    })
    void submit(next)
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
    if (outcome === 'shared' || outcome === 'cancelled') return
    if (shareNoteTimeoutRef.current) clearTimeout(shareNoteTimeoutRef.current)
    setShareNote(outcome === 'copied' ? 'Result copied — paste it anywhere' : 'Couldn’t copy your result')
    shareNoteTimeoutRef.current = setTimeout(() => setShareNote(null), 3000)
  }

  const goToToday = () => {
    commit(loadSave(dailyDate()))
    setStatus(null)
    refreshStatus()
  }

  const serverResult = status?.me.result ?? null
  const finishedRun = run?.status === 'finished' ? run : null
  const statusMatchesRun = status !== null && finishedRun !== null && status.date === finishedRun.date
  // A run finished after midnight shows yesterday's result while today's deal is already open.
  const staleRun = status !== null && finishedRun !== null && status.date !== finishedRun.date
  const result: DailyResult | null = finishedRun
    ? {
        number: finishedRun.number,
        elapsedMs: finishedRun.elapsedMs,
        rank: statusMatchesRun ? serverResult?.rank : undefined,
        total: statusMatchesRun ? serverResult?.total : undefined,
        token: statusMatchesRun ? serverResult?.share_token : undefined
      }
    : status && serverResult
      ? {
          number: status.number,
          elapsedMs: serverResult.elapsed_ms,
          rank: serverResult.rank,
          total: serverResult.total,
          token: serverResult.share_token
        }
      : null
  const streak = status && (!run || run.date === status.date) ? status.me.streak : 0
  const number = run?.number ?? status?.number
  // The player's own score for today exists on the server, so a name can still be put on it.
  const namedRun = finishedRun && statusMatchesRun && finishedRun.submission === 'submitted' ? finishedRun : null
  const myEntry = status?.leaderboard.find(entry => entry.player_id === playerId)
  const myScoreName = myEntry ? myEntry.display_name : status?.me.result?.display_name

  const nameScore = async (name: string): Promise<boolean> => {
    if (!namedRun) return false
    const ok = await nameDailyScore(namedRun.gameId, name)
    if (!ok) return false
    namedScoreRef.current = name
    saveName(name)
    setStatus(current => current && {
      ...current,
      leaderboard: current.leaderboard.map(entry => (entry.player_id === playerId ? { ...entry, display_name: name } : entry)),
      me: { ...current.me, result: current.me.result && { ...current.me.result, display_name: name } }
    })
    track('daily_name', { from: 'card' })
    refreshStatus()
    return true
  }

  // A name changed elsewhere (the menu) also goes on today's score.
  const nameScoreRef = useRef(nameScore)
  nameScoreRef.current = nameScore
  useEffect(() => onNameChange(name => {
    if (namedScoreRef.current === name) return
    void nameScoreRef.current(name)
  }), [])

  const toastNode = toast && <Toast message={toast} onClose={() => setToast(null)} />
  const playing = starting || run?.status === 'playing'

  const showCard = !playing && Boolean(result || status?.me.attempted)
  // The card has the leaderboard in it already.
  useGameMenu(showCard ? [] : [{ label: 'Leaderboard', onSelect: panel.toggle }])

  // Once today's try is used, /daily is a result card, not a game.
  if (showCard) {
    const submissionNote = finishedRun && (
      submitting ? (
        <p role="status" className="mt-2 text-xs text-blue-600 dark:text-blue-400">Submitting…</p>
      ) : finishedRun.submission === 'pending' ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p role="status">Your time is saved. Retry when you’re connected.</p>
          <button type="button" onClick={() => void submit(finishedRun)} className="mt-1 min-h-9 rounded-md px-1 font-semibold underline underline-offset-4">
            Retry submission
          </button>
        </div>
      ) : finishedRun.submission === 'rejected' ? (
        <p role="status" className="mt-2 text-xs text-rose-700 dark:text-rose-300">This run couldn’t be verified, so it isn’t ranked.</p>
      ) : null
    )
    return (
      <>
        {toastNode}
        <DailyCard
          number={result?.number ?? status!.number}
          result={result}
          streak={streak}
          note={submissionNote}
          status={status}
          statusError={statusError}
          onRetryStatus={refreshStatus}
          playerId={playerId}
          nowMs={nowMs}
          onShare={result ? () => void share(result) : undefined}
          shareNote={shareNote}
          onNextDeal={goToToday}
          stale={staleRun}
          onNameScore={namedRun && status?.me.result && !myScoreName ? nameScore : undefined}
        />
      </>
    )
  }

  let overlay: { label: string; content: React.ReactNode } | null = null
  if (playing) {
    overlay = null
  } else if (status) {
    overlay = {
      label: `Set Daily #${status.number}`,
      content: (
        <>
          <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">Same deal for everyone today.</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            One try. The clock starts when the cards appear and runs until you clear the deck.
          </p>
          {askName && (
            <label className="mt-4 block text-left">
              <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                Name for the leaderboard <span className="font-normal text-neutral-500 dark:text-neutral-400">(optional)</span>
              </span>
              <input
                value={introName}
                onChange={event => setIntroName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') void begin() }}
                placeholder="Anonymous"
                maxLength={NAME_MAX_LENGTH}
                autoComplete="nickname"
                enterKeyHint="go"
                aria-invalid={cleanName(introName) === null || undefined}
                className={`mt-1 h-10 w-full rounded-md border bg-white px-2.5 text-base text-neutral-900 focus:outline-none dark:bg-neutral-800 dark:text-neutral-100 ${
                  cleanName(introName) === null ? 'border-rose-400 focus:border-rose-500' : 'border-neutral-300 focus:border-neutral-500 dark:border-neutral-600 dark:focus:border-neutral-400'
                }`}
              />
              {cleanName(introName) === null && <span role="status" className="mt-1 block text-[11px] text-rose-700 dark:text-rose-300">{NAME_HINT}</span>}
            </label>
          )}
          <button type="button" onClick={() => void begin()} disabled={starting} className={`${primaryButton} ${askName ? 'mt-3' : 'mt-4'} w-full`}>
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
    : number !== undefined
      ? { label: `Daily #${number}`, tone: 'neutral' as const }
      : null

  return (
    <>
      {toastNode}

      <GameLayout
        hud={
          <Hud>
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
