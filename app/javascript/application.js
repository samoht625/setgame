// Entry point for the build script in your package.json
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import App from './components/App'
import SiteHeader from './components/SiteHeader'
import ArchivePlay from './archive/ArchivePlay'
import { readArchiveDay } from './lib/archive'
import { captureFirstTouch } from './lib/source'
import { listenForInstall } from './lib/install'

listenForInstall()

// The page a #site-header says it is on, which the menu then leaves out.
const PAGES = { stats: 'stats', archive: 'archive' }

document.addEventListener('DOMContentLoaded', () => {
  captureFirstTouch()
  // Both / (solo) and /m (multiplayer) render the same shell;
  // the App decides which mode to show based on the current path.
  const rootElement = document.getElementById('root') || document.getElementById('solitaire-root')
  if (rootElement) {
    createRoot(rootElement).render(<App />)
  }
  // Pages outside the game (/stats, the archive) get the same header and menu.
  const headerElement = document.getElementById('site-header')
  if (headerElement) {
    // A past day's page also gets that day to play again, where the page left room for it.
    const playElement = document.getElementById('archive-play')
    const day = playElement && readArchiveDay(playElement.dataset.archive)
    createRoot(headerElement).render(
      <SiteHeader page={PAGES[headerElement.dataset.page]}>
        {day && createPortal(<ArchivePlay day={day} />, playElement)}
      </SiteHeader>
    )
  }
})
