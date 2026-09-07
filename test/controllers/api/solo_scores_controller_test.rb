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
      assert JSON.parse(response.body).fetch("ok")
      assert_equal "completed", game.reload.status

      get "/api/solo/leaderboard", params: { period: "daily" }, headers: @headers
      assert_response :success
      entries = JSON.parse(response.body).fetch("entries")
      entry = entries.find { |e| e["player_id"] == @player_id }
      assert entry, "submitted score should appear on the daily leaderboard"
      assert_equal elapsed_ms, entry["elapsed_ms"]
    end

    private

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
        sim.apply_claim!(set)
        events << { type: "claim", cards: set.sort, t_ms: t_ms }
      end
      assert sim.finished?, "simulated game should reach round_over"
      events
    end
  end
end
