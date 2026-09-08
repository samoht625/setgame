#!/usr/bin/env node
// Run with: node script/test_solo_rules.cjs (Ruby required for replay parity).

const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { buildSync } = require('esbuild')

const root = path.resolve(__dirname, '..')
const temporary = mkdtempSync(path.join(tmpdir(), 'setgame-rules-'))

function referenceSet(a, b, c) {
  return [1, 3, 9, 27].every(place => {
    const values = [a, b, c].map(id => Math.floor((id - 1) / place) % 3)
    const size = new Set(values).size
    return size === 1 || size === 3
  })
}

function firstSet(board, matches = referenceSet) {
  for (let i = 0; i < board.length - 2; i++) {
    for (let j = i + 1; j < board.length - 1; j++) {
      for (let k = j + 1; k < board.length; k++) {
        if (matches(board[i], board[j], board[k])) return [board[i], board[j], board[k]]
      }
    }
  }
  return null
}

function referenceEnsure(state) {
  const deal = count => state.board.push(...state.deck.splice(0, count))
  while (state.board.length < 18 && !firstSet(state.board) && state.deck.length) deal(3)
  if (state.board.length >= 18 && !firstSet(state.board)) {
    state.deck = state.rng.shuffle(state.board.concat(state.deck))
    state.board = []
    deal(12)
    while (state.board.length < 18 && !firstSet(state.board) && state.deck.length) deal(3)
  }
}

function referenceClaim(state, cards) {
  assert(referenceSet(...cards))
  assert.equal(new Set(cards).size, 3)
  assert(cards.every(id => state.board.includes(id)))
  if (state.board.length >= 15) {
    state.board = state.board.filter(id => !cards.includes(id))
  } else {
    for (const id of cards) {
      const index = state.board.indexOf(id)
      state.board.splice(index, 1, ...state.deck.splice(0, 1))
    }
  }
  referenceEnsure(state)
}

function snapshot(state) {
  return {
    board: state.board.slice(),
    deck: state.deck.slice(),
    rng_state: state.rng.getState(),
    finished: firstSet(state.board) === null && state.deck.length === 0
  }
}

