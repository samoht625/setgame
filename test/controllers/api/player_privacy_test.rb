# frozen_string_literal: true

require "test_helper"

module Api
  # Player ids are public on every leaderboard, so knowing one must not let
  # anyone read that player's result and share token, or play as them.
  class PlayerPrivacyTest < ActionDispatch::IntegrationTest
    NOON = Time.utc(2026, 10, 20, 19)

    setup do
      @rose = SecureRandom.uuid
      travel_to NOON do
        game = SoloGame.create!(id: SecureRandom.uuid, player_id: @rose, seed: "1", status: "completed", started_at: 2.hours.ago, completed_at: 1.hour.ago, daily_on: Date.new(2026, 10, 20))
        SoloScore.create!(solo_game: game, player_id: @rose, display_name: "Rose", elapsed_ms: 80_000, completed_at: 1.hour.ago, daily_on: Date.new(2026, 10, 20))
        PuzzleRun.create!(id: SecureRandom.uuid, player_id: @rose, puzzle_on: Date.new(2026, 10, 20), cards: ClassicPuzzle.new(Date.new(2026, 10, 20)).cards,
                          started_at: 2.hours.ago, completed_at: 1.hour.ago, elapsed_ms: 40_000, display_name: "Rose")
      end
    end

    test "an impostor sending only Rose's public id gets their own empty status" do
      travel_to NOON do
        %w[/api/daily /api/puzzle].each do |path|
          get path, headers: { "X-Player-Id" => @rose, "X-Player-Key" => nil }
          assert_response :success
          body = JSON.parse(response.body)
          assert_includes body.fetch("leaderboard").map { |e| e.fetch("player_id") }, @rose, "the id is public"
          refute_equal @rose, response.headers["X-Player-Id"]
          assert_nil body.dig("me", "result"), "#{path} leaks nobody's result"
          assert_equal false, body.dig("me", "attempted")
        end

        post "/api/daily/games", headers: { "X-Player-Id" => @rose, "X-Player-Key" => nil }
        assert_response :created, "the impostor plays as a new player"
        assert_equal 1, SoloGame.where(player_id: @rose).count, "Rose's try isn't touched"
      end
    end

    test "a wrong key is no better than none" do
      travel_to NOON do
        get "/api/daily", headers: { "X-Player-Id" => @rose, "X-Player-Key" => "0" * 40 }
        refute_equal @rose, response.headers["X-Player-Id"]
      end
    end

    test "Rose's own browser, by cookie or by key, still sees her result" do
      travel_to NOON do
        get "/api/daily", headers: { "X-Player-Id" => @rose }
        assert_equal @rose, response.headers["X-Player-Id"]
        key = response.headers["X-Player-Key"]
        assert_equal PlayerKey.for(@rose), key
        assert_equal 80_000, JSON.parse(response.body).dig("me", "result", "elapsed_ms")

        # Cookie only (no key header): the signed cookie proves it.
        get "/api/puzzle", headers: { "X-Player-Id" => @rose, "X-Player-Key" => nil }
        assert_equal @rose, response.headers["X-Player-Id"]
        assert_equal 40_000, JSON.parse(response.body).dig("me", "result", "elapsed_ms")

        # Key only (cookie gone).
        reset!
        get "/api/puzzle", headers: { "X-Player-Id" => @rose, "X-Player-Key" => key }
        assert_equal @rose, response.headers["X-Player-Id"]
        assert JSON.parse(response.body).dig("me", "result", "share_token").present?
      end
    end

    test "the player cookie is HttpOnly and SameSite" do
      get "/api/daily", headers: { "X-Player-Id" => SecureRandom.uuid }
      cookie = Array(response.headers["Set-Cookie"]).join("\n")
      assert_match(/player_id=/, cookie)
      assert_match(/httponly/i, cookie)
      assert_match(/samesite=lax/i, cookie)
    end
  end
end
