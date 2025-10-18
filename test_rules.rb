#!/usr/bin/env ruby
# Quick test script for the Set rules engine

require_relative 'app/services/rules'

puts "Testing Set Rules Engine"
puts "=" * 50

# Test 1: Card attributes
puts "\n1. Testing card attribute mapping:"
puts "Card 1: #{Rules.card_attributes(1)}"
puts "Card 2: #{Rules.card_attributes(2)}"
puts "Card 3: #{Rules.card_attributes(3)}"
puts "Card 28: #{Rules.card_attributes(28)}"

# Test 2: Valid set (all same number, all different shapes, all same shading, all same color)
puts "\n2. Testing valid set:"
card1, card2, card3 = 1, 2, 3
puts "Cards: #{card1}, #{card2}, #{card3}"
puts "Is valid set? #{Rules.is_set?(card1, card2, card3)}"

# Test 3: Invalid set
puts "\n3. Testing invalid set:"
card1, card2, card3 = 1, 2, 4
puts "Cards: #{card1}, #{card2}, #{card3}"
puts "Is valid set? #{Rules.is_set?(card1, card2, card3)}"

# Test 4: Third card calculation
puts "\n4. Testing third card calculation:"
card1, card2 = 1, 2
third = Rules.third_card(card1, card2)
puts "Given cards #{card1} and #{card2}, third card is: #{third}"
puts "Does #{card1}, #{card2}, #{third} form a set? #{Rules.is_set?(card1, card2, third)}"

# Test 5: Set exists check
puts "\n5. Testing set exists check:"
board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
puts "Board: #{board}"
puts "Does a set exist? #{Rules.set_exists?(board)}"

# Test 6: No set exists
puts "\n6. Testing no set exists:"
board = [1, 2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17]
puts "Board: #{board}"
puts "Does a set exist? #{Rules.set_exists?(board)}"

puts "\n" + "=" * 50
puts "Tests complete!"

