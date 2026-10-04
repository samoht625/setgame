# frozen_string_literal: true

require "test_helper"

module Api
  class DailyControllerTest < ActionDispatch::IntegrationTest
    # 7pm on Oct 3 in Los Angeles, already Oct 4 in New York and UTC.
    EVENING = Time.utc(2026, 10, 4, 2)

    setup do
      @player_id = SecureRandom.uuid
      @headers = { "X-Player-Id" => @player_id }
    end

    test "the first start of the day is ranked; every later one is practice on the same deal" do
      travel_to EVENING do
        first = start_daily
        assert_response :created
        assert first.fetch("ranked")
        assert_equal "2026-10-03", first.fetch("date")
        assert_equal 1, first.fetch("number")
        assert_equal "2026-10-04T00:00:00-07:00", first.fetch("next_at")
        game = SoloGame.find(first.fetch("game_id"))
        assert_equal Date.new(2026, 10, 3), game.daily_on
        assert_equal first.fetch("seed"), game.seed.to_i

        again = start_daily
        assert_response :ok
        refute again.fetch("ranked")
        assert_nil again.fetch("game_id")
        assert_equal first.fetch("seed"), again.fetch("seed")
        assert_equal 1, SoloGame.where(player_id: @player_id).count

        other = start_daily(headers: { "X-Player-Id" => SecureRandom.uuid })
        assert other.fetch("ranked")
        assert_equal first.fetch("seed"), other.fetch("seed"), "everyone plays the same deal"

        get "/api/daily", headers: @headers
        assert_response :success
        me = JSON.parse(response.body).fetch("me")
        assert_equal({ "attempted" => true, "streak" => 0, "result" => nil }, me)
      end

      travel_to Time.utc(2026, 10, 4, 7) do
        tomorrow = start_daily
        assert_response :created
        assert tomorrow.fetch("ranked"), "a new day brings a new ranked try"
        assert_equal "2026-10-04", tomorrow.fetch("date")
        assert_equal 2, tomorrow.fetch("number")
      end
    end

    test "a finished ranked daily is verified, ranked, extends the streak and stays off the solo boards" do
      travel_to EVENING do
        create_daily_score(Date.new(2026, 10, 2), elapsed_ms: 50_000, player_id: @player_id)
        game = SoloGame.find(start_daily.fetch("game_id"))
        events = play_to_completion(game.seed.to_i)
        elapsed_ms = events.last.fetch(:t_ms)
        game.update!(started_at: (elapsed_ms / 1000.0 + 5).seconds.ago)
        create_daily_score(Date.new(2026, 10, 3), elapsed_ms: elapsed_ms - 1_000)

        post "/api/solo/scores",
          headers: @headers,
          params: { game_id: game.id, elapsed_ms: elapsed_ms, events: events, misses: 3, display_name: "Daily" },
          as: :json
        assert_response :success
        assert_equal({ "date" => "2026-10-03", "number" => 2, "rank" => 2, "total" => 2, "streak" => 2 }, JSON.parse(response.body).fetch("daily"))
        score = game.reload.solo_score
        assert_equal [Date.new(2026, 10, 3), 3], [score.daily_on, score.misses]

        get "/api/daily", headers: @headers
        status = JSON.parse(response.body)
        assert_equal 2, status.fetch("total")
        assert_equal [elapsed_ms - 1_000, elapsed_ms], status.fetch("leaderboard").map { |entry| entry.fetch("elapsed_ms") }
        assert_equal({ "player_id" => @player_id, "display_name" => "Daily", "misses" => 3 }, status.fetch("leaderboard").last.slice("player_id", "display_name", "misses"))
        assert_equal(
          { "attempted" => true, "streak" => 2, "result" => { "elapsed_ms" => elapsed_ms, "misses" => 3, "claim_ms" => events.map { |e| e[:t_ms] }, "rank" => 2, "total" => 2 } },
          status.fetch("me")
        )

        get "/api/solo/leaderboard", params: { period: "daily" }, headers: @headers
        assert_empty JSON.parse(response.body).fetch("entries")
        get "/api/solo/personal_bests", headers: @headers
        assert_equal({ "daily" => nil, "weekly" => nil, "monthly" => nil, "all_time" => nil }, JSON.parse(response.body))
      end
    end

    test "starting solo games never expires an unfinished ranked daily" do
      daily_id = start_daily.fetch("game_id")
      (SoloGame::MAX_OPEN_PER_PLAYER + 2).times do
        post "/api/solo/games", headers: @headers
        assert_response :created
      end
      assert_equal "open", SoloGame.find(daily_id).status
    end

    private

    def start_daily(headers: @headers)
      post "/api/daily/games", headers: headers
      JSON.parse(response.body)
    end

    def create_daily_score(date, elapsed_ms:, player_id: SecureRandom.uuid)
      game = SoloGame.create!(id: SecureRandom.uuid, player_id: player_id, seed: "1", status: "completed", started_at: Time.current, daily_on: date)
      SoloScore.create!(solo_game: game, player_id: player_id, elapsed_ms: elapsed_ms, completed_at: Time.current, daily_on: date, misses: 0)
    end
  end
end
