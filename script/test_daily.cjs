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
  const { dailyDate, dailyShareText, ordinal, formatCountdown } = require(bundle)

  check('the client rolls the daily over at midnight Pacific, like the server', () => {
    assert.equal(dailyDate(new Date('2026-10-04T06:59:59Z')), '2026-10-03')
    assert.equal(dailyDate(new Date('2026-10-04T07:00:00Z')), '2026-10-04')
    assert.equal(dailyDate(new Date('2026-12-01T07:59:59Z')), '2026-11-30')
    assert.equal(dailyDate(new Date('2026-12-01T08:00:00Z')), '2026-12-01')
  })

  check('share text has the number, time and link, and nothing else', () => {
    assert.equal(dailyShareText({ number: 12, elapsedMs: 161_400 }), 'Set Daily #12 · 2:41\nhttps://set.tido.site/daily')
    assert.equal(dailyShareText({ number: 1, elapsedMs: 59_999 }), 'Set Daily #1 · 0:59\nhttps://set.tido.site/daily')
    assert.equal(dailyShareText({ number: 12, elapsedMs: 161_400, token: 'c-3gk0-abcdefghijkl' }),
      'Set Daily #12 · 2:41\nhttps://set.tido.site/daily?r=c-3gk0-abcdefghijkl')
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
