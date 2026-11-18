import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Board from '../components/Board'
import { Hud, HudChip, HudDivider, HudStat } from '../components/Hud'
import MarkGrid from '../components/MarkGrid'
import ScoreValue from '../components/ScoreValue'
import { useSound } from '../components/SoundProvider'
import Toast, { type ToastMessage, type ToastType } from '../components/Toast'
import { StartCard } from '../daily/StartNotes'
import { useAutoCompleteReveal } from '../hooks/useAutoCompleteReveal'
import { afterNextPaint } from '../lib/after_paint'
import { seconds, track } from '../lib/analytics'
import {
  dayKey,
  fetchRankedResult,
  practicePlace,
  practiceResult,
  practiceRun,
  savedRankedResult,
  savePracticeResult,
  savePracticeRun,
  type ArchiveDay,
  type ArchiveKind,
  type PracticeResult,
  type PracticeRun,
  type RankedResult
} from '../lib/archive'
import { ordinal } from '../lib/daily'
import { getSavedName } from '../lib/player_name'
import { isSet } from '../lib/rules'
import { applySoloClaim, isRoundOver, restoreSoloDeal, startSoloDeal } from '../lib/solo_deal'
import { autoCompletePick, twoCardModeOn, THIRD_CARD_MISSING } from '../lib/two_card_mode'
import FoundSets from '../puzzle/FoundSets'
import { missMessage } from '../rules/Tour'
import { SoloTimer } from '../solitaire/SolitaireHud'
import { formatTime } from '../solitaire/time'

const SET_COUNT = 6
const NAMES: Record<ArchiveKind, string> = { daily: 'Daily Deal', puzzle: 'Puzzle' }
const START_LINES: Record<ArchiveKind, [string, string]> = {
  daily: ['The deal everyone got that day.', 'Practice: your time isn’t ranked.'],
  puzzle: ['12 cards. 6 sets. Find them all.', 'Practice: your time isn’t ranked.']
}
// The page's own board and solution (archive/day.html.erb), out of sight until the practice run is over.
const SPOILERS = ['archive-board', 'archive-solution']

const quietButton = 'inline-flex min-h-9 cursor-pointer items-center rounded-full px-3 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((card, index) => card === b[index])
const missCount = (misses: number) => `${misses} ${misses === 1 ? 'miss' : 'misses'}`

/**
 * A closed day's page, played again. The player who finished it on the day
 * sees that result; anyone else can play it once as practice. A practice run
 * lives in this browser only: it is never sent to the server, so it can't
 * reach the day's leaderboard or anyone's streak.
 */
