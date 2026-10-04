# frozen_string_literal: true

require "test_helper"

class DailyPuzzleTest < ActiveSupport::TestCase
  test "days roll over at midnight Pacific, in summer and in winter time" do
    assert_equal Date.new(2026, 10, 3), DailyPuzzle.today(Time.utc(2026, 10, 4, 6, 59, 59)).date
    assert_equal Date.new(2026, 10, 4), DailyPuzzle.today(Time.utc(2026, 10, 4, 7)).date
    assert_equal Date.new(2026, 11, 30), DailyPuzzle.today(Time.utc(2026, 12, 1, 7, 59, 59)).date
    assert_equal Date.new(2026, 12, 1), DailyPuzzle.today(Time.utc(2026, 12, 1, 8)).date
    # New York (the app's zone) has turned the page; the daily hasn't yet.
    assert_equal Date.new(2026, 10, 3), DailyPuzzle.today(Time.find_zone("America/New_York").local(2026, 10, 4, 1, 30)).date
  end

  test "the next deal lands at the coming Pacific midnight, including across a clock change" do
    assert_equal Time.utc(2026, 10, 4, 7), DailyPuzzle.new(Date.new(2026, 10, 3)).next_at
    # Clocks fall back on Nov 1, 2026, so that day ends at 8am UTC, not 7am.
    assert_equal Time.utc(2026, 11, 2, 8), DailyPuzzle.new(Date.new(2026, 11, 1)).next_at
  end

  test "the seed is the same for everyone on a day, differs between days, and comes from the app secret" do
    day = Date.new(2026, 10, 3)
    seed = DailyPuzzle.new(day).seed

    assert_equal seed, DailyPuzzle.new(day).seed
    assert_includes 0...2**32, seed
    refute_equal seed, DailyPuzzle.new(day + 1).seed
    key = Rails.application.key_generator.generate_key("setgame daily seed", 32)
    assert_equal OpenSSL::HMAC.digest("SHA256", key, "daily:2026-10-03").unpack1("N"), seed
  end

  test "once a day has been played, its stored seed is the deal" do
    day = Date.new(2026, 10, 3)
    create_daily_game(day, seed: "12345")
    assert_equal 12_345, DailyPuzzle.new(day).seed
  end

  test "the same seed deals the same cards on the server as in the browser" do
    seed = DailyPuzzle.new(Date.new(2026, 10, 3)).seed
    first = SoloReplay::Simulator.new(seed)
    second = SoloReplay::Simulator.new(seed)
    assert_equal first.board, second.board
    assert_equal 12, first.board.length
    assert_equal play_to_completion(seed), play_to_completion(seed)
  end

  test "deals are numbered from the first day anyone played" do
    assert_equal 1, DailyPuzzle.new(Date.new(2026, 10, 3)).number

    create_daily_game(Date.new(2026, 10, 1))
    assert_equal 1, DailyPuzzle.new(Date.new(2026, 10, 1)).number
    assert_equal 3, DailyPuzzle.new(Date.new(2026, 10, 3)).number
    assert_equal 33, DailyPuzzle.new(Date.new(2026, 11, 2)).number
  end

  test "a streak counts consecutive finished days and lives until a day is missed" do
    today = Date.new(2026, 10, 3)
    streak = ->(*days_ago) { DailyPuzzle.streak(days_ago.map { |n| today - n }, today: today) }

    assert_equal 0, streak.call
    assert_equal 1, streak.call(0)
    assert_equal 3, streak.call(0, 1, 2)
    assert_equal 2, streak.call(1, 2), "today can still be played, so yesterday's streak is alive"
    assert_equal 0, streak.call(2, 3), "a missed day ends the streak"
    assert_equal 2, streak.call(0, 1, 3, 4, 5)
    assert_equal 1, streak.call(0, 0)
  end

  test "each player gets one ranked game a day, and the database holds the line" do
    puzzle = DailyPuzzle.new(Date.new(2026, 10, 3))
    player = SecureRandom.uuid

    game = puzzle.start_ranked_game(player)
    assert_equal puzzle.date, game.daily_on
    assert_equal puzzle.seed.to_s, game.seed
    assert puzzle.attempted?(player)
    assert_nil puzzle.start_ranked_game(player)
    assert puzzle.start_ranked_game(SecureRandom.uuid), "other players still get theirs"
    assert DailyPuzzle.new(puzzle.date + 1).start_ranked_game(player), "and this player gets tomorrow's"
    assert_raises(ActiveRecord::RecordNotUnique) { create_daily_game(puzzle.date, player_id: player) }
  end

  test "ranks are by time, with ties going to whoever finished first" do
    puzzle = DailyPuzzle.new(Date.new(2026, 10, 3))
    at = Time.utc(2026, 10, 4, 1)
    slow = create_daily_score(puzzle.date, elapsed_ms: 90_000, completed_at: at)
    tied_later = create_daily_score(puzzle.date, elapsed_ms: 60_000, completed_at: at + 1.minute)
    tied_first = create_daily_score(puzzle.date, elapsed_ms: 60_000, completed_at: at)
    create_daily_score(puzzle.date - 1, elapsed_ms: 10_000, completed_at: at - 1.day)

    assert_equal [tied_first, tied_later, slow].map(&:id), puzzle.leaderboard.map(&:id)
    assert_equal [1, 2, 3], [tied_first, tied_later, slow].map { |score| puzzle.rank_of(score) }
    assert_equal 3, puzzle.total
  end

  private

  def create_daily_game(date, player_id: SecureRandom.uuid, seed: "1")
    SoloGame.create!(id: SecureRandom.uuid, player_id: player_id, seed: seed, status: "open", started_at: Time.current, daily_on: date)
  end

  def create_daily_score(date, elapsed_ms:, completed_at:, player_id: SecureRandom.uuid)
    game = create_daily_game(date, player_id: player_id)
    SoloScore.create!(solo_game: game, player_id: player_id, elapsed_ms: elapsed_ms, completed_at: completed_at, daily_on: date, misses: 0)
  end
end
