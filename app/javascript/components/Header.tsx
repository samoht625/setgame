import React, { useEffect, useRef, useState } from 'react'
import type { GameMode } from './App'
import CardFace from './CardFace'
import { useSound } from './SoundProvider'
import { openHowToPlay } from '../rules/HowToPlay'
import { MenuButton } from './GameMenu'

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

  const segment = (value: GameMode, label: string, narrowLabel?: string) => {
    const isActive = mode === value
    const showJewel = value === 'multiplayer' && !isActive && othersOnline > 0
    const jewelTitle = `${othersOnline} ${othersOnline === 1 ? 'person is' : 'people are'} playing multiplayer right now`

    return (
      <button
        type="button"
        onClick={() => onSwitchMode(value)}
        aria-pressed={isActive}
        title={showJewel ? jewelTitle : undefined}
        className={`relative min-h-8 rounded-full px-2.5 text-sm transition-colors sm:px-3 ${
          isActive
            ? 'bg-white font-medium text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
            : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white'
        }`}
      >
        {narrowLabel ? (
          <>
            <span aria-hidden="true" className="min-[420px]:hidden">{narrowLabel}</span>
            <span className="max-[420px]:sr-only">{label}</span>
          </>
        ) : label}
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
    <header>
      <div className="mx-auto flex h-12 w-full max-w-screen-2xl items-center justify-between gap-1 px-3 md:px-6 lg:px-10">
        <button type="button" aria-label="Set logo" onClick={tapLogo} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg sm:gap-2">
          <span className="text-base font-semibold tracking-tight">Set</span>
          <span className="flex h-6 w-11 items-center justify-center gap-1" aria-hidden="true">
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

        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <nav aria-label="Game mode" className="flex items-center rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
            {segment('solo', 'Solo')}
            {segment('daily', 'Daily')}
            {segment('multiplayer', 'Multiplayer', 'Multi')}
          </nav>
          <MenuButton
            appItems={[
              { label: 'How to play', onSelect: openHowToPlay },
              { label: 'Sound', onSelect: sound.toggle, checked: sound.enabled }
            ]}
          />
        </div>
      </div>
    </header>
  )
}

export default Header
