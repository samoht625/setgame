#!/usr/bin/env ruby
# frozen_string_literal: true

# Standalone sanity checks for the Set rules engine.
# Run with: ruby script/test_rules.rb

require_relative '../app/services/rules'

$failures = 0

def assert(condition, message)
  if condition
    puts "  ok  #{message}"
  else
    $failures += 1
    puts "FAIL  #{message}"
  end
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

puts "\nThird card completion"
all_good = (1..81).to_a.combination(2).all? do |a, b|
  c = Rules.third_card(a, b)
  c.between?(1, 81) && Rules.is_set?(a, b, c)
end
assert(all_good, 'third_card always completes a valid set for every pair')

puts "\nSet existence"
assert(Rules.set_exists?([1, 2, 3, 5]), 'set_exists? finds a set when present')
assert(!Rules.set_exists?([1, 2]), 'set_exists? is false with fewer than 3 cards')

# Probabilistic check: a full deck always contains a set
assert(Rules.set_exists?((1..81).to_a), 'the full deck contains at least one set')

if $failures.zero?
  puts "\nAll checks passed."
else
  puts "\n#{$failures} check(s) failed."
  exit 1
end
