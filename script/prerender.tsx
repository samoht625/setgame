// Renders the game's header to static HTML for each page at build time, so
// the server can put it in the page and it paints before the script runs
// (see ApplicationHelper#prerendered). Run by `npm run build`.
import fs from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Nothing in the header's first render depends on this browser; stand in for the DOM.
const noop = () => {}
const g = globalThis as Record<string, unknown>
g.window ??= globalThis
g.document ??= { querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, documentElement: {} }
g.localStorage ??= { getItem: () => null, setItem: noop, removeItem: noop }
g.addEventListener ??= noop
g.removeEventListener ??= noop

const { default: Header } = await import('../app/javascript/components/Header')
const { APP_SHELL } = await import('../app/javascript/components/App')
const { SITE_HEADER_SHELL } = await import('../app/javascript/components/SiteHeader')
const { SoundProvider } = await import('../app/javascript/components/SoundProvider')
const { GameMenuProvider } = await import('../app/javascript/components/GameMenu')

type Mode = 'daily' | 'puzzle' | 'solo' | 'multiplayer'
const render = (shell: string, mode: Mode | null) => renderToStaticMarkup(
  <SoundProvider>
    <GameMenuProvider>
      <div className={shell}>
        <Header mode={mode} page={mode === null ? 'stats' : undefined} onSwitchMode={noop} />
      </div>
    </GameMenuProvider>
  </SoundProvider>
)

const out: Record<string, string> = { stats: render(SITE_HEADER_SHELL, null) }
for (const mode of ['daily', 'puzzle', 'solo', 'multiplayer'] as const) out[mode] = render(APP_SHELL, mode)
fs.writeFileSync('app/assets/builds/prerendered.json', JSON.stringify(out))
console.log(`prerendered ${Object.keys(out).join(', ')}`)
