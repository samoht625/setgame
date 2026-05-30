import React, { useEffect, useState } from 'react'
import Header from './Header'
import MultiplayerGame from './MultiplayerGame'
import SolitaireGame from '../solitaire/SolitaireGame'

export type GameMode = 'multiplayer' | 'solo'

function modeFromPath(pathname: string): GameMode {
  return pathname === '/s' || pathname.startsWith('/s/') ? 'solo' : 'multiplayer'
}

function pathForMode(mode: GameMode): string {
  return mode === 'solo' ? '/s' : '/'
}

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>(() => modeFromPath(window.location.pathname))

  useEffect(() => {
    const onPopState = () => setMode(modeFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.title = mode === 'solo' ? 'Set — Solo' : 'Set — Multiplayer'
  }, [mode])

  const switchMode = (next: GameMode) => {
    if (next === mode) return
    window.history.pushState({}, '', pathForMode(next))
    setMode(next)
  }

  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900 antialiased">
      <Header mode={mode} onSwitchMode={switchMode} />
      {mode === 'solo' ? <SolitaireGame /> : <MultiplayerGame />}
    </div>
  )
}

export default App
