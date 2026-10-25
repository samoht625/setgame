import React, { useEffect, useRef, useState } from 'react'
import { secondaryButtonSmall } from '../lib/buttons'
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
import DailyPanel from '../daily/DailyPanel'
import DailyCard, { primaryButton } from '../daily/DailyCard'
import FoundSets from './FoundSets'
import { afterNextPaint } from '../lib/after_paint'
import { seconds, track } from '../lib/analytics'
import { dailyDate, puzzleShareLink, shareLink, type DailyShare } from '../lib/daily'
import { getPlayerId } from '../lib/player_id'
import { getSavedName, onNameChange, saveName } from '../lib/player_name'
import { isSet } from '../lib/rules'
import {
  fetchPuzzleStatus,
  finishPuzzle,
  namePuzzleRun,
  reportPuzzleProgress,
  startPuzzle,
  type PuzzleClaim,
  type PuzzleStatus
} from '../lib/puzzle_api'

const SAVE_KEY = 'setgame_puzzle_v1'
const QUIT_REPORTED_KEY = 'setgame_puzzle_quit_reported'
const SET_COUNT = 6
const MODE = 'puzzle'

type PuzzleRun = {
  date: string
  number: number
  gameId: string
  cards: number[]
  status: 'playing' | 'finished'
  startedAtMs: number
  elapsedMs: number
  found: PuzzleClaim[]
  misses: number
  /** Every attempt in order: h(it) or m(iss), for the share grid. */
  attempts?: string
  submission?: 'pending' | 'submitted' | 'rejected'
}

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((card, index) => card === b[index])

function isRun(value: unknown): value is PuzzleRun {
  if (!value || typeof value !== 'object') return false
  const run = value as PuzzleRun
  return (
    typeof run.date === 'string' &&
    Number.isInteger(run.number) &&
    typeof run.gameId === 'string' &&
    Array.isArray(run.cards) && run.cards.length === 12 &&
    (run.status === 'playing' || run.status === 'finished') &&
    Number.isFinite(run.startedAtMs) &&
    Number.isFinite(run.elapsedMs) &&
    Array.isArray(run.found) &&
    Number.isInteger(run.misses)
  )
}

/** Today's run, or an unfinished one from yesterday so it can still be finished. */
function loadRun(today: string): PuzzleRun | null {
  try {
    const run = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
    return isRun(run) && (run.date === today || run.status === 'playing') ? run : null
  } catch {
    return null
  }
}

function storeRun(run: PuzzleRun | null): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run))
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

