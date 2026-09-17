import React, { useEffect, useState } from 'react'
import Header from './Header'
import MultiplayerGame from './MultiplayerGame'
import SolitaireGame from '../solitaire/SolitaireGame'
import CardGallery from './CardGallery'
import { usePresence } from '../hooks/usePresence'
import { CardSymbols } from './CardFace'
import { SoundProvider } from './SoundProvider'

export type GameMode = 'multiplayer' | 'solo'

type AppView = GameMode | 'gallery'

// Solo lives at the root; multiplayer at /m; artwork gallery at /gallery.
function viewFromPath(pathname: string): AppView {
  if (pathname === '/gallery' || pathname.startsWith('/gallery/')) return 'gallery'
  return pathname === '/m' || pathname.startsWith('/m/') ? 'multiplayer' : 'solo'
}

function pathForMode(mode: GameMode): string {
  return mode === 'multiplayer' ? '/m' : '/'
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(() => viewFromPath(window.location.pathname))
  // Only polled while in solo mode; multiplayer already shows the live roster.
  const othersOnline = usePresence(view === 'solo')

  useEffect(() => {
    const onPopState = () => setView(viewFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    document.title =
      view === 'gallery' ? 'Set — Card gallery' : view === 'solo' ? 'Set — Solo' : 'Set — Multiplayer'
  }, [view])

  const switchMode = (next: GameMode) => {
    if (next === view) return
    window.history.pushState({}, '', pathForMode(next))
    setView(next)
  }

  if (view === 'gallery') {
    return <CardGallery />
  }

  return (
    <SoundProvider>
      <div className="min-h-dvh bg-neutral-100 text-neutral-900 antialiased dark:bg-[#111214] dark:text-neutral-100">
        <CardSymbols />
        <Header mode={view} onSwitchMode={switchMode} othersOnline={othersOnline} />
        {view === 'solo' ? <SolitaireGame /> : <MultiplayerGame />}
      </div>
    </SoundProvider>
  )
}

export default App
