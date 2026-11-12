#!/usr/bin/env node
// Run with: node script/test_two_card_mode.cjs

const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')

const root = path.resolve(__dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'setgame-two-card-'))

function check(name, fn) {
  fn()
  console.log(`  ok  ${name}`)
}

try {
  const bundle = path.join(temporary, 'two_card_mode.cjs')
  buildSync({
    entryPoints: [path.join(root, 'app/javascript/lib/two_card_mode.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
    logLevel: 'silent'
  })
  const { DEFAULT_ON_NAMES, twoCardModeOn, autoCompletePick } = require(bundle)
  // Cards 1 and 2 differ only in number; card 3 completes their set.
  const pair = [1, 2]

  check('the default-on names are the server\'s', () => {
    const ruby = readFileSync(path.join(root, 'app/services/two_card_mode.rb'), 'utf8')
    assert.deepEqual(DEFAULT_ON_NAMES, ruby.match(/DEFAULT_ON_NAMES = %w\[(.*?)\]/)[1].split(' '))
    assert.deepEqual(DEFAULT_ON_NAMES, ['Tido', 'Rose', 'Yaniv'])
  })

  check('no choice: on for Tido, Rose and Yaniv, ignoring case and extra spaces', () => {
    for (const name of ['Rose', 'rose', 'YANIV', '  Tido ']) assert.equal(twoCardModeOn(name, null), true, name)
  })

  check('no choice: off for everyone else', () => {
    for (const name of [null, undefined, '', 'Rosemary', 'Rose Smith', 'Wily Coyote']) assert.equal(twoCardModeOn(name, null), false, String(name))
  })

  check('the player\'s own choice wins over the default, both ways', () => {
    assert.equal(twoCardModeOn('Tido', false), false)
    assert.equal(twoCardModeOn('Wily Coyote', true), true)
    assert.equal(twoCardModeOn(null, true), true)
    assert.equal(twoCardModeOn('Rose', true), true)
    assert.equal(twoCardModeOn('Wily Coyote', false), false)
  })

  check('a page that carries no choice leaves the default', () => {
    assert.equal(twoCardModeOn('Rose'), true)
    assert.equal(twoCardModeOn('Wily Coyote'), false)
  })

  check('on: the second card brings the third along when it is on the board', () => {
    assert.deepEqual(autoCompletePick(pair, [1, 2, 3, 10, 20], true), { cards: [1, 2, 3], filled: 3, missing: false })
  })

  check('on: a pair whose third card is not on the board is a miss', () => {
    assert.deepEqual(autoCompletePick(pair, [1, 2, 10, 20], true), { cards: [1, 2], filled: null, missing: true })
  })

  check('on: one or three cards pick as usual', () => {
    assert.deepEqual(autoCompletePick([1], [1, 2, 3], true), { cards: [1], filled: null, missing: false })
    assert.deepEqual(autoCompletePick([1, 2, 10], [1, 2, 3, 10], true), { cards: [1, 2, 10], filled: null, missing: false })
  })

  check('off: a pair stays a pair', () => {
    assert.deepEqual(autoCompletePick(pair, [1, 2, 3], false), { cards: [1, 2], filled: null, missing: false })
    assert.deepEqual(autoCompletePick(pair, [1, 2, 10], false), { cards: [1, 2], filled: null, missing: false })
  })

  console.log('\nAll checks passed.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
