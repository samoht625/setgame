import React from 'react'
import Header from './Header'
import { PATHS } from './App'
import { CardSymbols } from './CardFace'
import { SoundProvider } from './SoundProvider'
import { GameMenuProvider } from './GameMenu'
import HowToPlay from '../rules/HowToPlay'
import NameDialog from './NameDialog'
import SignInDialog from './SignInDialog'
import ReminderDialog from './ReminderDialog'
import AppToast from './AppToast'

/** The game's header, menu and its dialogs on a page outside the game (e.g. /stats). */
const SiteHeader: React.FC<{ page: 'stats' }> = ({ page }) => (
  <SoundProvider>
    <GameMenuProvider>
      <div className="text-neutral-900 antialiased dark:text-neutral-100">
        <CardSymbols />
        <Header mode={null} page={page} onSwitchMode={mode => window.location.assign(PATHS[mode])} />
        <HowToPlay />
        <NameDialog />
        <SignInDialog />
        <ReminderDialog />
        <AppToast />
      </div>
    </GameMenuProvider>
  </SoundProvider>
)

export default SiteHeader
