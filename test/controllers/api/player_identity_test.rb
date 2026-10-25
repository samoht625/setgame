# frozen_string_literal: true

require "test_helper"

module Api
  # A browser whose storage was wiped mints a new id; the cookie that still
  # names the old player must win instead of being overwritten.
  class PlayerIdentityTest < ActionDispatch::IntegrationTest
    setup do
      @rose = SecureRandom.uuid
      get "/api/daily", headers: { "X-Player-Id" => @rose }
      assert_equal @rose, response.headers["X-Player-Id"]
    end

    test "a freshly minted id doesn't clobber the player the cookie names" do
      stranger = SecureRandom.uuid
      get "/api/puzzle", headers: { "X-Player-Id" => stranger, "X-Player-New" => "1" }
      assert_response :success
      assert_equal @rose, response.headers["X-Player-Id"]

      # The cookie still names Rose afterwards.
      get "/api/puzzle"
      assert_equal @rose, response.headers["X-Player-Id"]
    end

    test "an established id from the browser still wins over the cookie" do
      other = SecureRandom.uuid
      get "/api/puzzle", headers: { "X-Player-Id" => other }
      assert_equal other, response.headers["X-Player-Id"]
    end

    test "pages hand the cookie's player and name back to a browser that forgot them" do
      score_game = SoloGame.create!(id: SecureRandom.uuid, player_id: @rose, seed: "1", status: "completed", started_at: 1.hour.ago)
      SoloScore.create!(solo_game: score_game, player_id: @rose, display_name: "Rose", elapsed_ms: 90_000, completed_at: 1.hour.ago)

      %w[/ /daily /puzzle /practice /m].each do |path|
        get path
        assert_response :success
        assert_select "meta[name='setgame-player-id'][content=?]", @rose
        assert_select "meta[name='setgame-player-name'][content='Rose']"
      end
    end

    test "a brand-new browser gets no identity hint" do
      reset!
      get "/"
      assert_select "meta[name='setgame-player-id']", false
    end
  end
end
