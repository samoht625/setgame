# frozen_string_literal: true

require "test_helper"

module Api
  class PuzzleControllerTest < ActionDispatch::IntegrationTest
    NOON = Time.utc(2026, 10, 25, 19)

    setup do
      @player_id = SecureRandom.uuid
      @headers = { "X-Player-Id" => @player_id }
    end

    def start(headers: @headers)
      post "/api/puzzle/games", headers: headers, as: :json
      JSON.parse(response.body)
    end

    def claims_for(cards, step_ms: 2_000)
      ClassicPuzzle.sets_in(cards).each_with_index.map { |set, i| { cards: set, t_ms: (i + 1) * step_ms } }
    end

    test "a player finds all six sets and lands on the leaderboard" do
      travel_to NOON do
        started = start
        assert_response :created
        assert_equal 1, started.fetch("number")
        assert_equal 12, started.fetch("cards").length
        assert_equal [], started.fetch("found")

        claims = claims_for(started.fetch("cards"))
        post "/api/puzzle/games/#{started["game_id"]}/progress", params: { claims: claims.first(2) }, headers: @headers, as: :json
        assert_response :no_content

        # A reload (or a wiped browser) resumes the same run with its finds.
        resumed = start
        assert_response :ok
        assert_equal started.fetch("game_id"), resumed.fetch("game_id")
        assert_equal 2, resumed.fetch("found").length

        travel 20.seconds
        post "/api/puzzle/games/#{started["game_id"]}/finish",
             params: { elapsed_ms: 13_000, claims: claims, misses: 1, display_name: "Rose" }, headers: @headers, as: :json
        assert_response :success
        result = JSON.parse(response.body).fetch("result")
        assert_equal 13_000, result.fetch("elapsed_ms")
        assert_equal 1, result.fetch("rank")

        get "/api/puzzle", headers: @headers
        status = JSON.parse(response.body)
        assert_equal 1, status.fetch("total")
        assert_equal "Rose", status.fetch("leaderboard").first.fetch("display_name")
        assert_equal 1, status.dig("me", "streak")
        assert status.dig("me", "attempted")

        start
        assert_response :conflict
      end
    end

    test "a run that misses a set, repeats one or claims an impossible time is refused" do
      travel_to NOON do
        started = start
        claims = claims_for(started.fetch("cards"))
        id = started.fetch("game_id")
        travel 30.seconds

        post "/api/puzzle/games/#{id}/finish", params: { elapsed_ms: 12_000, claims: claims.first(5) }, headers: @headers, as: :json
        assert_response :unprocessable_entity

        post "/api/puzzle/games/#{id}/finish", params: { elapsed_ms: 12_000, claims: claims.first(5) + [claims.first] }, headers: @headers, as: :json
        assert_response :unprocessable_entity

        post "/api/puzzle/games/#{id}/finish", params: { elapsed_ms: 600_000, claims: claims }, headers: @headers, as: :json
        assert_response :unprocessable_entity
        assert_equal "invalid_time", JSON.parse(response.body).fetch("error")

        post "/api/puzzle/games/#{id}/finish", params: { elapsed_ms: 12_000, claims: claims }, headers: { "X-Player-Id" => SecureRandom.uuid }, as: :json
        assert_response :not_found
      end
    end

    test "everyone gets the same board" do
      travel_to NOON do
        a = start
        b = start(headers: { "X-Player-Id" => SecureRandom.uuid })
        assert_equal a.fetch("cards"), b.fetch("cards")
      end
    end
  end
end
