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

  const replayBundle = path.join(temporary, 'daily_replay.cjs')
  buildSync({
    stdin: {
      contents: "export * from './daily_replay'; export { startSoloDeal, applySoloClaim, isRoundOver } from './solo_deal'; export { isSet } from './rules'",
      resolveDir: path.join(root, 'app/javascript/lib'),
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: replayBundle,
    logLevel: 'silent'
  })
  const replay = require(replayBundle)

  // Plays a deal out, taking the first (or last) set on the board each turn, one claim every gapMs.
  function playOut(seed, { last = false, gapMs = 3_000 } = {}) {
    const deal = replay.startSoloDeal(seed)
    const claims = []
    while (!replay.isRoundOver(deal)) {
      const sets = []
      const b = deal.board
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) for (let k = j + 1; k < b.length; k++) {
        if (replay.isSet(b[i], b[j], b[k])) sets.push([b[i], b[j], b[k]].sort((x, y) => x - y))
      }
      const cards = last ? sets[sets.length - 1] : sets[0]
      replay.applySoloClaim(deal, cards)
      claims.push({ cards, t_ms: (claims.length + 1) * gapMs })
    }
    return { claims, finalBoard: [...deal.board] }
  }

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

  check('a replay re-deals the seed and steps through the boards each player saw', () => {
    const seed = 424242
    const fast = playOut(seed)
    const slow = playOut(seed, { last: true, gapMs: 3_500 })
    const a = replay.replayBoards(seed, fast.claims)
    const b = replay.replayBoards(seed, slow.claims)
    assert.equal(a.length, fast.claims.length + 1)
    assert.deepEqual(a[0], replay.startSoloDeal(seed).board)
    assert.deepEqual(a[0], b[0], 'same deal, same opening board')
    assert.notDeepEqual(a[1], b[1], 'different sets found, different boards')
    assert.deepEqual(a[a.length - 1], fast.finalBoard)
    assert.deepEqual(b[b.length - 1], slow.finalBoard)
  })

  check('a claim that doesn’t fit the deal ends the replay there, without inventing boards', () => {
    const { claims } = playOut(7)
    const broken = [claims[0], { cards: [1, 2, 3], t_ms: 9_000 }, ...claims.slice(1)]
    assert.equal(replay.replayBoards(7, broken).length, 2)
  })

  check('a frame shows the set just found on its board, then the board after it', () => {
    const boards = [[1, 2, 3, 4], [5, 6, 7, 4], [8, 9, 10, 4]]
    const claims = [{ cards: [1, 2, 3], t_ms: 1_000 }, { cards: [5, 6, 7], t_ms: 2_000 }]
    assert.deepEqual(replay.frameAt(boards, claims, 999, 300), { board: boards[0], found: null, sets: 0 })
    assert.deepEqual(replay.frameAt(boards, claims, 1_000, 300), { board: boards[0], found: [1, 2, 3], sets: 1 })
    assert.deepEqual(replay.frameAt(boards, claims, 1_299, 300), { board: boards[0], found: [1, 2, 3], sets: 1 })
    assert.deepEqual(replay.frameAt(boards, claims, 1_300, 300), { board: boards[1], found: null, sets: 1 })
    assert.deepEqual(replay.frameAt(boards, claims, 60_000, 300), { board: boards[2], found: null, sets: 2 })
    // A replay cut short stays on its last real board.
    assert.deepEqual(replay.frameAt(boards.slice(0, 2), claims, 60_000, 300), { board: boards[1], found: null, sets: 1 })
  })

  check('the lead goes to whoever has more sets, then to whoever finished first', () => {
    const me = { times: [1_000, 2_000, 6_000], finishMs: 6_000 }
    const them = { times: [1_500, 1_800, 4_000, 5_000], finishMs: 7_000 }
    assert.equal(replay.setsBy(me.times, 1_999), 1)
    assert.equal(replay.setsBy(me.times, 2_000), 2)
    assert.equal(replay.leaderAt(me, them, 500), null)
    assert.equal(replay.leaderAt(me, them, 1_200), 'me')
    assert.equal(replay.leaderAt(me, them, 1_900), 'them')
    assert.equal(replay.leaderAt(me, them, 2_500), null)
    assert.equal(replay.leaderAt(me, them, 6_500), 'me', 'finished beats still playing')
    assert.equal(replay.leaderAt(me, them, 9_000), 'me', 'the earlier finish wins')
    assert.deepEqual(replay.leadSegments(me, them), [
      { from: 0, to: 1_000, leader: null },
      { from: 1_000, to: 1_500, leader: 'me' },
      { from: 1_500, to: 1_800, leader: null },
      { from: 1_800, to: 2_000, leader: 'them' },
      { from: 2_000, to: 4_000, leader: null },
      { from: 4_000, to: 6_000, leader: 'them' },
      { from: 6_000, to: 7_000, leader: 'me' }
    ])
  })

  check('replays play in about 20 seconds, never slower than real time', () => {
    assert.equal(replay.playbackSpeed(10_000), 1)
    assert.equal(replay.playbackSpeed(90_000), 5)
    assert.equal(replay.playbackSpeed(180_000), 9)
  })

  console.log('\nAll checks passed.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
