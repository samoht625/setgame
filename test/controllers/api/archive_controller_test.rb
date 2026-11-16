# frozen_string_literal: true

require "test_helper"

module Api
  class ArchiveControllerTest < ActionDispatch::IntegrationTest
    DAY = Date.new(2026, 11, 14)
    # 11:50pm Pacific on DAY, ten minutes before it ends.
    LATE = Time.utc(2026, 11, 15, 7, 50)
    # DAY ends at 08:00 UTC and closes at 10:00 UTC.
    CLOSED = Time.utc(2026, 11, 15, 10, 0, 0)
    NOON = Time.utc(2026, 11, 15, 20)

    setup do
      @player_id = SecureRandom.uuid
      @headers = { "X-Player-Id" => @player_id }
    end

    def create_daily_score(date, elapsed_ms:, player_id: SecureRandom.uuid)
      game = SoloGame.create!(id: SecureRandom.uuid, player_id: player_id, seed: DailyPuzzle.new(date).seed.to_s, status: "completed", started_at: Time.current, daily_on: date)
      SoloScore.create!(solo_game: game, player_id: player_id, elapsed_ms: elapsed_ms, completed_at: Time.current, daily_on: date, misses: 4,
                        events: [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => elapsed_ms }])
    end

    def create_puzzle_run(date, elapsed_ms:, player_id: SecureRandom.uuid)
      puzzle = ClassicPuzzle.new(date)
      claims = puzzle.sets.each_with_index.map { |set, i| { "cards" => set, "t_ms" => (i + 1) * 1_000 } }
      PuzzleRun.create!(id: SecureRandom.uuid, player_id: player_id, puzzle_on: date, cards: puzzle.cards, started_at: Time.current,
                        elapsed_ms: elapsed_ms, completed_at: Time.current, claims: claims, misses: 1, attempts: "hhhmhhh")
    end

    def start_puzzle(headers: @headers)
      post "/api/puzzle/games", headers: headers, as: :json
      JSON.parse(response.body)
    end

    def finish_puzzle(started, headers: @headers, elapsed_ms: 13_000)
      claims = ClassicPuzzle.sets_in(started.fetch("cards")).each_with_index.map { |set, i| { cards: set, t_ms: (i + 1) * 2_000 } }
      post "/api/puzzle/games/#{started.fetch("game_id")}/finish", params: { elapsed_ms: elapsed_ms, claims: claims, misses: 0, display_name: "Late" }, headers: headers, as: :json
    end

    def start_daily(headers: @headers)
      post "/api/daily/games", headers: headers
      JSON.parse(response.body)
    end

    # A whole Daily Deal's claims, with the game's start moved back so the run fits the wall clock.
    def finish_daily(started, headers: @headers)
      game = SoloGame.find(started.fetch("game_id"))
      events = play_to_completion(game.seed.to_i)
      elapsed_ms = events.last.fetch(:t_ms)
      game.update!(started_at: [game.started_at, (elapsed_ms / 1000.0 + 5).seconds.ago].min)
      post "/api/solo/scores", headers: headers, params: { game_id: game.id, elapsed_ms: elapsed_ms, events: events, misses: 0, display_name: "Late" }, as: :json
    end

    def snapshot
      [SoloScore.order(:id).map(&:attributes), PuzzleRun.order(:id).map(&:attributes)]
    end

    test "it tells a player how they did on a closed day, and nothing about the day itself" do
      travel_to NOON do
        create_puzzle_run(DAY, elapsed_ms: 20_000)
        create_puzzle_run(DAY, elapsed_ms: 31_000, player_id: @player_id)
        create_daily_score(DAY, elapsed_ms: 190_000, player_id: @player_id)

        get "/api/archive/puzzle/21", headers: @headers
        assert_response :success
        assert_equal(
          { "kind" => "puzzle", "number" => 21, "date" => "2026-11-14", "result" => { "elapsed_ms" => 31_000, "misses" => 1, "rank" => 2, "total" => 2, "marks" => "hhhmhhh" } },
          JSON.parse(response.body)
        )

        get "/api/archive/daily/1", headers: @headers
        assert_response :success
        body = JSON.parse(response.body)
        assert_equal %w[date kind number result], body.keys.sort, "no seed, cards or sets: the page has those"
        assert_equal [190_000, 4, 1, 1], body.fetch("result").values_at("elapsed_ms", "misses", "rank", "total")
        assert_equal %w[elapsed_ms marks misses rank total], body.fetch("result").keys.sort

        get "/api/archive/puzzle/21", headers: { "X-Player-Id" => SecureRandom.uuid }
        assert_response :success
        assert_nil JSON.parse(response.body).fetch("result"), "someone who didn't play that day"

        get "/api/archive/puzzle/20", headers: @headers
        assert_nil JSON.parse(response.body).fetch("result")
      end
    end

    test "a result is only shown to the browser that proves it is that player" do
      travel_to NOON do
        create_puzzle_run(DAY, elapsed_ms: 31_000, player_id: @player_id)

        get "/api/archive/puzzle/21", headers: { "X-Player-Id" => @player_id, "X-Player-Key" => nil }
        assert_response :success
        assert_nil JSON.parse(response.body).fetch("result"), "a player id alone, as shown on leaderboards, is not enough"
      end
    end

    test "the archive's played days: this player's ranked finishes on one page of it, by day number" do
      travel_to NOON do
        # The Daily Deal's first day, so DAY is Daily Deal #43 and Puzzle #21, and the archive has two pages.
        create_daily_score(Date.new(2026, 10, 3), elapsed_ms: 150_000)
        create_daily_score(DAY, elapsed_ms: 190_000, player_id: @player_id)
        create_puzzle_run(DAY, elapsed_ms: 31_000, player_id: @player_id)
        create_puzzle_run(DAY - 3, elapsed_ms: 45_000, player_id: @player_id)
        create_daily_score(Date.new(2026, 10, 5), elapsed_ms: 260_000, player_id: @player_id)
        # Started that day and never finished: not played, as far as the archive goes.
        PuzzleRun.create!(id: SecureRandom.uuid, player_id: @player_id, puzzle_on: DAY - 1, cards: ClassicPuzzle.new(DAY - 1).cards, started_at: Time.current)
        # Today's isn't in the archive yet.
        create_puzzle_run(DAY + 1, elapsed_ms: 20_000, player_id: @player_id)
        create_daily_score(DAY + 1, elapsed_ms: 170_000, player_id: @player_id)
        # Other players' days.
        create_puzzle_run(DAY - 1, elapsed_ms: 25_000)
        create_daily_score(DAY - 2, elapsed_ms: 180_000)
        create_puzzle_run(DAY, elapsed_ms: 12_000)
        before = snapshot

        get "/api/archive", headers: @headers
        assert_response :success
        assert_equal(
          { "page" => 1, "daily" => { "43" => { "elapsed_ms" => 190_000 } }, "puzzle" => { "21" => { "elapsed_ms" => 31_000 }, "18" => { "elapsed_ms" => 45_000 } } },
          JSON.parse(response.body)
        )
        assert_includes response.headers["Cache-Control"], "private", "one player's history is never a shared cache's to keep"

        get "/api/archive", params: { page: "1" }, headers: @headers
        assert_equal %w[43], JSON.parse(response.body).fetch("daily").keys

        get "/api/archive", params: { page: "2" }, headers: @headers
        assert_response :success
        assert_equal({ "page" => 2, "daily" => { "3" => { "elapsed_ms" => 260_000 } }, "puzzle" => {} }, JSON.parse(response.body))

        get "/api/archive", headers: { "X-Player-Id" => SecureRandom.uuid }
        assert_response :success
        assert_equal({ "page" => 1, "daily" => {}, "puzzle" => {} }, JSON.parse(response.body), "someone who has played none of them")

        get "/api/archive", headers: { "X-Player-Id" => @player_id, "X-Player-Key" => nil }
        assert_equal({ "page" => 1, "daily" => {}, "puzzle" => {} }, JSON.parse(response.body), "a player id alone, as shown on leaderboards, is not enough")

        ["3", "0", "-1", "01", "2.0", "two", "99999"].each do |page|
          get "/api/archive", params: { page: page }, headers: @headers
          assert_response :not_found, "page=#{page}"
          assert_equal({ "error" => "not_found" }, JSON.parse(response.body))
        end
        get "/api/archive?page[]=1", headers: @headers
        assert_response :not_found

        assert_equal before, snapshot, "asking writes nothing"
      end
    end

    test "a day's ranked finish shows in the archive's played days only once the day has closed" do
      travel_to LATE do
        create_daily_score(DAY - 1, elapsed_ms: 150_000)
        create_puzzle_run(DAY, elapsed_ms: 31_000, player_id: @player_id)
        create_daily_score(DAY, elapsed_ms: 190_000, player_id: @player_id)
      end

      [LATE, CLOSED - 1.second].each do |open|
        travel_to open do
          get "/api/archive", headers: @headers
          assert_response :success
          assert_equal({ "page" => 1, "daily" => {}, "puzzle" => {} }, JSON.parse(response.body), "at #{open}")
        end
      end

      travel_to CLOSED do
        get "/api/archive", headers: @headers
        assert_equal({ "page" => 1, "daily" => { "2" => { "elapsed_ms" => 190_000 } }, "puzzle" => { "21" => { "elapsed_ms" => 31_000 } } }, JSON.parse(response.body))
      end
    end

    test "days that are not in the archive are not found" do
      travel_to NOON do
        create_daily_score(DAY, elapsed_ms: 190_000)

        %w[puzzle/22 puzzle/23 puzzle/0 puzzle/021 puzzle/abc puzzle/2026-11-14 daily/2 daily/3 daily/0 practice/1 solo/1 stats/1].each do |path|
          get "/api/archive/#{path}", headers: @headers
          assert_response :not_found, path
          assert_equal({ "error" => "not_found" }, JSON.parse(response.body), path)
        end
      end
    end

    test "a Puzzle run started before midnight can finish in the next two hours, and not after the day closes" do
      early, late = nil
      late_headers = { "X-Player-Id" => SecureRandom.uuid }
      travel_to LATE do
        early = start_puzzle
        late = start_puzzle(headers: late_headers)
        assert_equal ["2026-11-14", "2026-11-14"], [early.fetch("date"), late.fetch("date")]
      end

      travel_to CLOSED - 1.second do
        finish_puzzle(early, elapsed_ms: 7_000_000)
        assert_response :success
        assert_equal 1, ClassicPuzzle.new(DAY).total, "inside the grace the run still counts for the day it was started on"
      end

      travel_to CLOSED do
        before = snapshot
        finish_puzzle(late, headers: late_headers, elapsed_ms: 7_000_000)
        assert_response :unprocessable_entity
        assert_equal "day_closed", JSON.parse(response.body).fetch("error")
        assert_equal before, snapshot, "a closed day's runs are never touched"
        assert_equal 1, ClassicPuzzle.new(DAY).total
        assert_equal 0, ClassicPuzzle.today.streak_for(late_headers.fetch("X-Player-Id"))

        get "/puzzle/21"
        assert_response :success
        assert_includes response.body, "1 finisher"
      end
    end

    test "a Daily Deal started before midnight can finish in the next two hours, and not after the day closes" do
      early, late = nil
      late_headers = { "X-Player-Id" => SecureRandom.uuid }
      travel_to LATE do
        early = start_daily
        late = start_daily(headers: late_headers)
        assert_equal ["2026-11-14", "2026-11-14"], [early.fetch("date"), late.fetch("date")]
      end

      travel_to CLOSED - 1.second do
        finish_daily(early)
        assert_response :success
        assert_equal "2026-11-14", JSON.parse(response.body).dig("daily", "date")
        assert_equal 1, DailyPuzzle.new(DAY).total
      end

      travel_to CLOSED do
        before = snapshot
        finish_daily(late, headers: late_headers)
        assert_response :unprocessable_entity
        assert_equal "day_closed", JSON.parse(response.body).fetch("error")
        assert_equal before, snapshot
        assert_equal 1, DailyPuzzle.new(DAY).total
        assert_equal "open", SoloGame.find(late.fetch("game_id")).status
        assert_equal 0, DailyPuzzle.today.streak_for(late_headers.fetch("X-Player-Id"))

        get "/daily/1"
        assert_response :success
        assert_includes response.body, "1 finisher"
      end
    end

    test "a game can only ever be started for today, so an archived day cannot be played for a rank" do
      travel_to NOON do
        create_puzzle_run(DAY, elapsed_ms: 20_000)
        create_daily_score(DAY, elapsed_ms: 190_000)
        before = snapshot

        post "/api/puzzle/games", params: { date: "2026-11-14", number: 21, puzzle_on: "2026-11-14" }, headers: @headers, as: :json
        assert_response :created
        assert_equal ["2026-11-15", 22], JSON.parse(response.body).values_at("date", "number")
        post "/api/daily/games", params: { date: "2026-11-14", number: 1, daily_on: "2026-11-14" }, headers: @headers, as: :json
        assert_response :created
        assert_equal ["2026-11-15", 2], JSON.parse(response.body).values_at("date", "number")

        assert_equal before, [SoloScore.where(daily_on: DAY).order(:id).map(&:attributes), PuzzleRun.where(puzzle_on: DAY).order(:id).map(&:attributes)]
        assert_equal [1, 1], [ClassicPuzzle.new(DAY).total, DailyPuzzle.new(DAY).total]
        assert_equal 0, DailyPuzzle.today.streak_for(@player_id)
        assert_equal 0, ClassicPuzzle.today.streak_for(@player_id)
      end
    end
  end
end
