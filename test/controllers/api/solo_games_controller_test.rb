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

    test "unfinished game progress is kept for its owner, only grows, and is capped" do
      post "/api/solo/games", headers: @headers
      game_id = JSON.parse(response.body).fetch("game_id")
      progress = ->(sets, headers: @headers) do
        post "/api/solo/games/#{game_id}/progress", params: { sets_found: sets }, headers: headers, as: :json
        assert_response :no_content
        SoloGame.find(game_id)
      end

      game = progress.call(4)
      assert_equal 4, game.sets_found
      assert_not_nil game.progress_at
      assert_equal 4, progress.call(2).sets_found
      assert_equal 4, progress.call(9, headers: { "X-Player-Id" => SecureRandom.uuid }).sets_found
      assert_equal SoloGame::MAX_SETS, progress.call(500).sets_found

      game.update!(status: "expired", sets_found: 3)
      assert_equal 5, progress.call(5).sets_found, "abandoned games still record how far they got"

      game.mark_completed!(sets_found: 24)
      assert_equal 24, progress.call(26).sets_found, "a verified finish is never overwritten"
    end
  end
end
