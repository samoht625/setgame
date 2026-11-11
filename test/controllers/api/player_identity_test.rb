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

    test "a brand-new browser's first page mints its player" do
      reset!
      get "/"
      minted = css_select("meta[name='setgame-player-id']").first&.[]("content")
      assert PlayerResolver.uuid?(minted)
      assert_select "meta[name='setgame-player-key'][content=?]", PlayerKey.for(minted)
      assert_select "meta[name='setgame-player-new'][content='1']"

      # The cookie now names it, so the next page isn't a new player.
      get "/"
      assert_select "meta[name='setgame-player-id'][content=?]", minted
      assert_select "meta[name='setgame-player-new']", false
      get "/api/daily", headers: { "X-Player-Id" => minted, "X-Player-Key" => nil }
      assert_equal minted, response.headers["X-Player-Id"]
    end

    test "an id the server hasn't seen isn't taken on the browser's word" do
      reset!
      made_up = SecureRandom.uuid
      get "/api/daily", headers: { "X-Player-Id" => made_up, "X-Player-Key" => nil }
      refute_equal made_up, response.headers["X-Player-Id"]
      assert_equal PlayerKey.for(response.headers["X-Player-Id"]), response.headers["X-Player-Key"]
    end

    test "a multiplayer-only player's public id doesn't let an impostor play as them" do
      # Rose has only played multiplayer, so nothing in the database names her,
      # but her id is in the presence list and the game state.
      reset!
      get "/api/daily", headers: { "X-Player-Id" => @rose, "X-Player-Key" => nil }
      refute_equal @rose, response.headers["X-Player-Id"]
      refute_equal PlayerKey.for(@rose), response.headers["X-Player-Key"]
    end
  end
end
