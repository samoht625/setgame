# frozen_string_literal: true

require "test_helper"

class ClassicPuzzleTest < ActiveSupport::TestCase
  test "every day's board has 12 distinct cards and exactly 6 sets" do
    (0...60).each do |offset|
      puzzle = ClassicPuzzle.new(Date.new(2026, 10, 25) + offset)
      cards = puzzle.cards
      assert_equal 12, cards.length
      assert_equal 12, cards.uniq.length
      assert cards.all? { |c| c.between?(1, 81) }
      assert_equal 6, puzzle.sets.length
      brute = cards.combination(3).select { |a, b, c| Rules.is_set?(a, b, c) }.map(&:sort).sort
      assert_equal brute, puzzle.sets
    end
  end

  test "the board is the same for everyone on a day and changes day to day" do
    day = Date.new(2026, 11, 2)
    assert_equal ClassicPuzzle.new(day).cards, ClassicPuzzle.new(day).cards
    refute_equal ClassicPuzzle.new(day).cards, ClassicPuzzle.new(day + 1).cards
  end

  test "once someone has played, the stored board wins" do
    day = Date.new(2026, 11, 3)
    stored = ClassicPuzzle.generate(12_345)
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: SecureRandom.uuid, puzzle_on: day, cards: stored, started_at: Time.current)
    assert_equal stored, ClassicPuzzle.new(day).cards
  end

  test "puzzles are numbered from launch day" do
    assert_equal 1, ClassicPuzzle.new(Date.new(2026, 10, 25)).number
    assert_equal 8, ClassicPuzzle.new(Date.new(2026, 11, 1)).number
  end
end
