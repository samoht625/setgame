#!/usr/bin/env node
// Social preview images (1200×630) and app icons, drawn as SVG and rasterized
// with resvg. Rails runs this as a CLI to render per-result daily images:
//   node script/og_image.cjs daily '{"number":12,"time":"2:41"}' > out.png
// The card art comes from script/og/cards.json, which `yarn assets:brand`
// generates from the app's CardFace component.

const { readFileSync } = require('node:fs')
const path = require('node:path')
const { Resvg } = require('@resvg/resvg-js')

const root = path.resolve(__dirname, '..')
const FONT_DIR = path.join(root, 'vendor/fonts')
const FONT_FILES = ['Inter-Medium.ttf', 'Inter-SemiBold.ttf', 'Inter-Bold.ttf'].map(file => path.join(FONT_DIR, file))

const WIDTH = 1200
const HEIGHT = 630
const INK = { red: '#ea1c2d', purple: '#613394', green: '#009b4d' }
const TEXT = { strong: '#171717', body: '#525252', muted: '#8a8a8a' }
const BACKGROUND = '#f5f5f5'
const CARD = { width: 258, height: 167 }

let cardArt
function cards() {
  cardArt ??= JSON.parse(readFileSync(path.join(__dirname, 'og/cards.json'), 'utf8'))
  return cardArt
}

