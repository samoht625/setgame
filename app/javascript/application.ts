// Entry point for the build script in your package.json
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import App from './components/App'
import SiteHeader from './components/SiteHeader'
import ArchivePlay from './archive/ArchivePlay'
import ArchivePlayed from './archive/ArchivePlayed'
import { readArchiveDay } from './lib/archive'
import { captureFirstTouch } from './lib/source'
import { listenForInstall } from './lib/install'

listenForInstall()

// The page a #site-header says it is on, which the menu then leaves out.
const PAGES: Record<string, 'stats' | 'archive'> = { stats: 'stats', archive: 'archive' }

document.addEventListener('DOMContentLoaded', () => {
  captureFirstTouch()
  // Both / (solo) and /m (multiplayer) render the same shell;
  // the App decides which mode to show based on the current path.
  const rootElement = document.getElementById('root')
  if (rootElement) {
    createRoot(rootElement).render(createElement(App))
  }
  // Pages outside the game (/stats, the archive) get the same header and menu.
  const headerElement = document.getElementById('site-header')
  if (headerElement) {
    // A past day's page also gets that day to play again, where the page left room for it.
    const playElement = document.getElementById('archive-play')
    const day = playElement ? readArchiveDay(playElement.dataset.archive) : null
    // The archive's list of days gets the player's own plays marked on it.
    const listElement = document.querySelector<HTMLElement>('[data-archive-page]')
    const pageKey = headerElement.dataset.page
    createRoot(headerElement).render(
      createElement(
        SiteHeader,
        { page: pageKey ? PAGES[pageKey] : undefined },
        day && playElement ? createPortal(createElement(ArchivePlay, { day }), playElement) : null,
        listElement ? createElement(ArchivePlayed, { page: Number(listElement.dataset.archivePage) || 1 }) : null
      )
    )
  }
})
