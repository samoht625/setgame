import React, { useEffect, useRef, useState } from 'react'
import type { GameMode } from './App'
import CardFace from './CardFace'
import { useSound } from './SoundProvider'

interface HeaderProps {
  mode: GameMode
  onSwitchMode: (mode: GameMode) => void
  /** How many other people are in the multiplayer game right now. */
  othersOnline?: number
}

const Header: React.FC<HeaderProps> = ({ mode, onSwitchMode, othersOnline = 0 }) => {
  const sound = useSound()
  const [showLogoSet, setShowLogoSet] = useState(false)
  const taps = useRef({ count: 0, lastAt: 0 })
  const logoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (logoTimeout.current) clearTimeout(logoTimeout.current) }, [])

  const tapLogo = () => {
    const now = Date.now()
    taps.current = { count: now - taps.current.lastAt < 2000 ? taps.current.count + 1 : 1, lastAt: now }
    if (taps.current.count < 3) return
    taps.current.count = 0
    setShowLogoSet(true)
    if (logoTimeout.current) clearTimeout(logoTimeout.current)
    logoTimeout.current = setTimeout(() => setShowLogoSet(false), 4000)
  }

  const segment = (value: GameMode, label: string) => {
    const isActive = mode === value
    const showJewel = value === 'multiplayer' && !isActive && othersOnline > 0
    const jewelTitle = `${othersOnline} ${othersOnline === 1 ? 'person is' : 'people are'} playing multiplayer right now`

    return (
      <button
        type="button"
        onClick={() => onSwitchMode(value)}
        aria-pressed={isActive}
        title={showJewel ? jewelTitle : undefined}
        className={`relative min-h-9 rounded-full px-2.5 text-sm transition-colors sm:px-3.5 ${
          isActive
            ? 'bg-white font-medium text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
            : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white'
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
    <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur dark:border-neutral-800/80 dark:bg-neutral-900/95">
      <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between gap-1 px-3 md:px-8">
        <button type="button" aria-label="Set logo" onClick={tapLogo} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg sm:gap-2">
          <span className="text-lg font-semibold tracking-tight">Set</span>
          <span className="flex h-7 w-11 items-center justify-center gap-1" aria-hidden="true">
            {showLogoSet ? (
              <span data-logo-set className="flex w-full gap-0.5 animate-logo-reveal">
                {[1, 4, 7].map(cardId => <CardFace key={cardId} cardId={cardId} decorative className="h-auto min-w-0 flex-1 rounded-sm" />)}
              </span>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
              </>
            )}
          </span>
          {showLogoSet && <span role="status" className="sr-only">You found a little set!</span>}
        </button>

        <div className="flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={sound.toggle} aria-label={sound.enabled ? 'Mute sound' : 'Enable sound'} aria-pressed={sound.enabled} title={sound.enabled ? 'Sound on' : 'Sound off'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
              <path d="M11 5 6 9H3v6h3l5 4z" />
              {sound.enabled ? <><path d="M15 8a6 6 0 0 1 0 8" /><path d="M18 5a10 10 0 0 1 0 14" /></> : <path d="m16 9 6 6m0-6-6 6" />}
            </svg>
          </button>
          <nav aria-label="Game mode" className="flex items-center rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
            {segment('solo', 'Solo')}
            {segment('multiplayer', 'Multiplayer')}
          </nav>
        </div>
      </div>
    </header>
  )
}

export default Header