const escapeXml = value => String(value).replace(/[<>&"']/g, char => `&#${char.charCodeAt(0)};`)

// The header's wordmark: "Set" and three colored dots.
function wordmark(x, y, size) {
  const dot = size * 0.13
  const start = x + size * 1.98
  const dots = [INK.red, INK.purple, INK.green]
    .map((ink, index) => `<circle cx="${start + index * dot * 3}" cy="${y - size * 0.34}" r="${dot}" fill="${ink}"/>`)
    .join('')
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" letter-spacing="${-size * 0.03}" fill="${TEXT.strong}">Set</text>${dots}`
}

// Three cards forming a set, fanned like a hand of cards around (cx, cy).
function cardFan(cx, cy, scale) {
  const { faces } = cards()
  const width = CARD.width * scale
  const height = CARD.height * scale
  const layout = [
    { dx: -0.12, dy: -0.84, rotate: -6 },
    { dx: 0.1, dy: 0, rotate: 3 },
    { dx: -0.04, dy: 0.84, rotate: -2 }
  ]
  return faces.map((face, index) => {
    const { dx, dy, rotate } = layout[index]
    const x = cx + dx * width - width / 2
    const y = cy + dy * height - height / 2
    const inner = face.replace('<svg ', `<svg x="0" y="0" width="${width}" height="${height}" `)
    return `<g transform="translate(${x} ${y}) rotate(${rotate} ${width / 2} ${height / 2})">
      <rect width="${width}" height="${height}" rx="${18 * scale}" fill="#fff" filter="url(#card-shadow)"/>
      <rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="${18 * scale}" fill="none" stroke="#e5e5e5" stroke-width="1.5"/>
      ${inner}
    </g>`
  }).join('')
}

function frame(content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Inter">
    <defs>
      ${cards().defs}
      <filter id="card-shadow" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#171717" flood-opacity="0.10"/>
      </filter>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>
    ${content}
  </svg>`
}

function staticSvg() {
  return frame(`
    ${wordmark(88, 132, 46)}
    <text x="84" y="300" font-size="84" font-weight="700" letter-spacing="-3.4" fill="${TEXT.strong}">Find the set.</text>
    <text x="84" y="396" font-size="84" font-weight="700" letter-spacing="-3.4" fill="${TEXT.strong}">Beat the clock.</text>
    <text x="88" y="462" font-size="28" font-weight="500" fill="${TEXT.body}">The classic card game, free in your browser.</text>
    <text x="88" y="552" font-size="24" font-weight="500" fill="${TEXT.muted}">set.tido.site</text>
    ${cardFan(940, 322, 1.05)}
  `)
}

function dailySvg({ number, time }) {
  return frame(`
    <text x="88" y="244" font-size="44" font-weight="600" letter-spacing="-0.9" fill="${TEXT.body}">Set Daily Puzzle #${escapeXml(number)}</text>
    <text x="78" y="438" font-size="200" font-weight="700" letter-spacing="-8" fill="${TEXT.strong}">${escapeXml(time)}</text>
    ${cardFan(975, 322, 1.0)}
  `)
}

// Shape outlines from CardFace, in its local units, with how far each reaches
// left and right of its origin and how far its center sits below it.
const SHAPES = {
  squiggle: { d: 'M-10-54 C7-54 22.5-41 22.5-19 C22.5-4.5 15 2.5 15 11.5 C15 23.5 25.5 32.5 25.5 39.5 C25.5 46.5 15 50.5 6 50.5 C-13 50.5-23.5 39.5-23.5 22.5 C-23.5 6.5-13.5-6.5-13.5-18 C-13.5-30.5-24.5-40-24.5-45.5 C-24.5-51-17-54-10-54 Z', left: 24.5, right: 25.5, middle: -1.75 },
  diamond: { d: 'M0-59 28 0 0 59-28 0Z', left: 28, right: 28, middle: 0 },
  oval: { d: 'M-26.5-28.5 A26.5 26.5 0 0 1 26.5-28.5 V28.5 A26.5 26.5 0 0 1-26.5 28.5 Z', left: 26.5, right: 26.5, middle: 0 }
}

function shape(name, x, scale) {
  const { d, middle } = SHAPES[name]
  return `<path d="${d}" transform="translate(${x} ${256 - middle * scale}) scale(${scale})"/>`
}

// The three shapes side by side, centered, scaled to span `width` of the icon.
// Each outline is thickened by `weight` units with a round-joined stroke, so
// the squiggle's waist and the diamond's tips stay solid at Dock size, and
// `gap` units apart so they don't run together there.
function trio(width, ink, { weight = 16, gap = 7 } = {}) {
  const names = ['squiggle', 'diamond', 'oval']
  const span = names.reduce((sum, name) => sum + SHAPES[name].left + SHAPES[name].right + weight, 0) + gap * (names.length - 1)
  const scale = width * 512 / span
  let x = -span / 2
  const paths = names.map(name => {
    x += SHAPES[name].left + weight / 2
    const path = shape(name, 256 + x * scale, scale)
    x += SHAPES[name].right + weight / 2 + gap
    return path
  }).join('')
  return `<g fill="${ink}" stroke="${ink}" stroke-width="${weight}" stroke-linejoin="round">${paths}</g>`
}

/**
 * The app icon: three bold white shapes (squiggle, diamond, oval) on a purple
 * rounded square, spanning `width` of it. The 'single' variant is one larger
 * squiggle for tab icons, where three shapes blur together.
 */
function iconSvg({ rounded = true, width = 0.86, variant = 'trio', background = INK.purple, ink = '#fff' } = {}) {
  const motif = variant === 'single'
    ? `<g fill="${ink}">${shape('squiggle', 256, 3.4)}</g>`
    : trio(width, ink)
  const plate = rounded ? `<rect width="512" height="512" rx="116" fill="${background}"/>` : `<rect width="512" height="512" fill="${background}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${plate}${motif}</svg>`
}

function renderPng(svg, width) {
  const resvg = new Resvg(svg, {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Inter' },
    fitTo: width ? { mode: 'width', value: width } : { mode: 'original' }
  })
  return resvg.render().asPng()
}

module.exports = { staticSvg, dailySvg, iconSvg, renderPng, escapeXml, INK }

if (require.main === module) {
  const [kind, json = '{}'] = process.argv.slice(2)
  const svg = kind === 'daily' ? dailySvg(JSON.parse(json)) : kind === 'static' ? staticSvg() : null
  if (!svg) {
    console.error('usage: og_image.cjs <static|daily> [json]')
    process.exit(2)
  }
  process.stdout.write(renderPng(svg))
}
