import React, { useEffect, useState } from 'react'
import Header from './Header'
import MultiplayerGame from './MultiplayerGame'
import SolitaireGame from '../solitaire/SolitaireGame'
import DailyGame from '../daily/DailyGame'
import { usePresence } from '../hooks/usePresence'
import { CardSymbols } from './CardFace'
import { SoundProvider } from './SoundProvider'

export type GameMode = 'multiplayer' | 'daily' | 'solo'

const PATHS: Record<GameMode, string> = {
  solo: '/',
  daily: '/daily',
  multiplayer: '/m'
}

// Solo lives at the root, the daily deal at /daily, multiplayer at /m.
function modeFromPath(pathname: string): GameMode {
  if (pathname === '/m' || pathname.startsWith('/m/')) return 'multiplayer'
  if (pathname === '/daily' || pathname.startsWith('/daily/')) return 'daily'
  return 'solo'
}

// Must match the <title> each route renders in app/views/home.
const TITLES: Record<GameMode, string> = {
  solo: 'Set — Play the card game online, free',
  daily: 'Set Daily — Today’s deal, same for everyone',
  multiplayer: 'Set Multiplayer — Race friends to find sets'
}

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>(() => modeFromPath(window.location.pathname))
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
    if (next === mode) return
    window.history.pushState({}, '', PATHS[next])
    setMode(next)
  }

  return (
    <SoundProvider>
      <div className="min-h-dvh bg-neutral-100 text-neutral-900 antialiased dark:bg-[#111214] dark:text-neutral-100">
        <CardSymbols />
        <Header mode={mode} onSwitchMode={switchMode} othersOnline={othersOnline} />
        {mode === 'solo' ? <SolitaireGame /> : mode === 'daily' ? <DailyGame /> : <MultiplayerGame />}
      </div>
    </SoundProvider>
  )
}

export default App