try {
  const bundle = path.join(temporary, 'solo_rules.cjs')
  buildSync({
    stdin: {
      contents: "export * from './app/javascript/lib/rules'; export * from './app/javascript/lib/solo_deal'; export * from './app/javascript/lib/seeded_shuffle'",
      resolveDir: root,
      sourcefile: 'solo_rules_tests.ts',
      loader: 'ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: bundle,
    logLevel: 'silent'
  })
  const { cardAttributes, isSet, setExists, SeededRng, fullDeck, startSoloDeal, applySoloClaim, isRoundOver, restoreSoloDeal } = require(bundle)
  const cards = fullDeck()
  for (const id of cards) {
    assert.deepEqual(Object.values(cardAttributes(id)), [1, 3, 9, 27].map(place => Math.floor((id - 1) / place) % 3))
  }

  let combinations = 0
  let sets = 0
  for (let a = 1; a <= 81; a++) {
    for (let b = a; b <= 81; b++) {
      for (let c = b; c <= 81; c++) {
        const expected = referenceSet(a, b, c)
        const triple = [a, b, c]
        assert.equal(isSet(a, b, c), expected, `isSet ${triple}`)
        assert.equal(isSet(c, b, a), expected, `isSet reversed ${triple}`)
        assert.equal(setExists(triple), expected, `setExists ${triple}`)
        assert.equal(setExists([c, b, a]), expected, `setExists reversed ${triple}`)
        combinations++
        if (expected && a !== b && b !== c) sets++
      }
    }
  }
  assert.equal(combinations, 91881)
  assert.equal(sets, 1080)
  console.log('  ok  all 91,881 triples including repeats match the reference; 1,080 distinct sets')

  const cap = [46, 10, 56, 61, 26, 62, 64, 69, 27, 22, 65, 17, 47, 67, 4, 18, 80, 19]
  assert.equal(firstSet(cap), null)
  const boards = [[], [1], [1, 2], [1, 2, 3, 5], [1, 1, 2], [1, 2, 1, 1], [1, 2, 1, 3], cap, cards]
  const boardRng = new SeededRng(42)
  for (let i = 0; i < 500; i++) {
    const size = boardRng.nextIndex(82)
    boards.push(boardRng.shuffle(cards).slice(0, size))
    boards.push(Array.from({ length: size }, () => boardRng.nextIndex(81) + 1))
  }
  for (const board of boards) {
    const before = board.slice()
    assert.equal(setExists(board), firstSet(board) !== null, `board ${board}`)
    assert.deepEqual(board, before)
  }
  console.log('  ok  setExists matches 1,009 varied boards without mutation')

  const vectors = JSON.parse(readFileSync(path.join(root, 'test/fixtures/rng_vectors.json'), 'utf8'))
  const nextCases = [...Object.entries(vectors.next_u32).map(([seed, values]) => [Number(seed), values]), ...Object.entries(vectors.string_seeds)]
  for (const [seed, expected] of nextCases) {
    const rng = new SeededRng(seed)
    assert.deepEqual(expected.map(() => rng.nextU32()), expected, `RNG seed ${seed}`)
    const restored = SeededRng.fromState(rng.getState())
    assert.deepEqual(Array.from({ length: 10 }, () => restored.nextU32()), Array.from({ length: 10 }, () => rng.nextU32()))
  }
  for (const [seed, expected] of Object.entries(vectors.decks)) {
    assert.deepEqual(new SeededRng(Number(seed)).shuffle(cards), expected, `deck seed ${seed}`)
  }
  console.log('  ok  integer/string RNG, state restoration, and shuffled deck vectors')

  function assertInvalidClaims(state) {
    const [a = 1, b = 2] = state.board
    const invalid = [
      [[a, a, a], 'Must select exactly 3 different cards'],
      [[a, a, b], 'Must select exactly 3 different cards'],
      [[a, b, a], 'Must select exactly 3 different cards'],
      [[b, a, a], 'Must select exactly 3 different cards'],
      [[a, b], 'Must select exactly 3 cards'],
      [[], 'Must select exactly 3 cards']
    ]
    const notSet = firstSet(state.board, (a, b, c) => !referenceSet(a, b, c))
    if (notSet) invalid.push([notSet, 'Not a valid set'])
    const missing = firstSet(cards.filter(id => !state.board.includes(id)))
    if (missing) invalid.push([missing, 'One or more cards are no longer on the board'])
    for (const [claim, error] of invalid) {
      const before = snapshot(state)
      const { board, deck, rng } = state
      assert.deepEqual(applySoloClaim(state, Object.freeze(claim)), { ok: false, error })
      assert.deepEqual(snapshot(state), before)
      assert.strictEqual(state.board, board)
      assert.strictEqual(state.deck, deck)
      assert.strictEqual(state.rng, rng)
    }
  }

  const games = []
  const expectedGames = []
  const seeds = [...Object.keys(vectors.decks).map(Number), ...Array.from({ length: 32 }, (_, i) => i + 2), 0xffffffff, -1, 0x100000000]
  for (const seed of seeds) {
    for (const descending of [false, true]) {
      const state = startSoloDeal(seed)
      const rng = new SeededRng(seed)
      const shuffled = rng.shuffle(cards)
      const reference = { board: shuffled.slice(0, 12), deck: shuffled.slice(12), rng }
      referenceEnsure(reference)
      const claims = []
      const snapshots = [snapshot(state)]
      assert.deepEqual(snapshot(state), snapshot(reference), `initial deal ${seed}`)
      for (let turn = 0; turn < 28; turn++) {
        assert.equal(isRoundOver(state), snapshot(reference).finished)
        assertInvalidClaims(state)
        if (isRoundOver(state)) break
        const claim = firstSet(reference.board)
        assert(claim, `missing set for seed ${seed} turn ${turn}`)
        claim.sort((a, b) => descending ? b - a : a - b)
        const restored = restoreSoloDeal(state.board, state.deck, state.rng.getState())
        assert.notStrictEqual(restored.board, state.board)
        assert.notStrictEqual(restored.deck, state.deck)
        assert.notStrictEqual(restored.rng, state.rng)
        assert.deepEqual(applySoloClaim(state, claim), { ok: true })
        assert.deepEqual(applySoloClaim(restored, claim), { ok: true })
        referenceClaim(reference, claim)
        assert.deepEqual(snapshot(state), snapshot(reference), `deal ${seed} turn ${turn}`)
        assert.deepEqual(snapshot(restored), snapshot(state), `restored deal ${seed} turn ${turn}`)
        claims.push(claim)
        snapshots.push(snapshot(state))
      }
      assert(isRoundOver(state), `seed ${seed} must finish`)
      games.push({ seed, claims })
      expectedGames.push(snapshots)
    }
  }
  console.log(`  ok  ${games.length} complete deals match the reference in both claim orders; invalid claims never mutate state`)

  const initial = [1, 2, 3, ...cap.slice(0, 9)]
  function extensionDeck(setFreeSize) {
    const prefix = cap.slice(0, setFreeSize)
    const remaining = cards.filter(id => ![1, 2, 3, ...prefix].includes(id))
    const completing = remaining.find(id => firstSet([...prefix, id]))
    assert(completing)
    return [...cap.slice(9, setFreeSize), completing, ...remaining.filter(id => id !== completing)]
  }
  const scenarios = [
    { name: 'replace in claim order', board: cards.slice(0, 12), deck: cards.slice(12), claim: [3, 1, 2], length: 12 },
    { name: 'remove from 15', board: cards.slice(0, 15), deck: cards.slice(15), claim: [3, 1, 2], length: 12 },
    { name: 'remove from 18', board: cards.slice(0, 18), deck: cards.slice(18), claim: [3, 1, 2], length: 15 },
    { name: 'partly exhausted deck', board: cards.slice(0, 12), deck: [13, 14], claim: [3, 1, 2], length: 11 },
    { name: 'last set', board: [3, 1, 2], deck: [], claim: [1, 3, 2], length: 0 },
    { name: 'extend to 15', board: initial, deck: extensionDeck(12), claim: [3, 1, 2], length: 15 },
    { name: 'extend to 18', board: initial, deck: extensionDeck(15), claim: [3, 1, 2], length: 18 },
    { name: 'reshuffle set-free 18', board: initial, deck: [...cap.slice(9), ...cards.filter(id => ![1, 2, 3, ...cap].includes(id))], claim: [3, 1, 2], reshuffle: true },
    { name: 'reshuffle after removal', board: [1, 2, 3, ...cap.slice(0, 15)], deck: [...cap.slice(15), ...cards.filter(id => ![1, 2, 3, ...cap].includes(id))], claim: [3, 1, 2], reshuffle: true }
  ]
  const expectedScenarios = scenarios.map(scenario => {
    scenario.rng_state = 0xdeadbeef
    assert.equal(new Set([...scenario.board, ...scenario.deck]).size, scenario.board.length + scenario.deck.length)
    const state = restoreSoloDeal(scenario.board, scenario.deck, scenario.rng_state)
    const reference = restoreSoloDeal(scenario.board, scenario.deck, scenario.rng_state)
    assertInvalidClaims(state)
    assert.deepEqual(applySoloClaim(state, scenario.claim), { ok: true })
    referenceClaim(reference, scenario.claim)
    assert.deepEqual(snapshot(state), snapshot(reference), scenario.name)
    assert.equal(isRoundOver(state), snapshot(reference).finished)
    if (scenario.length !== undefined) assert.equal(state.board.length, scenario.length, scenario.name)
    if (scenario.reshuffle) assert.notEqual(state.rng.getState(), scenario.rng_state, scenario.name)
    else assert.equal(state.rng.getState(), scenario.rng_state, scenario.name)
    return snapshot(state)
  })
  assert.deepEqual(expectedScenarios[0].board.slice(0, 3), [14, 15, 13])
  assert.deepEqual(expectedScenarios[1].deck, scenarios[1].deck)
  assert(expectedScenarios[4].finished)
  console.log('  ok  replacement/removal, partial exhaustion, expansion to 15/18, and canonical reshuffle branches')

  const ruby = `
require 'json'
require_relative './app/services/rules'
require_relative './app/services/solo_rng'
require_relative './app/services/solo_replay/simulator'
def snapshot(sim)
  { board: sim.board.dup, deck: sim.deck.dup, rng_state: sim.instance_variable_get(:@rng).state, finished: sim.finished? }
end
input = JSON.parse(STDIN.read)
games = input.fetch('games').map do |game|
  sim = SoloReplay::Simulator.new(game.fetch('seed'))
  snapshots = [snapshot(sim)]
  game.fetch('claims').each do |claim|
    sim.apply_claim!(claim)
    snapshots << snapshot(sim)
  end
  snapshots
end
scenarios = input.fetch('scenarios').map do |scenario|
  sim = SoloReplay::Simulator.allocate
  sim.instance_variable_set(:@board, scenario.fetch('board'))
  sim.instance_variable_set(:@deck, scenario.fetch('deck'))
  sim.instance_variable_set(:@rng, SoloRng.from_state(scenario.fetch('rng_state')))
  sim.instance_variable_set(:@status, 'playing')
  a, b = sim.board.first(2)
  [[a, a, a], [a, a, b], [a, b, a], [b, a, a]].each do |claim|
    before = snapshot(sim)
    begin
      sim.apply_claim!(claim)
      raise 'duplicate claim accepted'
    rescue RuntimeError => e
      raise unless e.message == 'must_select_three_different_cards'
    end
    raise 'duplicate claim mutated state' unless before == snapshot(sim)
  end
  sim.apply_claim!(scenario.fetch('claim'))
  snapshot(sim)
end
puts JSON.generate({ games: games, scenarios: scenarios })
`
  const parity = JSON.parse(execFileSync('ruby', ['-e', ruby], {
    cwd: root,
    input: JSON.stringify({ games, scenarios }),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  }))
  assert.deepEqual(parity.games, expectedGames, 'Ruby and TypeScript must match after every claim')
  assert.deepEqual(parity.scenarios, expectedScenarios, 'Ruby and TypeScript must match on every deal branch')
  console.log(`  ok  Ruby/TypeScript board, deck, RNG and terminal-state parity for ${games.length} complete deals and ${scenarios.length} branch scenarios`)
  console.log('\nAll checks passed.')
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
