#!/usr/bin/env node
// Renders the social preview image and app icons from the app's own SVG card faces.
// Run with: yarn assets:brand

const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')
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
// Chrome on macOS puts the maskable icon in the Dock: macOS 26 scales the whole
// square into its rounded tile, and earlier versions get Chrome's clip to
// Apple's icon grid (a 412px rounded square, corner radius 92, inset 50px at
// 512). The shapes fill 74% of the icon and must stay inside that clip. The
// tips may cross the 40%-radius safe-zone circle, so circular Android
// launchers can trim them slightly.
const maskable = { rounded: false, width: 0.74 }
const { pixels, width } = new Resvg(iconSvg(maskable)).render()
const clip = { inset: 50, radius: 92 }
for (let i = 0; i < pixels.length; i += 4) {
  const x = Math.abs((i / 4) % width + 0.5 - width / 2)
  const y = Math.abs(Math.floor(i / 4 / width) + 0.5 - width / 2)
  const corner = width / 2 - clip.inset - clip.radius
  const outside = Math.hypot(Math.max(x - corner, 0), Math.max(y - corner, 0)) > clip.radius
  if (pixels[i + 1] > 0x80 && outside) throw new Error("The maskable icon motif leaves Chrome's macOS Dock mask.")
}
const icons = [
  ['icon-16.png', 16, favicon],
  ['icon-32.png', 32, favicon],
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, maskable]
]
for (const [file, size, options] of icons) {
  writeFileSync(path.join(publicDir, file), renderPng(iconSvg(options), size))
}
console.log('Wrote public/og-image.png, icon.svg and app icons.')
