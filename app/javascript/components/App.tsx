import React, { useEffect, useState } from 'react'
import Header from './Header'
import MultiplayerGame from './MultiplayerGame'
import SolitaireGame from '../solitaire/SolitaireGame'
import DailyGame from '../daily/DailyGame'
import PuzzleGame from '../puzzle/PuzzleGame'
import { usePresence } from '../hooks/usePresence'
import { CardSymbols } from './CardFace'
import { SoundProvider } from './SoundProvider'
import { GameMenuProvider } from './GameMenu'
import HowToPlay from '../rules/HowToPlay'
import NameDialog from './NameDialog'
import SignInDialog, { openSignInDialog } from './SignInDialog'
import AppToast from './AppToast'
import { showToast } from '../lib/toast'
import { signedInEmail } from '../lib/player_id'
import ReminderDialog from './ReminderDialog'
import Tour, { useTourOpener } from '../rules/Tour'
import { REMINDER_TIMES, reminderLabel } from '../lib/reminder'
import { PATHS, SITE_NAME, type GameMode } from '../lib/site'

// The Puzzle is the front door (/, and /puzzle), the Daily Deal is at /daily,
// Practice at /practice and multiplayer at /m.
function modeFromPath(pathname: string): GameMode {
  const path = pathname.replace(/\/+$/, '')
  if (path === '/m' || path.startsWith('/m/')) return 'multiplayer'
  if (path === '/daily') return 'daily'
  if (path === '/practice') return 'solo'
  return 'puzzle'
}

// Must match the <title> each route renders (ApplicationHelper#page_title):
// the home page's is the site's name, every other page's names the page first.
const TITLES: Record<GameMode, string> = {
  daily: `Daily Deal | ${SITE_NAME}`,
  puzzle: SITE_NAME,
  solo: `Practice | ${SITE_NAME}`,
  multiplayer: `Multiplayer | ${SITE_NAME}`
}

/** The page behind every game; the prerendered header (script/prerender.tsx) sits in the same box. */
export const APP_SHELL = 'min-h-dvh bg-neutral-100 text-neutral-900 antialiased dark:bg-[#111214] dark:text-neutral-100'

const App: React.FC = () => {
  const [mode, setMode] = useState<GameMode>(() => modeFromPath(window.location.pathname))
  const [touring, endTour] = useTourOpener()
  // Not polled in multiplayer, which already shows the live roster.
  const othersOnline = usePresence(mode !== 'multiplayer')

  useEffect(() => {
    const onPopState = () => setMode(modeFromPath(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Back from an emailed sign-in link (?signed_in=1) or an expired one (?sign_in=1).
  useEffect(() => {
    const url = new URL(window.location.href)
    const signedIn = url.searchParams.has('signed_in')
    const wantsSignIn = url.searchParams.has('sign_in')
    const reminder = url.searchParams.get('reminder')
    if (!signedIn && !wantsSignIn) return
    url.searchParams.delete('signed_in')
    url.searchParams.delete('sign_in')
    url.searchParams.delete('reminder')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    const email = signedInEmail()
    const minutes = Number(reminder)
    if (signedIn && email) showToast(reminder && REMINDER_TIMES.includes(minutes) ? `Reminder on · ${reminderLabel(minutes)}` : `Signed in as ${email}`)
    else if (wantsSignIn && !email) openSignInDialog({ source: 'expired', reminder: reminder !== null })
  }, [])

  useEffect(() => {
    document.title = TITLES[mode]
  }, [mode])

  const switchMode = (next: GameMode) => {
    if (next === mode && window.location.pathname === PATHS[next]) return
    window.history.pushState({}, '', PATHS[next])
    setMode(next)
  }

  return (
    <SoundProvider>
      <GameMenuProvider>
      <div className={APP_SHELL}>
        <CardSymbols />
        <Header mode={mode} onSwitchMode={switchMode} othersOnline={othersOnline} />
        {mode === 'solo' ? <SolitaireGame /> : mode === 'daily' ? <DailyGame /> : mode === 'puzzle' ? <PuzzleGame /> : <MultiplayerGame />}
        {touring && <Tour onDone={endTour} />}
        <HowToPlay />
        <NameDialog />
        <SignInDialog />
        <ReminderDialog />
        <AppToast />
      </div>
      </GameMenuProvider>
    </SoundProvider>
  )
}

export default App
