import React, { useEffect, useState } from 'react'
import Header from './Header'
import MultiplayerGame from './MultiplayerGame'
import SolitaireGame from '../solitaire/SolitaireGame'
import DailyGame from '../daily/DailyGame'
import PuzzleGame from '../puzzle/PuzzleGame'
import { usePresence } from '../hooks/usePresence'
import { CardSymbols } from './CardFace'
import { SoundProvider } from './SoundProvider'
import { GameMenuProvider } from './GameMenu'
import HowToPlay from '../rules/HowToPlay'
import NameDialog from './NameDialog'
import Tour, { shouldShowTour } from '../rules/Tour'

// 'solo' is Practice: timed games against the clock.
export type GameMode = 'daily' | 'puzzle' | 'solo' | 'multiplayer'

const PATHS: Record<GameMode, string> = {
  daily: '/',
  puzzle: '/puzzle',
  solo: '/practice',
  multiplayer: '/m'
}

// The Daily Deal is the front door (/ and the old /daily), the Puzzle is at
// /puzzle, Practice at /practice and multiplayer at /m.
function modeFromPath(pathname: string): GameMode {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/m' || path.startsWith('/m/')) return 'multiplayer'
  if (path === '/puzzle') return 'puzzle'
  if (path === '/practice') return 'solo'
  return 'daily'
}

// Must match the <title> each route renders in app/views/home.
const TITLES: Record<GameMode, string> = {
  daily: 'Set Daily Deal — Today’s deal, same for everyone',
  puzzle: 'Set Puzzle — Find all 6 sets in today’s 12 cards',
  solo: 'Set Practice — Timed solo games, free',
  multiplayer: 'Set Multiplayer — Race friends to find sets'
}

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>(() => modeFromPath(window.location.pathname))
  // First visit only; see shouldShowTour.
  const [touring, setTouring] = useState(shouldShowTour)
  // Not polled in multiplayer, which already shows the live roster.
  const othersOnline = usePresence(mode !== 'multiplayer')

  useEffect(() => {
    const onPopState = () => setMode(modeFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.title = TITLES[mode]
  }, [mode])

  const switchMode = (next: GameMode) => {
    if (next === mode && window.location.pathname === PATHS[next]) return
    window.history.pushState({}, '', PATHS[next])
    setMode(next)
  }

  return (
    <SoundProvider>
      <GameMenuProvider>
      <div className="min-h-dvh bg-neutral-100 text-neutral-900 antialiased dark:bg-[#111214] dark:text-neutral-100">
        <CardSymbols />
        <Header mode={mode} onSwitchMode={switchMode} othersOnline={othersOnline} />
        {/* A practice deal (and its clock) waits for the tour; the dailies' clocks only start on Start. */}
        {mode === 'solo' ? <SolitaireGame holdDeal={touring} /> : mode === 'daily' ? <DailyGame /> : mode === 'puzzle' ? <PuzzleGame /> : <MultiplayerGame />}
        {touring && <Tour onDone={() => setTouring(false)} />}
        <HowToPlay />
        <NameDialog />
      </div>
      </GameMenuProvider>
    </SoundProvider>
  )
}

export default App
