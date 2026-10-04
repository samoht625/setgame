import React, { useEffect, useState } from 'react'
import Header from './Header'
import MultiplayerGame from './MultiplayerGame'
import SolitaireGame from '../solitaire/SolitaireGame'
import { usePresence } from '../hooks/usePresence'
import { CardSymbols } from './CardFace'
import { SoundProvider } from './SoundProvider'

export type GameMode = 'multiplayer' | 'solo'

// Solo lives at the root; multiplayer at /m.
function modeFromPath(pathname: string): GameMode {
  return pathname === '/m' || pathname.startsWith('/m/') ? 'multiplayer' : 'solo'
}

function pathForMode(mode: GameMode): string {
  return mode === 'multiplayer' ? '/m' : '/'
}

// Must match the <title> each route renders in app/views/home.
const TITLES: Record<GameMode, string> = {
  solo: 'Set — Play the card game online, free',
  multiplayer: 'Set Multiplayer — Race friends to find sets'
}

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>(() => modeFromPath(window.location.pathname))
  // Only polled while in solo mode; multiplayer already shows the live roster.
  const othersOnline = usePresence(mode === 'solo')

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
    window.history.pushState({}, '', pathForMode(next))
    setMode(next)
  }

  return (
    <SoundProvider>
      <div className="min-h-dvh bg-neutral-100 text-neutral-900 antialiased dark:bg-[#111214] dark:text-neutral-100">
        <CardSymbols />
        <Header mode={mode} onSwitchMode={switchMode} othersOnline={othersOnline} />
        {mode === 'solo' ? <SolitaireGame /> : <MultiplayerGame />}
      </div>
    </SoundProvider>
  )
}

export default App
