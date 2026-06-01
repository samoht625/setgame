import React from 'react'
import type { GameMode } from './App'

interface HeaderProps {
  mode: GameMode
  onSwitchMode: (mode: GameMode) => void
  /** How many other people are in the multiplayer game right now. */
  othersOnline?: number
}

const Header: React.FC<HeaderProps> = ({ mode, onSwitchMode, othersOnline = 0 }) => {
  const segment = (value: GameMode, label: string) => {
    const isActive = mode === value
    // A little jewel on the Multiplayer pill when others are at the table.
    const showJewel = value === 'multiplayer' && !isActive && othersOnline > 0
    const jewelTitle = `${othersOnline} ${othersOnline === 1 ? 'person is' : 'people are'} playing multiplayer right now`

    return (
      <button
        type="button"
        onClick={() => onSwitchMode(value)}
        aria-pressed={isActive}
        title={showJewel ? jewelTitle : undefined}
        className={`relative rounded-full px-3.5 py-1.5 text-sm transition-colors ${
          isActive
            ? 'bg-white font-medium text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
            : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
        }`}
      >
        {label}
        {showJewel && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" aria-hidden="true" />
            <span className="relative inline-flex h-2.5 w-2.5 rotate-45 rounded-[3px] bg-emerald-500 shadow-sm ring-1 ring-white dark:ring-neutral-900" aria-hidden="true" />
            <span className="sr-only">{jewelTitle}</span>
          </span>
        )}
      </button>
    )
  }

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/85 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/85">
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-semibold tracking-tight">Set</span>
          <span className="flex items-center gap-1" aria-hidden="true">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
          </span>
        </div>

        <nav aria-label="Game mode" className="flex items-center rounded-full bg-neutral-200/70 p-1 dark:bg-neutral-800/70">
          {segment('solo', 'Solo')}
          {segment('multiplayer', 'Multiplayer')}
        </nav>
      </div>
    </header>
  )
}

export default Header
