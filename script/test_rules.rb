#!/usr/bin/env ruby
# frozen_string_literal: true

# Standalone checks for the Set rules and solo replay engine.
# Run with: ruby script/test_rules.rb

require 'json'
require_relative '../app/services/rules'
require_relative '../app/services/solo_rng'
require_relative '../app/services/solo_replay/simulator'

$failures = 0

def assert(condition, message)
  if condition
    puts "  ok  #{message}"
  else
    $failures += 1
    puts "FAIL  #{message}"
  end
end

def reference_set?(a, b, c)
  [1, 3, 9, 27].all? do |place|
    values = [a, b, c].map { |id| ((id - 1) / place) % 3 }
    [1, 3].include?(values.uniq.length)
  end
end

def reference_set_exists?(board)
  board.combination(3).any? { |a, b, c| reference_set?(a, b, c) }
end

def simulator_snapshot(sim)
  {
    board: sim.board.dup,
    deck: sim.deck.dup,
    rng_state: sim.instance_variable_get(:@rng).state,
    finished: sim.finished?
  }
end

puts "Card attribute mapping"
assert(Rules.card_attributes(1) == { number: 0, color: 0, shape: 0, shading: 0 }, 'card 1 is one solid red squiggle')
assert(Rules.card_attributes(2) == { number: 1, color: 0, shape: 0, shading: 0 }, 'card 2 is two solid red squiggles')
assert(Rules.card_attributes(4) == { number: 0, color: 1, shape: 0, shading: 0 }, 'card 4 is one solid purple squiggle')
assert(Rules.card_attributes(10) == { number: 0, color: 0, shape: 1, shading: 0 }, 'card 10 is one solid red diamond')
assert(Rules.card_attributes(28) == { number: 0, color: 0, shape: 0, shading: 1 }, 'card 28 is one striped red squiggle')
assert(Rules.card_attributes(81) == { number: 2, color: 2, shape: 2, shading: 2 }, 'card 81 is three open green ovals')
assert((1..81).map { |id| Rules.card_attributes(id) }.uniq.length == 81, 'all 81 cards have unique attributes')

puts "\nSet validation"
assert(Rules.is_set?(1, 2, 3), 'cards 1,2,3 form a set (number varies, rest same)')
assert(Rules.is_set?(1, 4, 7), 'cards 1,4,7 form a set (color varies, rest same)')
assert(!Rules.is_set?(1, 2, 4), 'cards 1,2,4 do not form a set')
assert(Rules.is_set?(1, 1, 1), 'duplicated cards trivially "match" - the game engine rejects duplicate ids before this check')

puts "\nExhaustive rule equivalence"
cards = (1..81).to_a
combinations = 0
set_count = 0
mismatch = nil
cards.repeated_combination(3) do |triple|
  expected = reference_set?(*triple)
  actual = Rules.is_set?(*triple)
  exists = Rules.set_exists?(triple)
  reversed = triple.reverse
  unless actual == expected && exists == expected &&
      Rules.is_set?(*reversed) == expected && Rules.set_exists?(reversed) == expected
    mismatch = triple
    break
  end
  combinations += 1
  set_count += 1 if expected && triple.uniq.length == 3
end
assert(mismatch.nil?, "rules match the reference for #{combinations} triples including repeats (mismatch: #{mismatch.inspect})")
assert(combinations == 91_881 && set_count == 1_080, 'all 91,881 triples and 1,080 distinct sets were checked')

puts "\nThird card completion"
all_good = cards.all? do |a|
  cards.all? do |b|
    c = Rules.third_card(a, b)
    c.between?(1, 81) && reference_set?(a, b, c)
  end
end
assert(all_good, 'third_card matches the reference for all 6,561 ordered pairs')

puts "\nSet existence"
cap = [46, 10, 56, 61, 26, 62, 64, 69, 27, 22, 65, 17, 47, 67, 4, 18, 80, 19]
assert(!reference_set_exists?(cap), 'the 18-card set-free fixture contains no set')
boards = [[], [1], [1, 2], [1, 2, 3, 5], [1, 1, 2], [1, 2, 1, 1], [1, 2, 1, 3], cap, cards]
rng = Random.new(42)
500.times do
  size = rng.rand(0..81)
  boards << cards.sample(size, random: rng)
  boards << Array.new(size) { rng.rand(1..81) }
end
boards.each_with_index do |board, index|
  before = board.dup
  expected = reference_set_exists?(board)
  unless Rules.set_exists?(board) == expected && board == before
    mismatch = index
    break
  end
end
assert(mismatch.nil?, 'set_exists? matches the reference on 1,009 varied boards without mutation')

puts "\nSeeded RNG vectors"
vectors = JSON.parse(File.read(File.expand_path('../test/fixtures/rng_vectors.json', __dir__)))
vectors.fetch('next_u32').each do |seed, expected|
  rng = SoloRng.new(seed.to_i)
  assert(Array.new(expected.length) { rng.next_u32 } == expected, "integer seed #{seed} matches next_u32 vectors")
  restored = SoloRng.from_state(rng.state)
  assert(Array.new(10) { rng.next_u32 } == Array.new(10) { restored.next_u32 }, "integer seed #{seed} restores RNG state")
end
vectors.fetch('string_seeds').each do |seed, expected|
  rng = SoloRng.new(seed)
  assert(Array.new(expected.length) { rng.next_u32 } == expected, "string seed #{seed} matches next_u32 vectors")
end
vectors.fetch('decks').each do |seed, expected|
  assert(SoloRng.new(seed.to_i).shuffle(cards) == expected, "integer seed #{seed} matches shuffled deck vector")
end

puts "\nInvalid solo claims"
[0, 1, 42, 2_147_483_647, 3_735_928_559].each do |seed|
  sim = SoloReplay::Simulator.new(seed)
  27.times do
    a, b = sim.board.first(2)
    missing = (cards - sim.board).combination(3).find { |triple| reference_set?(*triple) }
    invalid = sim.board.combination(3).find { |triple| !reference_set?(*triple) }
    claims = [
      [[a, a, a], 'must_select_three_different_cards'],
      [[a, a, b], 'must_select_three_different_cards'],
      [[a, b, a], 'must_select_three_different_cards'],
      [[b, a, a], 'must_select_three_different_cards'],
      [[a.to_s, a, a.to_s], 'must_select_three_different_cards'],
      [[a, b], 'must_select_three'],
      [[], 'must_select_three']
    ]
    claims << [missing, 'cards_not_on_board'] if missing
    claims << [invalid, 'not_a_set'] if invalid
    claims.each do |claim, expected|
      before = simulator_snapshot(sim)
      board = sim.board
      deck = sim.deck
      error = nil
      begin
        sim.apply_claim!(claim)
      rescue RuntimeError => e
        error = e.message
      end
      unless error == expected && simulator_snapshot(sim) == before && sim.board.equal?(board) && sim.deck.equal?(deck)
        raise "invalid claim mutated state or raised the wrong error: #{claim.inspect} (#{error.inspect})"
      end
    end
    break if sim.finished?

    claim = sim.board.combination(3).find { |triple| reference_set?(*triple) }
    raise 'no set available before round over' unless claim

    sim.apply_claim!(claim.sort)
  end
  assert(sim.finished?, "seed #{seed} finishes with invalid claims leaving board, deck, RNG and status unchanged")
end

if $failures.zero?
  puts "\nAll checks passed."
else
  puts "\n#{$failures} check(s) failed."
  exit 1
end
