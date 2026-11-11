#!/usr/bin/env node
// Run with: node script/test_two_card_mode.cjs

const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
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
  const { inTwoCardMode, autoCompletePick } = require(bundle)
  const names = ['Rose', 'Yaniv', 'Tido']
  // Cards 1 and 2 differ only in number; card 3 completes their set.
  const pair = [1, 2]

  check('the allowlisted names match ignoring case and extra spaces', () => {
    for (const name of ['Rose', 'rose', 'YANIV', '  Tido ']) assert.equal(inTwoCardMode(name, names), true, name)
    for (const name of [null, undefined, '', 'Rosemary', 'Rose Smith', 'Wily Coyote']) assert.equal(inTwoCardMode(name, names), false, String(name))
  })

  check('without the page list nobody is in the experiment', () => {
    assert.equal(inTwoCardMode('Rose'), false)
  })

  check('flag on: the second card brings the third along when it is on the board', () => {
    assert.deepEqual(autoCompletePick(pair, [1, 2, 3, 10, 20], true), { cards: [1, 2, 3], missing: false })
  })

  check('flag on: a pair whose third card is not on the board is a miss', () => {
    assert.deepEqual(autoCompletePick(pair, [1, 2, 10, 20], true), { cards: [1, 2], missing: true })
  })

  check('flag on: one or three cards pick as usual', () => {
    assert.deepEqual(autoCompletePick([1], [1, 2, 3], true), { cards: [1], missing: false })
    assert.deepEqual(autoCompletePick([1, 2, 10], [1, 2, 3, 10], true), { cards: [1, 2, 10], missing: false })
  })

  check('flag off: a pair stays a pair', () => {
    assert.deepEqual(autoCompletePick(pair, [1, 2, 3], false), { cards: [1, 2], missing: false })
    assert.deepEqual(autoCompletePick(pair, [1, 2, 10], false), { cards: [1, 2], missing: false })
  })

  console.log('\nAll checks passed.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
