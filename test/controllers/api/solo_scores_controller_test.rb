# frozen_string_literal: true

require "test_helper"
require "minitest/mock"

module Api
  class SoloScoresControllerTest < ActionDispatch::IntegrationTest
    setup do
      @player_id = SecureRandom.uuid
      @headers = { "X-Player-Id" => @player_id }
    end

    test "a finished replay is accepted and shows up on the daily leaderboard" do
      post "/api/solo/games", headers: @headers
      assert_response :created
      body = JSON.parse(response.body)
      game = SoloGame.find(body.fetch("game_id"))

      events = play_to_completion(game.seed.to_i)
      elapsed_ms = events.last.fetch(:t_ms)

      # The test replays instantly; backdate the start so the (correct)
      # wall-clock anti-cheat check passes like it would for a real run.
      game.update!(started_at: (elapsed_ms / 1000.0 + 5).seconds.ago)

      post "/api/solo/scores",
        headers: @headers,
        params: { game_id: game.id, elapsed_ms: elapsed_ms, events: events, display_name: "Tester" },
        as: :json
      assert_response :success
      result = JSON.parse(response.body)
      assert result.fetch("ok")
      assert_nil result.fetch("previous_best_ms"), "a first run has nothing to beat"
      assert_equal({ "daily" => true, "weekly" => true, "monthly" => true }, result.fetch("is_personal_best"))
      assert_equal({ "daily" => elapsed_ms, "weekly" => elapsed_ms, "monthly" => elapsed_ms, "all_time" => elapsed_ms }, result.fetch("personal_bests"))
      assert_equal "completed", game.reload.status
      assert_equal events.length, game.sets_found

      get "/api/solo/leaderboard", params: { period: "daily" }, headers: @headers
      assert_response :success
      entries = JSON.parse(response.body).fetch("entries")
      entry = entries.find { |e| e["player_id"] == @player_id }
      assert entry, "submitted score should appear on the daily leaderboard"
      assert_equal elapsed_ms, entry["elapsed_ms"]
    end

    test "leaderboard summaries omit replay data without changing order or limits" do
      travel_to Time.zone.local(2026, 9, 9, 12) do
        later = create_score(elapsed_ms: 60_000, completed_at: 1.hour.ago, created_at: 4.hours.ago)
        earlier = create_score(elapsed_ms: 60_000, completed_at: 2.hours.ago, created_at: 3.hours.ago)
        create_score(elapsed_ms: 70_000, completed_at: 3.hours.ago)
        create_score(elapsed_ms: 30_000, completed_at: 1.month.ago, player_id: SecureRandom.uuid)

        rows = SoloScore.leaderboard(period: "daily", limit: 2).to_a
        assert_equal [earlier.id, later.id], rows.map(&:id)
        rows.each { |score| assert_summary_columns(score) }
        assert_equal earlier.id, SoloScore.personal_best(player_id: @player_id, period: "daily").id
        assert_equal later.id, SoloScore.personal_bests(player_id: @player_id).fetch(:all_time).id

        get "/api/solo/leaderboard", params: { period: "daily", limit: 2 }, headers: @headers
        assert_response :success
        entries = JSON.parse(response.body).fetch("entries")
        assert_equal [earlier.completed_at.iso8601, later.completed_at.iso8601], entries.map { |entry| entry.fetch("completed_at") }
        assert_equal [60_000, 60_000], entries.map { |entry| entry.fetch("elapsed_ms") }
      end
    end

    test "personal best summaries project each period without loading replay data" do
      travel_to Time.zone.local(2026, 9, 9, 12) do
        expected = {
          daily: create_score(elapsed_ms: 80_000, completed_at: 1.hour.ago),
          weekly: create_score(elapsed_ms: 70_000, completed_at: 2.days.ago),
          monthly: create_score(elapsed_ms: 60_000, completed_at: 7.days.ago),
          all_time: create_score(elapsed_ms: 50_000, completed_at: 1.month.ago)
        }
        create_score(elapsed_ms: 10_000, completed_at: 1.hour.ago, player_id: SecureRandom.uuid)

        summaries = SoloScore.personal_bests(player_id: @player_id)
        expected.each do |period, score|
          assert_equal score.id, summaries.fetch(period).id
          assert_summary_columns(summaries.fetch(period))
        end

        get "/api/solo/personal_bests", headers: @headers
        assert_response :success
        body = JSON.parse(response.body)
        expected.each do |period, score|
          entry = body.fetch(period.to_s)
          assert_equal score.elapsed_ms, entry.fetch("elapsed_ms")
          assert_equal @player_id, entry.fetch("player_id")
          assert_equal %w[completed_at display_name elapsed_ms player_id], entry.keys.sort
        end
      end
    end

    test "the practice day, week and month turn over at midnight Pacific, with the dailies" do
      # Sunday, Nov 15, 2026. 8:30 PM Pacific is 11:30 PM in New York, where the
      # day (and the week) used to end; 11:30 PM Pacific is 07:30 UTC on Monday.
      evening = create_score(elapsed_ms: 70_000, completed_at: pacific(2026, 11, 15, 20, 30))
      late = create_score(elapsed_ms: 60_000, completed_at: pacific(2026, 11, 15, 23, 30))
      periods = ->(now) { travel_to(now) { SoloScore::PERIODS.to_h { |period| [period, SoloScore.leaderboard(period: period).map(&:id)] } } }

      before_midnight = periods.call(pacific(2026, 11, 15, 23, 55))
      assert_equal({ "daily" => [late.id, evening.id], "weekly" => [late.id, evening.id], "monthly" => [late.id, evening.id] }, before_midnight,
        "five to midnight Pacific on Sunday: still today, and still this week")
      travel_to pacific(2026, 11, 15, 23, 55) do
        assert_equal Date.new(2026, 11, 15), DailyPuzzle.today.date, "the same day as the dailies'"
        get "/api/solo/leaderboard", params: { period: "daily" }, headers: @headers
        assert_equal [60_000, 70_000], JSON.parse(response.body).fetch("entries").map { |entry| entry.fetch("elapsed_ms") }
        assert_equal late.id, SoloScore.personal_best(player_id: @player_id, period: "daily").id
      end
      # Whatever zone the app or the server is set to.
      %w[UTC America/New_York Asia/Tokyo].each do |zone|
        Time.use_zone(zone) { assert_equal before_midnight, periods.call(pacific(2026, 11, 15, 23, 55)), "with the app in #{zone}" }
      end

      assert_equal({ "daily" => [], "weekly" => [], "monthly" => [late.id, evening.id] }, periods.call(pacific(2026, 11, 16, 0, 5)),
        "past midnight on Monday: a new day and a new week, the same month")
      travel_to pacific(2026, 11, 16, 0, 5) do
        assert_nil SoloScore.personal_best(player_id: @player_id, period: "daily")
        get "/api/solo/leaderboard", params: { period: "weekly" }, headers: @headers
        assert_equal [], JSON.parse(response.body).fetch("entries")
      end

      early = create_score(elapsed_ms: 50_000, completed_at: pacific(2026, 11, 16, 0, 30))
      assert_equal({ "daily" => [early.id], "weekly" => [early.id], "monthly" => [early.id, late.id, evening.id] }, periods.call(pacific(2026, 11, 16, 0, 35)))

      # The month: 11:30 PM on Nov 30 is November's; 12:30 AM on Dec 1 is December's.
      last = create_score(elapsed_ms: 40_000, completed_at: pacific(2026, 11, 30, 23, 30))
      assert_includes periods.call(pacific(2026, 11, 30, 23, 55)).fetch("monthly"), last.id
      assert_equal({ "daily" => [], "weekly" => [last.id], "monthly" => [] }, periods.call(pacific(2026, 12, 1, 0, 5)), "Nov 30 was a Monday: the week runs on")
    end

    test "a practice day is midnight to midnight Pacific, in daylight time too" do
      day = SoloScore.period_range("daily", Time.utc(2026, 11, 16, 7, 55))
      assert_equal [Time.utc(2026, 11, 15, 8), Time.utc(2026, 11, 16, 8)], [day.begin.utc, day.end.utc.round]
      # The day the clocks go back is 25 hours long.
      long = SoloScore.period_range("daily", Time.utc(2026, 11, 1, 20))
      assert_equal [Time.utc(2026, 11, 1, 7), Time.utc(2026, 11, 2, 8)], [long.begin.utc, long.end.utc.round]
      summer = SoloScore.period_range("daily", Time.utc(2026, 10, 4, 6, 59))
      assert_equal [Time.utc(2026, 10, 3, 7), Time.utc(2026, 10, 4, 7)], [summer.begin.utc, summer.end.utc.round]

      week = SoloScore.period_range("weekly", Time.utc(2026, 11, 16, 7, 55))
      assert_equal [Time.utc(2026, 11, 9, 8), Time.utc(2026, 11, 16, 8)], [week.begin.utc, week.end.utc.round], "Monday to Sunday"
      month = SoloScore.period_range("monthly", Time.utc(2026, 12, 1, 7, 55))
      assert_equal [Time.utc(2026, 11, 1, 7), Time.utc(2026, 12, 1, 8)], [month.begin.utc, month.end.utc.round], "November, which starts in daylight time"
      assert_raises(ArgumentError) { SoloScore.period_range("yearly") }
    end

    test "a finished run reports the player's previous all-time practice best" do
      create_score(elapsed_ms: 90_000, completed_at: 2.months.ago)
      create_score(elapsed_ms: 120_000, completed_at: 1.hour.ago)
      create_score(elapsed_ms: 10_000, completed_at: 1.hour.ago, player_id: SecureRandom.uuid)
      create_score(elapsed_ms: 20_000, completed_at: 1.hour.ago).update!(daily_on: Date.current)

      result = finish_run(@headers)
      assert_equal 90_000, result.fetch("previous_best_ms"), "older than this month, but not another player's or a Daily Deal time"
      assert_equal [result.dig("score", "elapsed_ms"), 90_000].min, result.dig("personal_bests", "all_time")
    end

    test "a signed-in browser compares against the account's best from every device" do
      account_player = SecureRandom.uuid
      Account.create!(email: "tido@example.com", player_id: account_player)
      create_score(elapsed_ms: 144_000, completed_at: 1.hour.ago, player_id: account_player)

      phone = SecureRandom.uuid
      get "/api/daily", headers: { "X-Player-Id" => phone }
      post "/api/sign_in", params: { email: "tido@example.com" }, headers: { "X-Player-Id" => phone }, as: :json
      token = CGI.unescape(SignInMailer.deliveries.last[:text][/token=([\w\-%]+)/, 1])
      post "/signin", params: { token: token }
      assert_response :see_other

      result = finish_run({ "X-Player-Id" => phone })
      assert_equal account_player, result.dig("score", "player_id")
      assert_equal 144_000, result.fetch("previous_best_ms")
    end

    test "malformed and oversized event payloads return 422 instead of 500" do
      post "/api/solo/games", headers: @headers
      game = SoloGame.find(JSON.parse(response.body).fetch("game_id"))
      game.update!(started_at: 2.minutes.ago)

      [
        "not-an-array",
        ["x", 123, nil],
        [{ type: "claim", cards: "bad", t_ms: {} }],
        Array.new(SoloGame::MAX_SETS + 50) { |i| { type: "claim", cards: [1, 2, 3], t_ms: (i + 1) * 1_500 } }
      ].each do |bad_events|
        post "/api/solo/scores",
          headers: @headers,
          params: { game_id: game.id, elapsed_ms: 40_000, events: bad_events },
          as: :json
        assert_response :unprocessable_entity
      end
    end

    test "duplicate score race returns 422 already_completed and rolls back on failure" do
      post "/api/solo/games", headers: @headers
      game = SoloGame.find(JSON.parse(response.body).fetch("game_id"))
      events = play_to_completion(game.seed.to_i)
      elapsed_ms = events.last.fetch(:t_ms)
      game.update!(started_at: (elapsed_ms / 1000.0 + 5).seconds.ago)

      SoloScore.stub(:create!, ->(**_) { raise ActiveRecord::RecordNotUnique, "duplicate solo_game_id" }) do
        post "/api/solo/scores",
          headers: @headers,
          params: { game_id: game.id, elapsed_ms: elapsed_ms, events: events },
          as: :json
        assert_response :unprocessable_entity
        assert_equal "already_completed", JSON.parse(response.body).fetch("error")
      end
      assert_equal "open", game.reload.status

      failing_game = SoloGame.find(game.id)
      failing_game.define_singleton_method(:mark_completed!) { |**_| raise ActiveRecord::RecordInvalid.new(self) }
      SoloGame.stub(:find_by, failing_game) do
        post "/api/solo/scores",
          headers: @headers,
          params: { game_id: game.id, elapsed_ms: elapsed_ms, events: events },
          as: :json
        assert_response :unprocessable_entity
      end
      assert_equal 0, SoloScore.where(solo_game_id: game.id).count, "transaction rolls back SoloScore when mark_completed! fails"
    end

    private

    def finish_run(headers)
      post "/api/solo/games", headers: headers
      assert_response :created
      game = SoloGame.find(JSON.parse(response.body).fetch("game_id"))
      events = play_to_completion(game.seed.to_i)
      elapsed_ms = events.last.fetch(:t_ms)
      game.update!(started_at: (elapsed_ms / 1000.0 + 5).seconds.ago)
      post "/api/solo/scores", headers: headers, params: { game_id: game.id, elapsed_ms: elapsed_ms, events: events }, as: :json
      assert_response :success
      JSON.parse(response.body)
    end

    def pacific(*args)
      ActiveSupport::TimeZone[DailyPuzzle::TIME_ZONE].local(*args)
    end

    def create_score(elapsed_ms:, completed_at:, player_id: @player_id, created_at: completed_at)
      game = SoloGame.create!(
        id: SecureRandom.uuid,
        player_id: player_id,
        seed: "123",
        status: "completed",
        started_at: completed_at - 5.minutes
      )
      SoloScore.create!(
        solo_game: game,
        player_id: player_id,
        display_name: "Tester",
        elapsed_ms: elapsed_ms,
        completed_at: completed_at,
        created_at: created_at,
        events: Array.new(27) { { type: "claim", cards: [1, 2, 3], t_ms: 1500 } }
      )
    end

    def assert_summary_columns(score)
      assert_equal %w[completed_at display_name elapsed_ms id player_id], score.attributes.keys.sort
      refute score.has_attribute?(:events)
    end
  end
end
