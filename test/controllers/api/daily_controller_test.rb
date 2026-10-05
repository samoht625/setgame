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

    test "each player gets one try at the day's deal" do
      travel_to EVENING do
        first = start_daily
        assert_response :created
        assert_equal "2026-10-03", first.fetch("date")
        assert_equal 1, first.fetch("number")
        assert_equal "2026-10-04T00:00:00-07:00", first.fetch("next_at")
        game = SoloGame.find(first.fetch("game_id"))
        assert_equal Date.new(2026, 10, 3), game.daily_on
        assert_equal first.fetch("seed"), game.seed.to_i

        again = start_daily
        assert_response :conflict
        assert_equal "already_played", again.fetch("error")
        assert_equal 1, again.fetch("number")
        refute again.key?("seed"), "no second deal once today's try is used"
        assert_equal 1, SoloGame.where(player_id: @player_id).count

        other = start_daily(headers: { "X-Player-Id" => SecureRandom.uuid })
        assert_response :created
        assert_equal first.fetch("seed"), other.fetch("seed"), "everyone plays the same deal"

        get "/api/daily", headers: @headers
        assert_response :success
        me = JSON.parse(response.body).fetch("me")
        assert_equal({ "attempted" => true, "streak" => 0, "result" => nil }, me)
      end

      travel_to Time.utc(2026, 10, 4, 7) do
        tomorrow = start_daily
        assert_response :created, "a new day brings a new try"
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
        assert_equal({ "player_id" => @player_id, "display_name" => "Daily", "misses" => 3, "replay" => true },
                     status.fetch("leaderboard").last.slice("player_id", "display_name", "misses", "replay"))
        assert_equal false, status.fetch("leaderboard").first.fetch("replay"), "a score without claim timing has no replay"
        assert_equal(
          { "attempted" => true, "streak" => 2, "result" => { "display_name" => "Daily", "elapsed_ms" => elapsed_ms, "misses" => 3, "rank" => 2, "total" => 2,
                                                         "share_token" => DailyShare.token(number: 2, elapsed_ms: elapsed_ms), "replay" => true } },
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

    test "a player can put a name on their own score for today, and only their own" do
      travel_to EVENING do
        mine = create_daily_score(Date.new(2026, 10, 3), elapsed_ms: 40_000, player_id: @player_id)
        theirs = create_daily_score(Date.new(2026, 10, 3), elapsed_ms: 30_000)
        yesterday = create_daily_score(Date.new(2026, 10, 2), elapsed_ms: 30_000, player_id: @player_id)

        rename(mine.solo_game_id, "  Tido  C ")
        assert_response :success
        assert_equal({ "ok" => true, "display_name" => "Tido C" }, JSON.parse(response.body))
        assert_equal "Tido C", mine.reload.display_name

        get "/api/daily", headers: @headers
        assert_equal ["Tido C"], JSON.parse(response.body).fetch("leaderboard").select { |e| e["player_id"] == @player_id }.map { |e| e["display_name"] }
        assert_equal "Tido C", JSON.parse(response.body).dig("me", "result", "display_name")

        # Someone else's score: knowing their (public) player id isn't enough without the game id.
        rename(theirs.solo_game_id, "Hijack")
        assert_response :not_found
        rename(mine.solo_game_id, "Hijack", headers: { "X-Player-Id" => theirs.player_id })
        assert_response :not_found
        rename(nil, "Hijack", headers: { "X-Player-Id" => theirs.player_id })
        assert_response :not_found
        assert_nil theirs.reload.display_name

        # Only today's score.
        rename(yesterday.solo_game_id, "Late")
        assert_response :not_found
        assert_nil yesterday.reload.display_name

        ["", "   ", "<b>hi</b>", "a" * 21, "Tido!", "😀"].each do |bad|
          rename(mine.solo_game_id, bad)
          assert_response :unprocessable_entity, bad.inspect
          assert_equal "invalid_name", JSON.parse(response.body).fetch("error")
        end
        assert_equal "Tido C", mine.reload.display_name
      end
    end

    test "a finisher can replay their run against another finisher's from the day's leaderboard" do
      travel_to EVENING do
        game = SoloGame.find(start_daily.fetch("game_id"))
        seed = game.seed.to_i
        events = play_to_completion(seed)
        elapsed_ms = events.last.fetch(:t_ms)
        game.update!(started_at: (elapsed_ms / 1000.0 + 5).seconds.ago)
        post "/api/solo/scores", headers: @headers, params: { game_id: game.id, elapsed_ms: elapsed_ms, events: events, misses: 2 }, as: :json
        assert_response :success

        their_events = events.map { |e| e.merge(t_ms: e[:t_ms] - 400) }
        theirs = create_daily_score(Date.new(2026, 10, 3), elapsed_ms: elapsed_ms - 400, events: their_events, name: "Maya")

        get "/api/daily", headers: @headers
        assert_equal [true, true], JSON.parse(response.body).fetch("leaderboard").map { |entry| entry.fetch("replay") }

        compare(theirs.player_id)
        assert_response :success
        body = JSON.parse(response.body)
        assert_equal({ "date" => "2026-10-03", "number" => 1, "seed" => seed }, body.slice("date", "number", "seed"))
        stringify = ->(list) { list.map { |e| { "cards" => e[:cards], "t_ms" => e[:t_ms] } } }
        assert_equal({ "display_name" => nil, "elapsed_ms" => elapsed_ms, "rank" => 2, "claims" => stringify.call(events) }, body.fetch("me"))
        assert_equal({ "display_name" => "Maya", "elapsed_ms" => elapsed_ms - 400, "rank" => 1, "claims" => stringify.call(their_events) }, body.fetch("them"))
      end
    end

    test "claim timelines solve the deal, so they're only for players who have finished it" do
      travel_to EVENING do
        theirs = create_daily_score(Date.new(2026, 10, 3), elapsed_ms: 60_000, events: claim_events)

        compare(theirs.player_id)
        assert_response :forbidden, "a visitor who hasn't played"
        assert_equal({ "error" => "not_finished" }, JSON.parse(response.body))

        start_daily
        compare(theirs.player_id)
        assert_response :forbidden, "a player still in the middle of today's deal"
        refute_includes response.body, "claims"
      end
    end

    test "only runs on that day's public leaderboard can be compared" do
      travel_to EVENING do
        day = Date.new(2026, 10, 3)
        mine = create_daily_score(day, elapsed_ms: 50_000, events: claim_events, player_id: @player_id)
        DailyPuzzle::LEADERBOARD_SIZE.times { |i| create_daily_score(day, elapsed_ms: 40_000 + i, events: claim_events) }
        below_cut = create_daily_score(day, elapsed_ms: 90_000, events: claim_events)
        no_timing = create_daily_score(day, elapsed_ms: 1_000)
        untimed_claim = create_daily_score(day, elapsed_ms: 1_500, events: [{ "type" => "claim", "cards" => [1, 2, 3] }])
        yesterday = create_daily_score(day - 1, elapsed_ms: 30_000, events: claim_events)
        unfinished = SoloGame.create!(id: SecureRandom.uuid, player_id: SecureRandom.uuid, seed: "1", status: "open", started_at: Time.current, daily_on: day)

        [below_cut, no_timing, untimed_claim, yesterday, unfinished, mine].map(&:player_id).push("", SecureRandom.uuid).each do |id|
          compare(id)
          assert_response :not_found, id.inspect
          refute_includes response.body, "claims"
        end

        get "/api/daily", headers: @headers
        assert_equal false, JSON.parse(response.body).fetch("leaderboard").find { |e| e["player_id"] == no_timing.player_id }.fetch("replay")
      end
    end

    test "a card loaded before midnight still compares against the day it shows, and never a later day" do
      day = Date.new(2026, 10, 3)
      create_daily_score(day, elapsed_ms: 50_000, events: claim_events, player_id: @player_id)
      theirs = create_daily_score(day, elapsed_ms: 40_000, events: claim_events)

      travel_to Time.utc(2026, 10, 4, 8) do
        compare(theirs.player_id)
        assert_response :forbidden, "today is a new day the player hasn't finished"

        compare(theirs.player_id, date: "2026-10-03")
        assert_response :success
        assert_equal "2026-10-03", JSON.parse(response.body).fetch("date")

        compare(theirs.player_id, date: "2026-10-05")
        assert_response :bad_request
        compare(theirs.player_id, date: "yesterday")
        assert_response :bad_request
      end
    end

    private

    def compare(player_id, date: nil, headers: @headers)
      get "/api/daily/compare", headers: headers, params: { player_id: player_id, date: date }.compact
    end

    def claim_events
      [{ "type" => "claim", "cards" => [1, 2, 3], "t_ms" => 20_000 }, { "type" => "claim", "cards" => [4, 5, 6], "t_ms" => 40_000 }]
    end

    def rename(game_id, name, headers: @headers)
      patch "/api/daily/name", headers: headers, params: { game_id: game_id, display_name: name }, as: :json
    end


    def start_daily(headers: @headers)
      post "/api/daily/games", headers: headers
      JSON.parse(response.body)
    end

    def create_daily_score(date, elapsed_ms:, player_id: SecureRandom.uuid, events: [], name: nil)
      game = SoloGame.create!(id: SecureRandom.uuid, player_id: player_id, seed: DailyPuzzle.new(date).seed.to_s, status: "completed", started_at: Time.current, daily_on: date)
      SoloScore.create!(solo_game: game, player_id: player_id, display_name: name, elapsed_ms: elapsed_ms, completed_at: Time.current, daily_on: date, misses: 0,
                        events: events.map(&:deep_stringify_keys))
    end
  end
end
