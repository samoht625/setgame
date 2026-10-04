import React from 'react'
import type { SoloStatus } from './SolitaireGame'
import { Hud, HudChip, HudDivider, HudIconButton, HudStat, RestartIcon } from '../components/Hud'
import { useGameMenu } from '../components/GameMenu'
import ScoreValue from '../components/ScoreValue'
import { formatTime } from './time'

interface SolitaireHudProps {
  elapsedMs: number
  startedAtMs: number
  isStarting: boolean
  deckCount: number
  setsFound: number
  /** Changes on each live claim so restored counts do not animate. */
  claimAnimationKey?: string | number | null
  status: SoloStatus
  onTogglePause: () => void
  onRestart: () => void
  panelOpen: boolean
  onTogglePanel: () => void
}

export const SoloTimer: React.FC<{ startedAtMs: number; elapsedMs: number; running: boolean; loading: boolean }> = ({
  startedAtMs, elapsedMs, running, loading
}) => {
  const [now, setNow] = React.useState(Date.now)

  React.useEffect(() => {
    if (!running) return
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    tick()
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [running, startedAtMs])

  return (
    <div role="timer" aria-label="Elapsed time" className="min-w-[3.25rem] text-xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-2xl">
      {loading ? '—' : formatTime(Math.max(0, running ? now - startedAtMs : elapsedMs))}
    </div>
  )
}

/** Timer, the two numbers that matter and a New game button; the other controls live in the header menu. */
const SolitaireHud: React.FC<SolitaireHudProps> = ({
  elapsedMs,
  startedAtMs,
  isStarting,
  deckCount,
  setsFound,
  claimAnimationKey,
  status,
  onTogglePause,
  onRestart,
  panelOpen,
  onTogglePanel
}) => {
  const isFinished = status === 'round_over'
  const isPaused = status === 'paused'

  // "In play" is the default, so only the exceptions get a chip.
  const statusChip = isStarting
    ? { label: 'Dealing', tone: 'neutral' as const }
    : isFinished
      ? { label: 'Finished', tone: 'amber' as const }
      : isPaused
        ? { label: 'Paused', tone: 'neutral' as const }
        : null

  useGameMenu([
    ...(isFinished ? [] : [{ label: isPaused ? 'Resume' : 'Pause', onSelect: onTogglePause, disabled: isStarting }]),
    { label: 'New game', onSelect: onRestart, disabled: isStarting },
    { label: 'Leaderboard', onSelect: onTogglePanel }
  ])

  return (
    <Hud
      actions={
        <HudIconButton label="New game" onClick={onRestart} disabled={isStarting}>
          <RestartIcon />
        </HudIconButton>
      }
    >
      <SoloTimer startedAtMs={startedAtMs} elapsedMs={elapsedMs} running={!isStarting && status === 'playing'} loading={isStarting} />
      {statusChip && <HudChip tone={statusChip.tone}>{statusChip.label}</HudChip>}
      <HudDivider />
      <HudStat value={deckCount} label="cards left" shortLabel="left" />
      <HudStat
        value={<ScoreValue value={setsFound} animationKey={claimAnimationKey} />}
        label={setsFound === 1 ? 'set found' : 'sets found'}
        shortLabel={setsFound === 1 ? 'set' : 'sets'}
      />
    </Hud>
  )
}

export default SolitaireHud
