import React, { useEffect, useRef, useState } from 'react'
import type { GameMode } from './App'
import CardFace from './CardFace'
import { useSound } from './SoundProvider'
import { openHowToPlay } from '../rules/HowToPlay'
import { openNameDialog } from './NameDialog'
import { MenuButton } from './GameMenu'
import { openSignInDialog } from './SignInDialog'
import { signedInEmail, signInEnabled } from '../lib/player_id'
import { signOut } from '../lib/account'
import { openReminderDialog } from './ReminderDialog'
import { useReminder } from '../hooks/useReminder'
import { reminderLabel } from '../lib/reminder'

interface HeaderProps {
  mode: GameMode
  onSwitchMode: (mode: GameMode) => void
  /** How many other people are in the multiplayer game right now (shown in the menu). */
  othersOnline?: number
}

const Header: React.FC<HeaderProps> = ({ mode, onSwitchMode, othersOnline = 0 }) => {
  const sound = useSound()
  const reminder = useReminder()
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

  // Practice and multiplayer live in the menu; the switch only shows one while you're in it.
  const secondary = mode === 'solo' || mode === 'multiplayer'

  const segment = (value: GameMode, label: string, narrowLabel?: string) => {
    const isActive = mode === value

    return (
      <button
        type="button"
        onClick={() => onSwitchMode(value)}
        aria-pressed={isActive}
        className={`relative min-h-8 whitespace-nowrap rounded-full px-2.5 text-sm transition-colors sm:px-3 ${
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
      </button>
    )
  }

  return (
    <header>
      <div className="mx-auto flex h-12 w-full max-w-screen-2xl items-center justify-between gap-1 px-3 md:px-6 lg:px-10">
        <button type="button" aria-label="Set logo" onClick={tapLogo} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg sm:gap-2">
          {/* On narrow phones with a third segment, the logo's little set shows in place of the word. */}
          <span className={`text-base font-semibold tracking-tight ${secondary && showLogoSet ? 'max-[419px]:hidden' : ''}`}>Set</span>
          {/* Gives way on narrow phones when the switch has a third segment (Practice, Multiplayer). */}
          <span className={`h-6 w-11 items-center justify-center gap-1 ${secondary && !showLogoSet ? 'hidden min-[420px]:flex' : 'flex'}`} aria-hidden="true">
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
            {segment('daily', 'Daily Deal', secondary ? 'Daily' : undefined)}
            {segment('puzzle', 'Puzzle')}
            {mode === 'solo' && segment('solo', 'Practice')}
            {mode === 'multiplayer' && segment('multiplayer', 'Multiplayer', 'Multi')}
          </nav>
          <MenuButton
            modeItems={[
              ...(mode === 'solo' ? [] : [{ label: 'Practice', onSelect: () => onSwitchMode('solo') }]),
              ...(mode === 'multiplayer' ? [] : [{ label: 'Multiplayer', onSelect: () => onSwitchMode('multiplayer'), badge: othersOnline }])
            ]}
            appItems={[
              { label: 'How to play', onSelect: openHowToPlay },
              { label: 'Stats', onSelect: () => window.location.assign('/stats') },
              { label: 'Your name', onSelect: openNameDialog },
              { label: 'Sound', onSelect: sound.toggle, checked: sound.enabled },
              ...(signedInEmail()
                ? [
                    { label: 'Reminder', note: `Signed in as ${signedInEmail()}`, detail: reminder?.enabled ? reminderLabel(reminder.minutes) : 'Off', onSelect: openReminderDialog },
                    { label: 'Sign out', onSelect: () => void signOut() }
                  ]
                : signInEnabled() ? [{ label: 'Sign in', onSelect: openSignInDialog }] : [])
            ]}
          />
        </div>
      </div>
    </header>
  )
}

export default Header
