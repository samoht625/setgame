#!/usr/bin/env node
// Run with: node script/test_rules_demo.cjs

const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')

const root = path.resolve(__dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'setgame-demo-'))

function referenceSet(a, b, c) {
  return [1, 3, 9, 27].every(place => {
    const size = new Set([a, b, c].map(id => Math.floor((id - 1) / place) % 3)).size
    return size === 1 || size === 3
  })
}

try {
  const outfile = path.join(temporary, 'demo.cjs')
  buildSync({ entryPoints: [path.join(root, 'app/javascript/rules/demoExample.ts')], bundle: true, platform: 'node', format: 'cjs', outfile })
  const { makeExample, nextSameCount, verdicts } = require(outfile)

  // A seeded generator so failures reproduce.
  let seed = 12345
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

  const seenPatterns = new Set()
  let previous = null
  for (let run = 0; run < 2000; run++) {
    const sameCount = nextSameCount(previous, random)
    assert.notEqual(sameCount, previous, 'each new example changes how many features are the same')
    assert.ok(sameCount >= 0 && sameCount <= 3)
    previous = sameCount
    const { board, set } = makeExample(sameCount, random)

    assert.equal(board.length, 6)
    assert.equal(new Set(board).size, 6, 'six different cards')
    assert.ok(board.every(id => Number.isInteger(id) && id >= 1 && id <= 81))
    assert.equal(set.length, 3)
    assert.ok(set.every(id => board.includes(id)), 'the highlighted cards are on the board')
    assert.ok(referenceSet(...set), 'the highlighted cards are a set')

    let sets = 0
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) if (referenceSet(board[i], board[j], board[k])) sets++
    assert.equal(sets, 1, 'the highlighted set is the only set')

    // The feature row says same exactly where the three cards agree.
    const row = verdicts(set)
    const places = { number: 1, color: 3, shape: 9, shading: 27 }
    for (const [key, place] of Object.entries(places)) {
      const values = new Set(set.map(id => Math.floor((id - 1) / place) % 3))
      assert.equal(row[key], values.size === 1 ? 'same' : 'different', key)
    }
    assert.equal(Object.values(row).filter(v => v === 'same').length, sameCount)
    seenPatterns.add(Object.values(row).join(','))
  }
  // All 15 same/different patterns (0 to 3 features the same) turn up.
  assert.equal(seenPatterns.size, 15)
  console.log('rules demo: 2000 examples, each with exactly one highlighted set; all 15 patterns seen')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
