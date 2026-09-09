# frozen_string_literal: true

require "test_helper"

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
      assert_equal({ "daily" => true, "weekly" => true, "monthly" => true }, result.fetch("is_personal_best"))
      assert_equal({ "daily" => elapsed_ms, "weekly" => elapsed_ms, "monthly" => elapsed_ms, "all_time" => elapsed_ms }, result.fetch("personal_bests"))
      assert_equal "completed", game.reload.status

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

    private

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

    # Plays the whole deal with the server-side simulator, claiming the first
    # available set each turn, and returns the claim events a client would send.
    def play_to_completion(seed)
      sim = SoloReplay::Simulator.new(seed)
      events = []
      t_ms = 0
      100.times do
        break if sim.finished?

        set = sim.board.combination(3).find { |a, b, c| Rules.is_set?(a, b, c) }
        flunk "no set found on board during replay" unless set

        t_ms += 1_500
        set.sort!
        sim.apply_claim!(set)
        events << { type: "claim", cards: set, t_ms: t_ms }
      end
      assert sim.finished?, "simulated game should reach round_over"
      events
    end
  end
end
