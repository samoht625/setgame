import React from 'react'
import type { GameMode } from './App'

interface HeaderProps {
  mode: GameMode
  onSwitchMode: (mode: GameMode) => void
}

const Header: React.FC<HeaderProps> = ({ mode, onSwitchMode }) => {
  const segment = (value: GameMode, label: string) => {
    const isActive = mode === value
    return (
      <button
        type="button"
        onClick={() => onSwitchMode(value)}
        aria-pressed={isActive}
        className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
          isActive
            ? 'bg-white font-medium text-neutral-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-800'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-semibold tracking-tight">Set</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
          </span>
        </div>

        <nav aria-label="Game mode" className="flex items-center rounded-full bg-neutral-200/70 p-1">
          {segment('solo', 'Solo')}
          {segment('multiplayer', 'Multiplayer')}
        </nav>
      </div>
    </header>
  )
}

export default Header
