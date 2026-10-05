#!/usr/bin/env node
// Renders the social preview image and app icons from the app's own SVG card faces.
// Run with: yarn assets:brand

const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
// One solid purple diamond, two striped green ovals, three open red squiggles:
// every attribute differs, so the three form a set.
const SET_CARDS = [13, 53, 57]

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

function writeCardArt() {
  const temporary = mkdtempSync(path.join(tmpdir(), 'setgame-brand-'))
  try {
    const { default: CardFace, CardSymbols } = loadCardFace(temporary)
    const defs = renderToStaticMarkup(React.createElement(CardSymbols)).match(/<defs>([\s\S]*)<\/defs>/)[1]
    const cards = SET_CARDS.map(id => renderToStaticMarkup(React.createElement(CardFace, { cardId: id, decorative: true, className: '' }))
      .replace(/ (class|aria-hidden|focusable|width|height)="[^"]*"/g, ''))
    writeFileSync(path.join(__dirname, 'og/cards.json'), `${JSON.stringify({ cards: SET_CARDS, defs, faces: cards }, null, 2)}\n`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

writeCardArt()
const { staticSvg, iconSvg, renderPng } = require('./og_image.cjs')

writeFileSync(path.join(publicDir, 'og-image.png'), renderPng(staticSvg()))
// Tab icons get one bold squiggle: three shapes blur together at 16px. The
// installed app icons are shown large enough for all three.
const favicon = { variant: 'single' }
writeFileSync(path.join(publicDir, 'icon.svg'), `${iconSvg(favicon)}\n`)
const icons = [
  ['icon-16.png', 16, favicon],
  ['icon-32.png', 32, favicon],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { rounded: false, inset: 0.78 }],
  ['apple-touch-icon.png', 180, { rounded: false, inset: 0.9 }]
]
for (const [file, size, options] of icons) {
  writeFileSync(path.join(publicDir, file), renderPng(iconSvg(options), size))
}
console.log('Wrote public/og-image.png, icon.svg and app icons.')
