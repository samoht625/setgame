import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import CardFace from '../components/CardFace'
import { ordinal } from '../lib/daily'
import {
  DEFAULT_REPLAY_SPEED,
  frameAt,
  leadSegments,
  replayBoards,
  REPLAY_SPEEDS,
  toReplaySpeed,
  type ReplayFrame,
  type ReplaySpeed,
  type RunTiming,
  type Side
} from '../lib/daily_replay'
import { fetchDailyComparison, type DailyComparison, type DailyEntry, type DailyReplayRun } from '../lib/solo_api'
import { formatTime } from '../solitaire/time'

// Orange and blue: the pair that stays apart for most kinds of colour blindness.
const TONES: Record<Side, { dot: string; ring: string; bar: string }> = {
  me: { dot: 'bg-amber-500 dark:bg-amber-400', ring: 'ring-amber-500 dark:ring-amber-400', bar: 'bg-amber-400 dark:bg-amber-500' },
  them: { dot: 'bg-sky-600 dark:bg-sky-400', ring: 'ring-sky-600 dark:ring-sky-400', bar: 'bg-sky-500 dark:bg-sky-500' }
}

// In real time, however fast the replay runs: long enough to see which set was taken.
const FOUND_SET_MS = 450

const SPEED_KEY = 'setgame_replay_speed'

function loadSpeed(): ReplaySpeed {
  try { return toReplaySpeed(localStorage.getItem(SPEED_KEY)) } catch { return DEFAULT_REPLAY_SPEED }
}

function saveSpeed(speed: ReplaySpeed) {
  try { localStorage.setItem(SPEED_KEY, String(speed)) } catch { /* Keep the speed for this replay. */ }
}

type Replay = {
  data: DailyComparison
  boards: Record<Side, number[][]>
  timing: Record<Side, RunTiming>
}

function prepare(data: DailyComparison): Replay {
  const timing = (run: DailyReplayRun): RunTiming => ({
    times: run.claims.map(claim => claim.t_ms),
    finishMs: Math.max(run.elapsed_ms, run.claims[run.claims.length - 1]?.t_ms ?? 0)
  })
  return {
    data,
    boards: { me: replayBoards(data.seed, data.me.claims), them: replayBoards(data.seed, data.them.claims) },
    timing: { me: timing(data.me), them: timing(data.them) }
  }
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const Dot: React.FC<{ side: Side }> = ({ side }) => <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${TONES[side].dot}`} />

const Team: React.FC<{ side: Side; name: string; run: DailyReplayRun }> = ({ side, name, run }) => (
  <div className={`flex min-w-0 flex-col ${side === 'me' ? 'items-end text-right' : 'items-start text-left'}`}>
    <span className={`flex max-w-full items-center gap-1.5 ${side === 'me' ? 'flex-row-reverse' : ''}`}>
      <Dot side={side} />
      <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{name}</span>
    </span>
    <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
      {formatTime(run.elapsed_ms)} · {ordinal(run.rank)}
    </span>
  </div>
)

const MiniBoard: React.FC<{ side: Side; label: string; frame: ReplayFrame; finishedAt: number | null }> = ({ side, label, frame, finishedAt }) => (
  <figure className="min-w-0">
    <figcaption className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
      <Dot side={side} />
      <span className="truncate">{label}</span>
    </figcaption>
    {/* Twelve empty cells hold the board's footprint; the cards and the done badge share their grid cell. */}
    <div className="grid">
      <div aria-hidden="true" className="col-start-1 row-start-1 grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5">
        {Array.from({ length: 12 }, (_, index) => <div key={index} className="aspect-[258/167]" />)}
      </div>
      <div
        role="img"
        aria-label={`${label}: ${frame.board.length} cards, ${frame.sets} ${frame.sets === 1 ? 'set' : 'sets'} found`}
        className={`col-start-1 row-start-1 grid grid-cols-3 content-start gap-1 sm:grid-cols-4 sm:gap-1.5 ${finishedAt !== null ? 'opacity-30' : ''}`}
      >
        {frame.board.map(cardId => {
          const highlight = frame.found
            ? frame.found.includes(cardId) ? `relative z-[1] ring-2 ${TONES[side].ring}` : 'opacity-40'
            : ''
          return (
            <div
              key={cardId}
              data-replay-card={cardId}
              data-found={frame.found?.includes(cardId) ? 'true' : undefined}
              className={`animate-card-in overflow-hidden rounded-md border border-neutral-200 bg-white dark:border-neutral-600 dark:bg-[#f1f0ec] ${highlight}`}
            >
              <CardFace cardId={cardId} decorative />
            </div>
          )
        })}
      </div>
      {finishedAt !== null && (
        <div className="col-start-1 row-start-1 flex items-center justify-center">
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-neutral-900 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700">
            Done · {formatTime(finishedAt)}
          </span>
        </div>
      )}
    </div>
  </figure>
)

