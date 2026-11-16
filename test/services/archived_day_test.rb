# frozen_string_literal: true

require "test_helper"

class ArchivedDayTest < ActiveSupport::TestCase
  DAY = Date.new(2026, 11, 14)
  # Noon Pacific the day after: DAY closed ten hours ago.
  NOON = Time.utc(2026, 11, 15, 20)

  def create_daily_score(date, elapsed_ms:, player_id: SecureRandom.uuid, name: nil, events: [], completed_at: Time.current)
    game = SoloGame.create!(id: SecureRandom.uuid, player_id: player_id, seed: DailyPuzzle.new(date).seed.to_s, status: "completed", started_at: completed_at, daily_on: date)
    SoloScore.create!(solo_game: game, player_id: player_id, display_name: name, elapsed_ms: elapsed_ms, completed_at: completed_at, daily_on: date, misses: 2, events: events)
  end

  def create_puzzle_run(date, elapsed_ms: nil, player_id: SecureRandom.uuid, name: nil, attempts: nil, completed_at: Time.current)
    puzzle = ClassicPuzzle.new(date)
    claims = puzzle.sets.each_with_index.map { |set, i| { "cards" => set, "t_ms" => (i + 1) * 1_000 } }
    PuzzleRun.create!(id: SecureRandom.uuid, player_id: player_id, puzzle_on: date, cards: puzzle.cards, started_at: completed_at, display_name: name,
                      **(elapsed_ms ? { elapsed_ms: elapsed_ms, completed_at: completed_at, claims: claims, misses: 1, attempts: attempts } : {}))
  end

  test "an archived Puzzle is its board, all six sets and the day's final leaderboard" do
    travel_to NOON do
      create_puzzle_run(DAY, elapsed_ms: 40_000, name: "Rose")
      create_puzzle_run(DAY, elapsed_ms: 25_000)
      create_puzzle_run(DAY)
      create_puzzle_run(DAY - 1, elapsed_ms: 9_000, name: "Other day")
      day = ArchivedDay.find("puzzle", "21")

      assert_equal ["puzzle", 21, DAY, "Puzzle #21", "Set Puzzle #21", "/puzzle/21"], [day.kind, day.number, day.date, day.name, day.title, day.path]
      assert day.puzzle?
      assert_equal ClassicPuzzle.new(DAY).cards, day.board
      assert_equal ClassicPuzzle.new(DAY).sets, day.sets
      assert_equal 6, day.sets.length
      assert_nil day.seed
      assert_equal 2, day.total, "unfinished runs don't count"
      assert_equal 25_000, day.best_ms
      assert_equal [[1, nil, 25_000], [2, "Rose", 40_000]], day.leaderboard.map(&:to_a)
      assert_equal %i[rank display_name elapsed_ms], ArchivedDay::Entry.members, "a row is what the live leaderboard shows: no player id"
      assert_equal({ kind: "puzzle", number: 21, date: "2026-11-14", total: 2, times: [25_000, 40_000], cards: day.board }, day.play_data)
    end
  end

  test "an archived Daily Deal is its opening board, the sets on it, its seed and the day's final leaderboard" do
    travel_to NOON do
      create_daily_score(DAY - 20, elapsed_ms: 70_000)
      create_daily_score(DAY, elapsed_ms: 95_000, name: "Ada")
      create_daily_score(DAY, elapsed_ms: 80_000, name: "  ")
      day = ArchivedDay.find("daily", "21")

      seed = DailyPuzzle.new(DAY).seed
      assert_equal ["daily", 21, DAY, "Set Daily Deal #21", "/daily/21"], [day.kind, day.number, day.date, day.title, day.path]
      refute day.puzzle?
      assert_equal seed, day.seed
      assert_equal SoloReplay::Simulator.new(seed).board, day.board
      assert_operator day.board.length, :>=, 12
      assert_equal day.board.combination(3).select { |a, b, c| Rules.is_set?(a, b, c) }.map(&:sort).sort, day.sets
      refute_empty day.sets
      assert_equal [[1, nil, 80_000], [2, "Ada", 95_000]], day.leaderboard.map(&:to_a), "a blank name is no name"
      assert_equal({ kind: "daily", number: 21, date: "2026-11-14", total: 2, times: [80_000, 95_000], seed: seed }, day.play_data)
    end
  end

  test "the leaderboard is the top twenty, ties to whoever finished first" do
    travel_to NOON do
      25.times { |i| create_puzzle_run(DAY, elapsed_ms: 30_000 + i * 1_000, name: "P#{i}") }
      create_puzzle_run(DAY, elapsed_ms: 30_000, name: "Later", completed_at: Time.current + 1.minute)
      day = ArchivedDay.find("puzzle", "21")

      assert_equal 26, day.total
      assert_equal 20, day.leaderboard.length
      assert_equal %w[P0 Later P1], day.leaderboard.first(3).map(&:display_name)
      assert_equal (1..20).to_a, day.leaderboard.map(&:rank)
      assert_equal 20, day.play_data[:times].length
    end
  end

  test "only a closed day can be found" do
    travel_to NOON do
      create_daily_score(DAY - 20, elapsed_ms: 70_000)

      assert ArchivedDay.find("puzzle", "21")
      assert ArchivedDay.find("daily", "21")
      assert_nil ArchivedDay.find("puzzle", "22"), "today"
      assert_nil ArchivedDay.find("daily", "22"), "today"
      assert_nil ArchivedDay.find("puzzle", "23"), "tomorrow"
      assert_nil ArchivedDay.find("puzzle", "0")
      assert_nil ArchivedDay.find("puzzle", "021")
      assert_nil ArchivedDay.find("puzzle", nil)
      assert_nil ArchivedDay.find("practice", "1")
      assert_nil ArchivedDay.find(nil, "1")
    end

    assert_nil ArchivedDay.find("puzzle", "21", Time.utc(2026, 11, 15, 9, 59, 59)), "a second before the day closes"
    assert ArchivedDay.find("puzzle", "21", Time.utc(2026, 11, 15, 10, 0, 0)), "the second it closes"
  end

  test "a day that has not closed cannot be built, even directly" do
    now = Time.utc(2026, 11, 15, 9, 59, 59)
    open_archive = DailyArchive.for("puzzle", now)
    today = DailyArchive::Day.new("puzzle", 22, DAY + 1)
    ended = DailyArchive::Day.new("puzzle", 21, DAY)
    later = DailyArchive.for("puzzle", NOON)

    assert_raises(ArgumentError) { ArchivedDay.new(ended, archive: open_archive, now: now) }
    assert_raises(ArgumentError) { ArchivedDay.new(today, archive: open_archive, now: now) }
    assert_raises(ArgumentError, "an archive from later doesn't open a day early") { ArchivedDay.new(ended, archive: later, now: now) }
    assert_raises(ArgumentError) { ArchivedDay.new(today, archive: DailyArchive.for("puzzle", NOON + 2.days), now: NOON) }
    assert ArchivedDay.new(ended, archive: later, now: NOON)
  end

  test "a player's own result from the day comes back with their rank" do
    travel_to NOON do
      me = SecureRandom.uuid
      create_puzzle_run(DAY, elapsed_ms: 20_000)
      create_puzzle_run(DAY, elapsed_ms: 31_000, player_id: me, attempts: "hhmhhhh")
      create_puzzle_run(DAY - 1, player_id: me)
      claims = [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 20_000 }, { "type" => "claim", "cards" => [4, 5, 6], "t_ms" => 40_000 }]
      create_daily_score(DAY, elapsed_ms: 90_000, player_id: me, events: claims)
      create_daily_score(DAY, elapsed_ms: 99_000)

      assert_equal({ elapsed_ms: 31_000, misses: 1, rank: 2, total: 2, marks: "hhmhhhh" }, ArchivedDay.find("puzzle", "21").result_for(me))
      assert_nil ArchivedDay.find("puzzle", "20").result_for(me), "started that day but never finished"
      assert_nil ArchivedDay.find("puzzle", "21").result_for(SecureRandom.uuid)

      deal = ArchivedDay.find("daily", "1").result_for(me)
      assert_equal [90_000, 2, 1, 2], deal.values_at(:elapsed_ms, :misses, :rank, :total)
      assert_match(/\A[gyr]{2}\z/, deal[:marks])
      assert_nil ArchivedDay.find("daily", "1").result_for(SecureRandom.uuid)
    end
  end

  test "a day links to its neighbours and to the other game's day on the same date" do
    travel_to NOON do
      create_daily_score(DAY - 2, elapsed_ms: 70_000)
      day = ArchivedDay.find("puzzle", "21")

      assert_equal "/puzzle/20", day.previous_day.path
      assert_nil day.next_day, "the next one is today's"
      assert_equal "/daily/3", day.sibling.path
      first = ArchivedDay.find("puzzle", "1")
      assert_nil first.previous_day
      assert_equal "/puzzle/2", first.next_day.path
      assert_nil first.sibling, "the Daily Deal hadn't launched in this database"
      assert_equal "/puzzle/19", ArchivedDay.find("daily", "1").sibling.path
    end
  end
end
