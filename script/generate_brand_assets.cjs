#!/usr/bin/env node
// Renders the social preview image and app icons from the app's own SVG card faces.
// Run with: yarn assets:brand (needs Playwright's Chromium and the Inter font).

const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { chromium } = require('playwright')

const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
const INK = { red: '#ea1c2d', purple: '#613394', green: '#009b4d' }

function loadCardFace(temporary) {
  const outfile = path.join(temporary, 'cards.cjs')
  buildSync({
    entryPoints: [path.join(root, 'app/javascript/components/CardFace.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    jsx: 'automatic',
    logLevel: 'silent'
  })
  return require(outfile)
}

function iconSvg(defs, { size, scale, rounded }) {
  const shapes = [['squiggle', INK.red], ['diamond', INK.purple], ['oval', INK.green]]
    .map(([shape, ink], index) => (
      `<use href="#set-card-${shape}" fill="${ink}" transform="translate(${256 + (index - 1) * 142 * scale} 256) scale(${1.9 * scale})"/>`
    ))
    .join('')
  const background = rounded
    ? '<rect width="512" height="512" rx="112" fill="#fff"/>'
    : '<rect width="512" height="512" fill="#fff"/>'
  const shapeDefs = defs.replace(/<pattern[\s\S]*?<\/pattern>/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${shapeDefs}${background}${shapes}</svg>\n`
}

function socialHtml(defs, card) {
  const board = [12, 1, 41, 50, 61, 81]
  const found = new Set([1, 41, 81])
  const cards = board.map(id => `<div class="card${found.has(id) ? ' found' : ''}">${card(id)}</div>`).join('')
  return `<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1200px; height: 630px; background: #f5f5f5; color: #171717; font-family: Inter, sans-serif;
      display: flex; align-items: center; justify-content: space-between; padding: 0 84px 0 96px; }
    .wordmark { display: flex; align-items: center; gap: 22px; font-size: 104px; font-weight: 600; letter-spacing: -0.04em; line-height: 1; }
    .dots { display: flex; gap: 12px; margin-top: 10px; }
    .dots span { width: 20px; height: 20px; border-radius: 50%; }
    h1 { margin-top: 40px; font-size: 52px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.12; }
    p { margin-top: 26px; font-size: 26px; color: #525252; }
    .url { margin-top: 64px; font-size: 24px; font-weight: 500; color: #737373; }
    .board { display: grid; grid-template-columns: repeat(2, 232px); gap: 16px; }
    .card { border: 1px solid #e5e5e5; border-radius: 16px; background: #fff; overflow: hidden; }
    .card.found { border-color: #171717; box-shadow: 0 0 0 3px #171717; }
    .card svg { display: block; width: 100%; height: auto; }
  </style></head><body>
    <svg width="0" height="0" style="position:absolute">${defs}</svg>
    <div>
      <div class="wordmark">Set<div class="dots"><span style="background:${INK.red}"></span><span style="background:${INK.purple}"></span><span style="background:${INK.green}"></span></div></div>
      <h1>Find the set.<br>Beat the clock.</h1>
      <p>Free in your browser &middot; Solo &amp; multiplayer</p>
      <div class="url">set.tido.site</div>
    </div>
    <div class="board">${cards}</div>
  </body></html>`
}

async function main() {
  const temporary = mkdtempSync(path.join(tmpdir(), 'setgame-brand-'))
  const browser = await chromium.launch()
  try {
    const { default: CardFace, CardSymbols } = loadCardFace(temporary)
    const defs = renderToStaticMarkup(React.createElement(CardSymbols)).match(/<defs>[\s\S]*<\/defs>/)[0]
    const card = id => renderToStaticMarkup(React.createElement(CardFace, { cardId: id, decorative: true, className: '' }))

    writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg(defs, { size: 512, scale: 1, rounded: true }))

    const page = await browser.newPage({ deviceScaleFactor: 1 })
    const icons = [
      ['icon.png', 512, { scale: 1, rounded: true }],
      ['icon-192.png', 192, { scale: 1, rounded: true }],
      ['icon-512.png', 512, { scale: 1, rounded: true }],
      ['icon-maskable-512.png', 512, { scale: 0.72, rounded: false }],
      ['apple-touch-icon.png', 180, { scale: 0.86, rounded: false }]
    ]
    for (const [file, size, options] of icons) {
      await page.setViewportSize({ width: size, height: size })
      await page.setContent(`<style>body{margin:0}svg{display:block}</style>${iconSvg(defs, { size, ...options })}`)
      await page.screenshot({ path: path.join(publicDir, file), omitBackground: true })
    }

    await page.setViewportSize({ width: 1200, height: 630 })
    await page.setContent(socialHtml(defs, card), { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: path.join(publicDir, 'og-image.png') })
    console.log('Wrote public/og-image.png, icon.svg and app icons.')
  } finally {
    await browser.close()
    rmSync(temporary, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
