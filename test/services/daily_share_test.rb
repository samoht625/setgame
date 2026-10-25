# frozen_string_literal: true

require "test_helper"

class DailyShareTest < ActiveSupport::TestCase
  test "a token round-trips the deal number and time" do
    token = DailyShare.token(number: 12, elapsed_ms: 161_400)
    assert_match(/\A[0-9a-z]+-[0-9a-z]+-[\w-]{12}\z/, token)

    result = DailyShare.verify(token)
    assert_equal [12, 161_400, "2:41"], [result.number, result.elapsed_ms, result.time]
    assert_equal token, result.token
  end

  test "a token carries rank, streak and grid, and is only good for its kind" do
    token = DailyShare.token(number: 3, elapsed_ms: 95_000, rank: 2, total: 11, streak: 4, marks: "ggyrgy")
    result = DailyShare.verify(token)
    assert_equal [3, 95_000, 2, 11, 4, "ggyrgy"], [result.number, result.elapsed_ms, result.rank, result.total, result.streak, result.marks]
    assert_equal "Set Daily Deal #3", result.title
    assert_equal "2nd of 11 · 4-day streak", result.standing
    assert_nil DailyShare.verify(token, kind: "puzzle")
    assert_nil DailyShare.verify(token.sub("ggyrgy", "gggggg"))

    puzzle = DailyShare.token(kind: "puzzle", number: 1, elapsed_ms: 40_000, rank: 1, total: 1, streak: 1, marks: "hhmhhhh")
    result = DailyShare.verify(puzzle, kind: "puzzle")
    assert_equal ["Set Puzzle #1", "hhmhhhh", "1st of 1"], [result.title, result.marks, result.standing]
    assert_nil DailyShare.verify(puzzle)
  end

  test "edited or malformed tokens are rejected" do
    number, _elapsed, signature = DailyShare.token(number: 12, elapsed_ms: 161_400).split("-", 3)
    assert_nil DailyShare.verify("#{number}-1-#{signature}")
    assert_nil DailyShare.verify("#{number}-#{1.to_s(36)}")
    assert_nil DailyShare.verify(nil)
    assert_nil DailyShare.verify("../../etc/passwd")
    assert_nil DailyShare.verify(DailyShare.token(number: 12, elapsed_ms: 0))
  end
end
