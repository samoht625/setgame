# frozen_string_literal: true

require "test_helper"

module Api
  class SoloGamesControllerTest < ActionDispatch::IntegrationTest
    setup do
      @player_id = SecureRandom.uuid
      @headers = { "X-Player-Id" => @player_id }
    end

    test "abandoned open games never lock a player out of new leaderboard games" do
      game_ids = (SoloGame::MAX_OPEN_PER_PLAYER + 2).times.map do
        post "/api/solo/games", headers: @headers
        assert_response :created
        JSON.parse(response.body).fetch("game_id")
      end

      open = SoloGame.open_games.where(player_id: @player_id)
      assert_operator open.count, :<=, SoloGame::MAX_OPEN_PER_PLAYER

      # The newest game (the one the player is actually playing) stays open;
      # the oldest abandoned ones are expired to make room.
      assert_includes open.pluck(:id), game_ids.last
      assert_equal "expired", SoloGame.find(game_ids.first).status
    end

    test "abandoning excess games only touches that player's games" do
      other_player = SecureRandom.uuid
      post "/api/solo/games", headers: { "X-Player-Id" => other_player }
      assert_response :created
      other_game_id = JSON.parse(response.body).fetch("game_id")

      (SoloGame::MAX_OPEN_PER_PLAYER + 1).times do
        post "/api/solo/games", headers: @headers
        assert_response :created
      end

      assert_equal "open", SoloGame.find(other_game_id).status
    end
  end
end