/** One player's sets along the shared clock, with a finish line at their time. */
const Lane: React.FC<{ side: Side; timing: RunTiming; t: number; end: number }> = ({ side, timing, t, end }) => {
  const at = (ms: number) => `${(ms / end) * 100}%`
  return (
    <div className="relative h-5">
      <div className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-neutral-200 dark:bg-neutral-700" style={{ width: at(timing.finishMs) }} />
      {timing.times.map((ms, index) => (
        <span
          key={index}
          data-claim={side}
          className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-neutral-900 ${TONES[side].dot} ${ms <= t ? '' : 'opacity-25'}`}
          style={{ left: at(ms) }}
        />
      ))}
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-4 w-0.5 -translate-x-1/2 rounded-full ${TONES[side].dot} ${timing.finishMs <= t ? '' : 'opacity-25'}`}
        style={{ left: at(timing.finishMs) }}
      />
    </div>
  )
}

/** Who was ahead, moment by moment: solid up to the playhead, faint after it. */
const LeadBand: React.FC<{ timing: Record<Side, RunTiming>; t: number; end: number }> = ({ timing, t, end }) => {
  const segments = useMemo(() => leadSegments(timing.me, timing.them), [timing])
  const parts = segments.flatMap(({ from, to, leader }) => [
    { from, to: Math.min(to, t), leader, past: true },
    { from: Math.max(from, t), to, leader, past: false }
  ]).filter(part => part.to > part.from)
  return (
    <div className="relative my-1 h-1 overflow-hidden rounded-full">
      {parts.map(({ from, to, leader, past }) => (
        <span
          key={`${from}-${past}`}
          data-lead={leader ?? 'level'}
          className={`absolute inset-y-0 ${leader ? TONES[leader].bar : 'bg-neutral-200 dark:bg-neutral-700'} ${past ? '' : 'opacity-25'}`}
          style={{ left: `${(from / end) * 100}%`, width: `${((to - from) / end) * 100}%` }}
        />
      ))}
    </div>
  )
}

const PlayIcon: React.FC<{ playing: boolean }> = ({ playing }) => (
  <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
    {playing ? <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" /> : <path d="M4.5 2.2v11.6a.5.5 0 0 0 .77.42l9-5.8a.5.5 0 0 0 0-.84l-9-5.8a.5.5 0 0 0-.77.42Z" />}
  </svg>
)

const SpeedPicker: React.FC<{ speed: ReplaySpeed; onChange: (speed: ReplaySpeed) => void }> = ({ speed, onChange }) => {
  const name = useId()
  return (
    <div role="radiogroup" aria-label="Replay speed" className="flex rounded-full bg-neutral-100 p-0.5 dark:bg-neutral-800">
      {REPLAY_SPEEDS.map(option => (
        <label
          key={option}
          className="flex h-8 min-w-10 cursor-pointer items-center justify-center rounded-full px-2 text-xs font-medium tabular-nums text-neutral-500 transition-colors hover:text-neutral-900 has-[:checked]:bg-white has-[:checked]:text-neutral-900 has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 dark:has-[:checked]:bg-neutral-600 dark:has-[:checked]:text-neutral-100 dark:has-[:focus-visible]:outline-neutral-100"
        >
          <input
            type="radio"
            name={name}
            value={option}
            checked={option === speed}
            onChange={() => onChange(option)}
            className="sr-only"
          />
          {option}×
        </label>
      ))}
    </div>
  )
}

const ReplayView: React.FC<{ replay: Replay; name: string }> = ({ replay, name }) => {
  const { data, boards, timing } = replay
  const end = Math.max(timing.me.finishMs, timing.them.finishMs, 1)
  const [speed, setSpeed] = useState(loadSpeed)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const tRef = useRef(0)

  const seek = (next: number) => {
    tRef.current = next
    setT(next)
  }

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const next = Math.min(end, tRef.current + (now - last) * speed)
      last = now
      seek(next)
      if (next >= end) setPlaying(false)
      else frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, end, speed])

  // Every moment something happened, for stepping set by set from the keyboard.
  const moments = useMemo(
    () => [...new Set([...timing.me.times, ...timing.them.times, timing.me.finishMs, timing.them.finishMs])].sort((a, b) => a - b),
    [timing]
  )
  const step = (direction: 1 | -1) => {
    const now = tRef.current
    const next = direction > 0 ? moments.find(ms => ms > now) ?? end : [...moments].reverse().find(ms => ms < now) ?? 0
    setPlaying(false)
    seek(next)
  }

  const toggle = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (tRef.current >= end) seek(0)
    setPlaying(true)
  }

  const foundMs = FOUND_SET_MS * speed
  const mine = frameAt(boards.me, data.me.claims, t, foundMs)
  const theirs = frameAt(boards.them, data.them.claims, t, foundMs)
  const doneAt = (side: Side) => (t >= timing[side].finishMs ? data[side].elapsed_ms : null)

  return (
    <>
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Team side="me" name="You" run={data.me} />
        <div className="text-center">
          <div data-testid="replay-score" className="text-3xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">
            {mine.sets}<span className="mx-1.5 text-neutral-300 dark:text-neutral-600">–</span>{theirs.sets}
          </div>
          <div data-testid="replay-clock" className="text-xs font-medium tabular-nums text-neutral-500 dark:text-neutral-400">{formatTime(t)}</div>
        </div>
        <Team side="them" name={name} run={data.them} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5">
        <MiniBoard side="me" label="Your board" frame={mine} finishedAt={doneAt('me')} />
        <MiniBoard side="them" label={`${name}’s board`} frame={theirs} finishedAt={doneAt('them')} />
      </div>

      <div className="mt-5" data-testid="replay-timeline">
        <div className="flex gap-2">
          <div className="flex w-11 shrink-0 flex-col text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
            <span className="flex h-5 items-center">You</span>
            <span className="my-1 h-1" />
            <span className="flex h-5 items-center truncate">{name}</span>
          </div>
          <div className="relative min-w-0 flex-1 rounded-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-neutral-900 dark:has-[:focus-visible]:outline-neutral-100">
            <Lane side="me" timing={timing.me} t={t} end={end} />
            <LeadBand timing={timing} t={t} end={end} />
            <Lane side="them" timing={timing.them} t={t} end={end} />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-0.5 -top-0.5 w-0.5 -translate-x-1/2 rounded-full bg-neutral-900 dark:bg-neutral-100"
              style={{ left: `${(t / end) * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={end}
              step={100}
              value={t}
              onChange={event => {
                setPlaying(false)
                seek(Number(event.target.value))
              }}
              onKeyDown={event => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                event.preventDefault()
                step(event.key === 'ArrowRight' ? 1 : -1)
              }}
              aria-label="Replay time"
              aria-valuetext={`${formatTime(t)}: you ${mine.sets}, ${name} ${theirs.sets}`}
              className="scrubber absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>
        </div>
        <div className="ml-13 mt-1 flex justify-between text-[10px] tabular-nums text-neutral-500 dark:text-neutral-400">
          <span>0:00</span>
          <span>{formatTime(end)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3" data-testid="replay-controls">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        >
          <PlayIcon playing={playing} />
        </button>
        <span className="min-w-0 flex-1 text-left text-[11px] text-neutral-500 dark:text-neutral-400">Same deal, replayed</span>
        <SpeedPicker
          speed={speed}
          onChange={next => {
            setSpeed(next)
            saveSpeed(next)
          }}
        />
      </div>
    </>
  )
}

interface DailyCompareProps {
  date: string
  number: number
  opponent: DailyEntry
  onClose: () => void
}

/** The player's finished daily replayed next to another finisher's, with both on one timeline. */
const DailyCompare: React.FC<DailyCompareProps> = ({ date, number, opponent, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [replay, setReplay] = useState<Replay | 'loading' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const name = opponent.display_name || 'Anonymous'

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  useEffect(() => {
    const request = new AbortController()
    setReplay('loading')
    fetchDailyComparison(date, opponent.player_id, request.signal)
      .then(data => {
        if (!request.signal.aborted) setReplay(prepare(data))
      })
      .catch(() => {
        if (!request.signal.aborted) setReplay('error')
      })
    return () => request.abort()
  }, [date, opponent.player_id, attempt])

  return (
    <dialog
      ref={dialogRef}
      aria-label={`You vs ${name}`}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}
      onClick={event => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden border-0 bg-transparent p-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] open:flex backdrop:bg-neutral-900/35 backdrop:backdrop-blur-[1px] sm:items-center sm:p-6 dark:backdrop:bg-black/55"
    >
      <div className="animate-dialog-in max-h-full w-full max-w-2xl overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-3 text-neutral-900 shadow-2xl sm:p-6 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Set Daily #{number}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4 stroke-current" fill="none" strokeWidth="1.75" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {replay === 'loading' ? (
          <p role="status" className="py-16 text-center text-sm text-neutral-500 dark:text-neutral-400">Loading replay…</p>
        ) : replay === 'error' ? (
          <div className="py-14 text-center">
            <p role="status" className="text-sm text-neutral-700 dark:text-neutral-200">Couldn’t load this replay.</p>
            <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-1 min-h-9 rounded-md px-3 text-xs font-medium underline underline-offset-4">
              Try again
            </button>
          </div>
        ) : (
          <ReplayView replay={replay} name={name} />
        )}
      </div>
    </dialog>
  )
}

export default DailyCompare
