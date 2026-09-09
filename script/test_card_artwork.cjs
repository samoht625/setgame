#!/usr/bin/env node

const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const root = path.resolve(__dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'setgame-artwork-'))
try {
  const outfile = path.join(temporary, 'cards.cjs')
  buildSync({
    entryPoints: [path.join(root, 'app/javascript/components/CardFace.tsx')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    jsx: 'automatic'
  })
  const { default: CardFace, CardSymbols, describeCard } = require(outfile)
  const colors = ['red', 'purple', 'green']
  const inks = ['#ea1c2d', '#613394', '#009b4d']
  const shapes = ['squiggle', 'diamond', 'oval']
  const shadings = ['solid', 'striped', 'open']
  const symbols = renderToStaticMarkup(React.createElement(CardSymbols))
  assert.equal((symbols.match(/id="set-card-/g) || []).length, 6)
  for (let id = 1; id <= 81; id++) {
    const value = id - 1
    const number = value % 3 + 1
    const color = Math.floor(value / 3) % 3
    const shape = Math.floor(value / 9) % 3
    const shading = Math.floor(value / 27) % 3
    const expected = `${number} ${shadings[shading]} ${colors[color]} ${shapes[shape]}${number === 1 ? '' : 's'}`
    assert.equal(describeCard(id), expected)
    const markup = renderToStaticMarkup(React.createElement(CardFace, { cardId: id }))
    assert(markup.includes('viewBox="0 0 258 167"'))
    assert(markup.includes(`aria-label="${expected}"`))
    assert(markup.includes('role="img"'))
    assert.equal((markup.match(/<use /g) || []).length, number)
    assert.equal((markup.match(new RegExp(`href="#set-card-${shapes[shape]}"`, 'g')) || []).length, number)
    assert(markup.includes(`stroke="${inks[color]}"`))
    assert(markup.includes(`fill="${shading === 0 ? inks[color] : shading === 1 ? `url(#set-card-stripes-${colors[color]})` : 'none'}"`))
    const decorative = renderToStaticMarkup(React.createElement(CardFace, { cardId: id, decorative: true }))
    assert(decorative.includes('aria-hidden="true"'))
    assert(!decorative.includes('aria-label='))
    assert(!markup.includes('.png'))
  }
  console.log('All 81 SVG cards preserve number, color, shape, shading, aspect ratio, and accessible/decorative semantics.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
