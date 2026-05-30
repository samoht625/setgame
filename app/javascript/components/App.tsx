import React, { useEffect, useState } from 'react'
import Header from './Header'
import MultiplayerGame from './MultiplayerGame'
import SolitaireGame from '../solitaire/SolitaireGame'
import { usePresence } from '../hooks/usePresence'

export type GameMode = 'multiplayer' | 'solo'

// Solo lives at the root; multiplayer at /m. (Legacy /s redirects to /.)
function modeFromPath(pathname: string): GameMode {
  return pathname === '/m' || pathname.startsWith('/m/') ? 'multiplayer' : 'solo'
}

function pathForMode(mode: GameMode): string {
  return mode === 'multiplayer' ? '/m' : '/'
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
    document.title = mode === 'solo' ? 'Set — Solo' : 'Set — Multiplayer'
  }, [mode])

  // Warm the browser cache with all 81 card images (~0.5 MB total) shortly
  // after load so replacement cards appear instantly instead of popping in.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (let id = 1; id <= 81; id++) {
        const img = new Image()
        img.src = `/cards/${id}.png`
      }
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [])

  const switchMode = (next: GameMode) => {
    if (next === mode) return
    window.history.pushState({}, '', pathForMode(next))
    setMode(next)
  }

  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900 antialiased">
      <Header mode={mode} onSwitchMode={switchMode} othersOnline={othersOnline} />
      {mode === 'solo' ? <SolitaireGame /> : <MultiplayerGame />}
    </div>
  )
}

export default App
