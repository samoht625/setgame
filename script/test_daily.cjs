#!/usr/bin/env node
// Run with: node script/test_daily.cjs

const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')

const root = path.resolve(__dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'setgame-daily-'))

function check(name, fn) {
  fn()
  console.log(`  ok  ${name}`)
}

try {
  const bundle = path.join(temporary, 'daily.cjs')
  buildSync({
    entryPoints: [path.join(root, 'app/javascript/lib/daily.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
    logLevel: 'silent'
  })
  const { dailyDate, paceRow, missesLabel, dailyShareText, ordinal, formatCountdown } = require(bundle)

  check('the client rolls the daily over at midnight Pacific, like the server', () => {
    assert.equal(dailyDate(new Date('2026-10-04T06:59:59Z')), '2026-10-03')
    assert.equal(dailyDate(new Date('2026-10-04T07:00:00Z')), '2026-10-04')
    assert.equal(dailyDate(new Date('2026-12-01T07:59:59Z')), '2026-11-30')
    assert.equal(dailyDate(new Date('2026-12-01T08:00:00Z')), '2026-12-01')
  })

  check('the pace row has one square per three sets, colored by time per set', () => {
    const seconds = list => list.map(s => s * 1000)
    assert.equal(paceRow([]), '')
    assert.equal(paceRow(seconds([4, 8, 12, 20, 28, 36, 48, 60, 72, 92, 112, 132])), '🟩🟨🟧🟥')
    // Boundaries: under 6s a set is green, exactly 6s is not.
    assert.equal(paceRow(seconds([5.9, 11.8, 17.9])), '🟩')
    assert.equal(paceRow(seconds([6, 12, 18])), '🟨')
    // A short last square averages only the sets it has.
    assert.equal(paceRow(seconds([3, 6, 9, 39])), '🟩🟥')
    const fullGame = Array.from({ length: 27 }, (_, i) => (i + 1) * 7000)
    assert.equal(paceRow(fullGame), '🟨'.repeat(9))
  })

  check('share text has the number, time, misses, pace and link, and nothing else', () => {
    const text = dailyShareText({ number: 12, elapsedMs: 221_400, misses: 2, claimMs: [4000, 8000, 12000, 20000] })
    assert.equal(text, 'Set Daily #12\n3:41 · 2 misses\n🟩🟨\nhttps://set.tido.site/daily')
    assert.equal(missesLabel(0), 'no misses')
    assert.equal(missesLabel(1), '1 miss')
    assert.equal(dailyShareText({ number: 1, elapsedMs: 59_999, misses: 0, claimMs: [] }), 'Set Daily #1\n0:59 · no misses\nhttps://set.tido.site/daily')
  })

  check('ranks read as ordinals', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal),
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th'])
  })

  check('the countdown rounds up and never reads zero', () => {
    assert.equal(formatCountdown(0), '1m')
    assert.equal(formatCountdown(59_000), '1m')
    assert.equal(formatCountdown(60_001), '2m')
    assert.equal(formatCountdown(60 * 60_000), '1h 0m')
    assert.equal(formatCountdown((7 * 60 + 5) * 60_000), '7h 5m')
  })

  console.log('\nAll checks passed.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