const ArchivePlay: React.FC<{ day: ArchiveDay }> = ({ day }) => {
  const { playSelection, playSet } = useSound()
  // undefined until the server has said whether this player finished the day.
  const [ranked, setRanked] = useState<RankedResult | null | undefined>(() => savedRankedResult(day) ?? undefined)
  const [result, setResult] = useState<PracticeResult | null>(() => practiceResult(day))
  const [run, setRun] = useState<PracticeRun | null>(() => practiceRun(day))
  const runRef = useRef(run)
  const [viewing, setViewing] = useState(false)
  const [clockPending, setClockPending] = useState(false)
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [rejectedCards, setRejectedCards] = useState<number[]>([])
  const [claimAnimationKey, setClaimAnimationKey] = useState(0)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const autoReveal = useAutoCompleteReveal()
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const putRun = (next: PracticeRun | null) => {
    runRef.current = next
    setRun(next)
    savePracticeRun(next)
  }

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
    fetchRankedResult(day, AbortSignal.any([request.signal, AbortSignal.timeout(8000)]))
      .then(found => {
        if (!request.signal.aborted) setRanked(current => found ?? current ?? null)
      })
      .catch(() => {
        // Unreachable: go by what this browser remembers.
        if (!request.signal.aborted) setRanked(current => current ?? null)
      })
    return () => request.abort()
  }, [day])

  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
  }, [])

  // A fresh board's clock starts once its cards are on screen.
  useEffect(() => {
    if (!clockPending) return
    return afterNextPaint(() => {
      const current = runRef.current
      if (current) putRun({ ...current, startedAtMs: Date.now() })
      setClockPending(false)
    })
  }, [clockPending])

  const shown = ranked ? 'ranked' : result ? 'practice' : run ? 'playing' : viewing ? 'viewing' : 'start'
  const spoilersHidden = shown === 'playing' || shown === 'start'
  useLayoutEffect(() => {
    for (const id of SPOILERS) document.getElementById(id)?.toggleAttribute('hidden', spoilersHidden)
  }, [spoilersHidden])

  const start = () => {
    const base = { day: dayKey(day), startedAtMs: Date.now(), misses: 0 }
    switch (day.kind) {
      case 'puzzle':
        putRun({ ...base, kind: 'puzzle', found: [], attempts: '' })
        break
      case 'daily': {
        const deal = startSoloDeal(day.seed)
        putRun({ ...base, kind: 'daily', board: deal.board, deck: deal.deck, rngState: deal.rng.getState(), sets: 0 })
        break
      }
      default: {
        const unknown: never = day
        throw new Error(`Unknown archive day: ${JSON.stringify(unknown)}`)
      }
    }
    setSelectedCards([])
    setRejectedCards([])
    setClockPending(true)
    track('archive_start', { mode: day.kind, number: day.number })
  }

  const stop = () => {
    autoReveal.cancel()
    putRun(null)
    setSelectedCards([])
    setViewing(true)
    track('archive_quit', { mode: day.kind, number: day.number })
  }

  const finish = (elapsedMs: number, misses: number, sets: number, marks?: string) => {
    const done: PracticeResult = { elapsedMs, misses, marks, finishedAtMs: Date.now() }
    savePracticeResult(day, done)
    runRef.current = null
    setRun(null)
    setResult(done)
    track('archive_complete', { mode: day.kind, number: day.number, seconds: seconds(elapsedMs), misses, sets })
  }

  const miss = (current: PracticeRun, cards: number[], message: string) => {
    putRun(current.kind === 'puzzle' ? { ...current, misses: current.misses + 1, attempts: `${current.attempts}m` } : { ...current, misses: current.misses + 1 })
    showToast(message, 'error')
    flashRejection(cards)
  }

  const claim = (cards: number[], thirdCardMissing = false, atMs = Date.now()) => {
    const current = runRef.current
    if (!current) return
    const sorted = [...cards].sort((a, b) => a - b)
    const tMs = atMs - current.startedAtMs
    setSelectedCards([])
    if (thirdCardMissing) return miss(current, cards, THIRD_CARD_MISSING)

    switch (current.kind) {
      case 'puzzle': {
        if (!isSet(sorted[0]!, sorted[1]!, sorted[2]!)) return miss(current, cards, missMessage('Not a set'))
        if (current.found.some(found => sameSet(found.cards, sorted))) {
          showToast('Already found', 'error')
          flashRejection(cards)
          return
        }
        const found = [...current.found, { cards: sorted, t_ms: tMs }]
        const attempts = `${current.attempts}h`
        setClaimAnimationKey(value => value + 1)
        playSet()
        if (found.length === SET_COUNT) return finish(tMs, current.misses, found.length, attempts)
        putRun({ ...current, found, attempts })
        showToast(`${found.length} of ${SET_COUNT}`)
        return
      }
      case 'daily': {
        const deal = restoreSoloDeal(current.board, current.deck, current.rngState)
        const outcome = applySoloClaim(deal, sorted)
        if (!outcome.ok) return miss(current, cards, missMessage(outcome.error))
        setClaimAnimationKey(value => value + 1)
        playSet()
        if (isRoundOver(deal)) return finish(tMs, current.misses, current.sets + 1)
        putRun({ ...current, board: deal.board, deck: deal.deck, rngState: deal.rng.getState(), sets: current.sets + 1 })
        showToast('Set found!')
        return
      }
      default: {
        const unknown: never = current
        throw new Error(`Unknown practice run: ${JSON.stringify(unknown)}`)
      }
    }
  }

  // The reveal's timer claims with whatever state is current by then.
  const claimRef = useRef(claim)
  claimRef.current = claim

  const board = run ? (run.kind === 'puzzle' && day.kind === 'puzzle' ? day.cards : run.kind === 'daily' ? run.board : []) : []

  const handleCardClick = (cardId: number) => {
    if (!run || clockPending || autoReveal.revealing) return
    const picked = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3 ? [...selectedCards, cardId] : selectedCards
    const pick = autoCompletePick(picked, board, twoCardModeOn(getSavedName()))
    if (pick.cards.length > selectedCards.length && pick.cards.length < 3 && !pick.missing) playSelection()
    setSelectedCards(pick.cards)
    if (pick.filled !== null) {
      const sorted = [...pick.cards].sort((a, b) => a - b)
      if (run.kind === 'puzzle' && run.found.some(found => sameSet(found.cards, sorted))) {
        if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
        setRejectedCards([])
        setSelectedCards([])
        showToast('Already found', 'error')
        autoReveal.reveal(pick.cards, pick.filled, undefined, false, 'repeat')
        return
      }
      const atMs = Date.now()
      autoReveal.reveal(pick.cards, pick.filled, () => claimRef.current(pick.cards, false, atMs), run.kind === 'daily')
    } else if (pick.cards.length === 3 || pick.missing) claim(pick.cards, pick.missing)
  }

  const name = `${NAMES[day.kind]} #${day.number}`
  const toastNode = toast && <Toast message={toast} onClose={() => setToast(null)} />

  if (shown === 'ranked' && ranked) {
    const standing = ranked.rank !== undefined && ranked.total !== undefined ? `${ordinal(ranked.rank)} of ${ranked.total}` : null
    return (
      <ResultCard
        state="ranked"
        label="Your result on the day"
        elapsedMs={ranked.elapsedMs}
        details={[standing, ranked.misses === null ? null : missCount(ranked.misses)]}
        marks={ranked.marks}
        marksLabel={day.kind === 'puzzle' ? 'Your attempts' : 'Your pace on each set'}
        note={`You played ${name} when it was live, and that result stands.`}
      />
    )
  }

  if (shown === 'practice' && result) {
    const place = practicePlace(result.elapsedMs, day)
    const standing = day.total === 0
      ? 'Nobody finished it on the day'
      : place === null ? `Outside the day’s top ${day.times.length}` : `${ordinal(place)} of ${day.total + 1} if it had counted`
    return (
      <>
        {toastNode}
        <ResultCard
          state="practice"
          label="Practice · not ranked"
          elapsedMs={result.elapsedMs}
          details={[standing, missCount(result.misses)]}
          marks={result.marks}
          marksLabel="Your attempts"
          note="Played from the archive, so it isn’t on the leaderboard and doesn’t count toward a streak."
        />
      </>
    )
  }

  if (shown === 'viewing') return null

  return (
    <div data-archive-game={shown} className="mb-6">
      {toastNode}
      {run && (
        <Hud>
          <SoloTimer startedAtMs={run.startedAtMs} elapsedMs={0} running={!clockPending} loading={false} />
          <HudChip tone="amber">Practice</HudChip>
          <HudDivider />
          {run.kind === 'puzzle' ? (
            <HudStat
              value={<><ScoreValue value={run.found.length} animationKey={claimAnimationKey} />/{SET_COUNT}</>}
              label="sets found"
              shortLabel="sets"
            />
          ) : (
            <>
              <HudStat value={run.deck.length} label="cards left" shortLabel="left" />
              <HudStat
                value={<ScoreValue value={run.sets} animationKey={claimAnimationKey} />}
                label={run.sets === 1 ? 'set found' : 'sets found'}
                shortLabel={run.sets === 1 ? 'set' : 'sets'}
              />
            </>
          )}
        </Hud>
      )}
      <Board
        cards={board}
        selectedCards={selectedCards}
        rejectedCards={rejectedCards}
        completedCards={autoReveal.cards}
        autoFilledCard={autoReveal.filled}
        completedLeaving={autoReveal.leaving}
        completedTone={autoReveal.tone}
        onCardClick={handleCardClick}
        claiming={clockPending}
        gameOver={!run}
        gameOverLabel={name}
        gameOverContent={
          <>
            <StartCard
              lines={START_LINES[day.kind]}
              action="Start practice"
              onStart={start}
              starting={ranked === undefined}
              streak={0}
              offerRules={false}
            />
            <button type="button" onClick={() => setViewing(true)} className={`${quietButton} -mb-2 mt-2`}>
              Show the board and solution
            </button>
          </>
        }
      />
      {run?.kind === 'puzzle' && <FoundSets found={run.found} total={SET_COUNT} latestKey={claimAnimationKey} />}
      {run && (
        <div className="mt-3 flex justify-center">
          <button type="button" onClick={stop} className={quietButton}>
            Stop and show the solution
          </button>
        </div>
      )}
    </div>
  )
}

interface ResultCardProps {
  state: 'ranked' | 'practice'
  label: string
  elapsedMs: number
  /** Short facts under the time; empty ones are left out. */
  details: (string | null)[]
  marks?: string
  marksLabel: string
  note: string
}

const ResultCard: React.FC<ResultCardProps> = ({ state, label, elapsedMs, details, marks, marksLabel, note }) => (
  <section
    data-archive-result={state}
    aria-label={label}
    className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-600 dark:bg-neutral-900"
  >
    {/* Centred, so the mark grid's legend opens inside the card at any width. */}
    <div className="flex flex-col items-center text-center">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-300">{label}</h2>
      <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">{formatTime(elapsedMs)}</div>
      <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">{details.filter(Boolean).join(' · ')}</p>
      {marks && <div className="mt-2"><MarkGrid marks={marks} label={marksLabel} /></div>}
    </div>
    <p className="mt-3 border-t border-neutral-100 pt-3 text-center text-xs leading-relaxed text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">{note}</p>
  </section>
)

export default ArchivePlay