const PuzzleGame: React.FC = () => {
  const { playSelection, playSet } = useSound()
  const panel = useSidePanel()
  const nowMs = useNow(30_000)
  const [run, setRun] = useState<PuzzleRun | null>(() => loadRun(dailyDate()))
  const runRef = useRef(run)
  const [status, setStatus] = useState<PuzzleStatus | null>(null)
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
  const namedRef = useRef<string | null>(null)
  const playerId = getPlayerId()

  const putRun = (next: PuzzleRun | null) => {
    runRef.current = next
    setRun(next)
    storeRun(next)
  }

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
    fetchPuzzleStatus(AbortSignal.any([request.signal, AbortSignal.timeout(10000)]))
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
    if (panel.open) refreshStatus()
  }, [panel.open])

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    if (shareNoteTimeoutRef.current) clearTimeout(shareNoteTimeoutRef.current)
  }, [])

  // A fresh board's clock starts once its cards are on screen.
  useEffect(() => {
    if (!clockPending) return
    return afterNextPaint(() => {
      const current = runRef.current
      if (current?.status === 'playing' && current.found.length === 0) putRun({ ...current, startedAtMs: Date.now() })
      setClockPending(false)
    })
  }, [clockPending])

  const isPlaying = run?.status === 'playing' && !clockPending
  useEffect(() => {
    if (!isPlaying) return
    const onPageHide = () => {
      const current = runRef.current
      if (current?.status !== 'playing') return
      const key = `${current.date}:${current.gameId}`
      let reported = false
      try {
        reported = sessionStorage.getItem(QUIT_REPORTED_KEY) === key
        sessionStorage.setItem(QUIT_REPORTED_KEY, key)
      } catch {
        // Without session storage a reload may report the same quit twice.
      }
      if (!reported) {
        track('game_quit', { mode: MODE, reason: 'page_hide', sets: current.found.length, seconds: seconds(Date.now() - current.startedAtMs) })
      }
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [isPlaying])

  const begin = async () => {
    if (starting) return
    setStarting(true)
    setSelectedCards([])
    setRejectedCards([])
    const started = await startPuzzle()
    setStarting(false)
    if (started === 'already_played') {
      showToast('You’ve already solved today’s puzzle', 'error')
      refreshStatus()
      return
    }
    if (!started) {
      showToast('Couldn’t load today’s puzzle. Check your connection.', 'error')
      return
    }

    const resumed = started.found.length > 0 || status?.me.attempted === true
    const local = runRef.current
    const sameRun = local?.gameId === started.game_id
    putRun({
      date: started.date,
      number: started.number,
      gameId: started.game_id,
      cards: started.cards,
      status: 'playing',
      // A resumed run keeps the clock it started with.
      startedAtMs: sameRun ? local!.startedAtMs : resumed ? Math.min(Date.parse(started.started_at), Date.now()) : Date.now(),
      elapsedMs: 0,
      found: sameRun && local!.found.length >= started.found.length ? local!.found : started.found,
      misses: sameRun ? local!.misses : 0,
      attempts: sameRun ? local!.attempts : undefined
    })
    if (!resumed) setClockPending(true)
    track('game_start', { mode: MODE, ranked: true, resumed })
  }

  const submit = async (finished: PuzzleRun) => {
    if (submitting) return
    setSubmitting(true)
    const res = await finishPuzzle({
      game_id: finished.gameId,
      elapsed_ms: finished.elapsedMs,
      claims: finished.found,
      misses: finished.misses,
      attempts: finished.attempts,
      display_name: getSavedName()
    })
    setSubmitting(false)
    const latest = runRef.current
    if (latest?.gameId !== finished.gameId) return
    putRun({ ...latest, submission: res.ok ? 'submitted' : res.retryable ? 'pending' : 'rejected' })
    if (res.ok) refreshStatus()
    else if (!res.retryable) showToast('This run couldn’t be verified', 'error')
  }

  const claim = (cards: number[]) => {
    const current = runRef.current
    if (!current || current.status !== 'playing') return
    const sorted = [...cards].sort((a, b) => a - b)
    setSelectedCards([])

    if (!isSet(sorted[0]!, sorted[1]!, sorted[2]!)) {
      putRun({ ...current, misses: current.misses + 1, attempts: `${current.attempts ?? ''}m` })
      showToast('Not a set', 'error')
      flashRejection(cards)
      return
    }
    if (current.found.some(found => sameSet(found.cards, sorted))) {
      showToast('Already found', 'error')
      flashRejection(cards)
      return
    }

    const tMs = Date.now() - current.startedAtMs
    const found = [...current.found, { cards: sorted, t_ms: tMs }]
    const finished = found.length === SET_COUNT
    const next: PuzzleRun = {
      ...current,
      found,
      attempts: `${current.attempts ?? ''}h`,
      elapsedMs: tMs,
      status: finished ? 'finished' : 'playing',
      submission: finished ? 'pending' : current.submission
    }
    putRun(next)
    setClaimAnimationKey(value => value + 1)
    playSet()

    if (found.length === 1) track('first_set', { mode: MODE, seconds: seconds(tMs) })
    if (!finished) {
      reportPuzzleProgress(next.gameId, found)
      showToast(`${found.length} of ${SET_COUNT}`, 'success')
      return
    }
    track('game_complete', { mode: MODE, seconds: seconds(tMs), misses: next.misses, sets: SET_COUNT, ranked: true })
    void submit(next)
  }

  const handleCardClick = (cardId: number) => {
    if (!run || run.status !== 'playing' || clockPending || starting) return
    const nextSelected = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3 ? [...selectedCards, cardId] : selectedCards
    if (nextSelected.length > selectedCards.length && nextSelected.length < 3) playSelection()
    setSelectedCards(nextSelected)
    if (nextSelected.length === 3) claim(nextSelected)
  }

  const share = async (result: DailyShare) => {
    const outcome = await shareLink(puzzleShareLink(result))
    track('puzzle_share', { outcome })
    if (outcome === 'shared' || outcome === 'cancelled') return
    if (shareNoteTimeoutRef.current) clearTimeout(shareNoteTimeoutRef.current)
    setShareNote(outcome === 'copied' ? 'Result copied — paste it anywhere' : 'Couldn’t copy your result')
    shareNoteTimeoutRef.current = setTimeout(() => setShareNote(null), 3000)
  }

  const goToToday = () => {
    putRun(null)
    setStatus(null)
    refreshStatus()
  }

  const serverResult = status?.me.result ?? null
  const finishedRun = run?.status === 'finished' ? run : null
  const statusMatchesRun = status !== null && finishedRun !== null && status.date === finishedRun.date
  const staleRun = status !== null && finishedRun !== null && status.date !== finishedRun.date
  const result: DailyShare | null = finishedRun
    ? {
        number: finishedRun.number,
        elapsedMs: finishedRun.elapsedMs,
        rank: statusMatchesRun ? serverResult?.rank : undefined,
        total: statusMatchesRun ? serverResult?.total : undefined,
        streak: statusMatchesRun ? serverResult?.streak : undefined,
        token: statusMatchesRun ? serverResult?.share_token : undefined,
        marks: (statusMatchesRun ? serverResult?.marks : undefined) ?? finishedRun.attempts
      }
    : status && serverResult
      ? {
          number: status.number,
          elapsedMs: serverResult.elapsed_ms,
          rank: serverResult.rank,
          total: serverResult.total,
          streak: serverResult.streak,
          token: serverResult.share_token,
          marks: serverResult.marks
        }
      : null
  const streak = status && (!run || run.date === status.date) ? status.me.streak : 0
  const number = run?.number ?? status?.number
  const namedRun = finishedRun && statusMatchesRun && finishedRun.submission === 'submitted' ? finishedRun : null
  const myEntry = status?.leaderboard.find(entry => entry.player_id === playerId)
  const myScoreName = myEntry ? myEntry.display_name : status?.me.result?.display_name

  const nameRun = async (name: string): Promise<boolean> => {
    if (!namedRun) return false
    const ok = await namePuzzleRun(namedRun.gameId, name)
    if (!ok) return false
    namedRef.current = name
    saveName(name)
    track('puzzle_name', { from: 'card' })
    refreshStatus()
    return true
  }
  const nameRunRef = useRef(nameRun)
  nameRunRef.current = nameRun
  useEffect(() => onNameChange(name => {
    if (namedRef.current === name) return
    void nameRunRef.current(name)
  }), [])

  const toastNode = toast && <Toast message={toast} onClose={() => setToast(null)} />
  const playing = starting || run?.status === 'playing'
  // An unfinished run (wiped browser, other device) resumes instead of showing a card.
  const showCard = !playing && Boolean(result)
  useGameMenu(showCard ? [] : [{ label: 'Leaderboard', onSelect: panel.toggle }])

  if (showCard && result) {
    const submissionNote = finishedRun && (
      submitting ? (
        <p role="status" className="mt-2 text-xs text-blue-600 dark:text-blue-400">Submitting…</p>
      ) : finishedRun.submission === 'pending' ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <p role="status">Your time is saved. Retry when you’re connected.</p>
          <button type="button" onClick={() => void submit(finishedRun)} className={`${secondaryButtonSmall} mt-2`}>
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
          number={result.number}
          title={`Puzzle #${result.number}`}
          result={result}
          streak={streak}
          note={submissionNote}
          status={status}
          statusError={statusError}
          onRetryStatus={refreshStatus}
          playerId={playerId}
          nowMs={nowMs}
          onShare={() => void share(result)}
          shareNote={shareNote}
          onNextDeal={goToToday}
          stale={staleRun}
          onNameScore={namedRun && status?.me.result && !myScoreName ? nameRun : undefined}
          next={{ href: '/', label: 'Play Daily Deal' }}
          noun="puzzle"
          emptyText="No times yet — find all 6 sets to take the top spot."
        />
      </>
    )
  }

  let overlay: { label: string; content: React.ReactNode } | null = null
  if (!playing && status) {
    const resuming = status.me.attempted
    overlay = {
      label: `Puzzle #${status.number}`,
      content: (
        <>
          <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">12 cards. 6 sets. Find them all.</p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {resuming
              ? 'Pick up where you left off. Your clock kept running.'
              : 'Same cards for everyone today. One try; the clock starts when the cards appear.'}
          </p>
          <button type="button" onClick={() => void begin()} disabled={starting} className={`${primaryButton} mt-4 w-full`}>
            {resuming ? 'Continue' : 'Start'}
          </button>
          {streak > 0 && <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">{streak}-day streak — keep it going</p>}
        </>
      )
    }
  } else if (!playing) {
    overlay = {
      label: 'Puzzle',
      content: statusError ? (
        <>
          <p role="status" className="mt-2 text-sm text-neutral-700 dark:text-neutral-200">Couldn’t load today’s puzzle.</p>
          <button type="button" onClick={refreshStatus} className={`${primaryButton} mt-4 w-full`}>Try again</button>
        </>
      ) : (
        <p role="status" className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">12 cards. 6 sets. Find them all.</p>
      )
    }
  }

  const foundCount = run && !starting ? run.found.length : 0

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
            {!starting && number !== undefined && <HudChip>Puzzle #{number}</HudChip>}
            {run && !starting && (
              <>
                <HudDivider />
                <HudStat
                  value={<><ScoreValue value={foundCount} animationKey={claimAnimationKey} />/{SET_COUNT}</>}
                  label="sets found"
                  shortLabel="sets"
                />
              </>
            )}
          </Hud>
        }
        board={
          <>
            <Board
              cards={run && !starting && playing ? run.cards : []}
              selectedCards={selectedCards}
              rejectedCards={rejectedCards}
              onCardClick={handleCardClick}
              claiming={clockPending}
              loading={starting}
              gameOver={overlay !== null}
              gameOverLabel={overlay?.label}
              gameOverContent={overlay?.content}
            />
            <FoundSets found={run && playing && !starting ? run.found : []} total={SET_COUNT} latestKey={claimAnimationKey} />
          </>
        }
        panel={
          <SidePanel open={panel.open} onClose={() => panel.setOpen(false)} title="Leaderboard" isDesktop={panel.isDesktop}>
            <DailyPanel
              status={status}
              error={statusError}
              onRetry={refreshStatus}
              playerId={playerId}
              nowMs={nowMs}
              noun="puzzle"
              label={status ? `Puzzle #${status.number}` : undefined}
              emptyText="No times yet — find all 6 sets to take the top spot."
            />
          </SidePanel>
        }
      />
    </>
  )
}

export default PuzzleGame
